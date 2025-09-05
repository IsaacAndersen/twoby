import os
import uuid
import sqlite3
from typing import Optional, List, Dict, Any
from contextlib import contextmanager, asynccontextmanager

from fastapi import FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, field_validator

# Environment variables
RESULTS_PASSWORD = os.environ.get("RESULTS_PASSWORD", "dev-password")
DB_PATH = os.environ.get("DB_PATH", "/vol/db/app.db")
CORS_ALLOW_ORIGIN = os.environ.get("CORS_ALLOW_ORIGIN", "*")

# Allowed values (as specified in requirements)
ALLOWED_ROTATIONS = [
    "Continuity Clinic", "PHM", "Cardiology", "Renal/Pulm", "Heme/Endo", 
    "Oncology", "GI", "Neurology", "Emergency Department", "PICU", "NICU", 
    "CDU", "Behavioral Health", "Adolescent", "Infectious Diseases", 
    "Elective (other)", "RAC", "Research", "Boards/Step"
]
ALLOWED_TASKS = [
    "Answering clinical questions", "Finding evidence-based practices", 
    "Literature reviews", "Creating departs", "Translating departs", 
    "Creating patient messages", "Documentation", "Board prep", 
    "Role-play scenarios", "Procedural competency", "Mentorship", 
    "Applications", "Create graphics, presentations, tables", 
    "Statistical analyses", "Medical education", "Other"
]
ALLOWED_TOOLS = ["OpenEvidence", "ChatGPT", "Claude", "Perplexity", "Other"]
ALLOWED_TIME = ["<5m", "5-10", "10-20", "20-30", "30+"]
ALLOWED_VERIFY = ["Always", "Usually", "Sometimes", "Rarely", "Never"]

def load_anonymous_residents():
    """Load residents from file and anonymize names to First Name + Last Initial"""
    residents_file = os.path.join(os.path.dirname(__file__), "../residents.txt")
    residents = []
    
    try:
        with open(residents_file, 'r', encoding='utf-8') as f:
            for line in f:
                line = line.strip()
                if not line:  # Skip empty lines
                    continue
                    
                # Parse "First\tLast" format
                parts = line.split('\t')
                if len(parts) >= 2:
                    first_name = parts[0].strip()
                    last_name = parts[1].strip()
                    if first_name and last_name:
                        # Create anonymous format: "First L."
                        anonymous_name = f"{first_name} {last_name[0]}."
                        residents.append(anonymous_name)
        
        residents.sort()  # Sort alphabetically for consistent ordering
        return residents
        
    except FileNotFoundError:
        # Fallback to a few test names if file not found
        return ["Sara N.", "Laura S.", "Sophie H."]
    except Exception as e:
        print(f"Error loading residents: {e}")
        return ["Sara N.", "Laura S.", "Sophie H."]

# Load residents dynamically
RESIDENTS = load_anonymous_residents()

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    init_db()
    yield
    # Shutdown (if needed)

app = FastAPI(title="Resident AI Usage Survey API", lifespan=lifespan)

# Configure CORS
cors_origins = ["https://survey.ike.rs"]
# Add development origins
if os.environ.get("ENVIRONMENT") != "production":
    cors_origins.extend([
        "http://localhost:5173",
        "http://localhost:5174", 
        "http://127.0.0.1:5173",
        "http://127.0.0.1:5174",
        "https://localhost:5173"
    ])

# Allow custom origin if specified
if CORS_ALLOW_ORIGIN and CORS_ALLOW_ORIGIN != "*":
    cors_origins.append(CORS_ALLOW_ORIGIN)

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)

@contextmanager
def db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
    finally:
        conn.close()

def init_db():
    # Ensure database directory exists
    import os
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    
    with db() as conn:
        # Check if we need to add new columns
        cursor = conn.execute("PRAGMA table_info(submissions)")
        columns = [row[1] for row in cursor.fetchall()]
        
        conn.executescript("""
        PRAGMA journal_mode=WAL;
        CREATE TABLE IF NOT EXISTS submissions (
          id TEXT PRIMARY KEY,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          rotation TEXT NOT NULL,
          used_ai INTEGER NOT NULL CHECK (used_ai IN (0,1)),
          task TEXT NOT NULL,
          tool TEXT NOT NULL,
          tool_other TEXT,
          helpfulness INTEGER CHECK (helpfulness BETWEEN 1 AND 10),
          task_description TEXT,
          time_saved TEXT,
          verify_conf TEXT NOT NULL,
          alias TEXT CHECK (length(alias) <= 24),
          resident_name TEXT,
          task_image TEXT
        );""")
        
        # Add new columns if they don't exist (for existing databases)
        if 'tool_other' not in columns:
            conn.execute("ALTER TABLE submissions ADD COLUMN tool_other TEXT")
        if 'task_description' not in columns:
            conn.execute("ALTER TABLE submissions ADD COLUMN task_description TEXT")
        if 'resident_name' not in columns:
            conn.execute("ALTER TABLE submissions ADD COLUMN resident_name TEXT")
        if 'task_image' not in columns:
            conn.execute("ALTER TABLE submissions ADD COLUMN task_image TEXT")
        
        conn.executescript("""
        
        CREATE VIEW IF NOT EXISTS v_team_leaderboard AS
          SELECT rotation, COUNT(*) AS submissions
          FROM submissions GROUP BY rotation ORDER BY submissions DESC;
          
        CREATE VIEW IF NOT EXISTS v_usage_by_task AS
          SELECT task, COUNT(*) AS n, ROUND(AVG(COALESCE(helpfulness,0)),2) AS avg_helpfulness
          FROM submissions GROUP BY task ORDER BY n DESC;
          
        CREATE VIEW IF NOT EXISTS v_tool_effectiveness AS
          SELECT tool,
                 COUNT(*) AS n,
                 ROUND(AVG(COALESCE(helpfulness,0)),2) AS avg_helpfulness,
                 SUM(CASE WHEN verify_conf IN ('Always','Usually') THEN 1 ELSE 0 END)*1.0 / COUNT(*) AS verify_often_rate
          FROM submissions GROUP BY tool ORDER BY avg_helpfulness DESC;
          
        CREATE VIEW IF NOT EXISTS v_time_saved_dist AS
          SELECT time_saved, COUNT(*) AS n
          FROM submissions GROUP BY time_saved ORDER BY n DESC;
          
        CREATE VIEW IF NOT EXISTS v_verify_conf_dist AS
          SELECT verify_conf, COUNT(*) AS n
          FROM submissions GROUP BY verify_conf ORDER BY n DESC;
        """)
        conn.commit()

# Database will be initialized when the Modal function starts

# Pydantic models
class SubmissionIn(BaseModel):
    rotation: str
    used_ai: bool
    task: str
    tool: str
    tool_other: Optional[str] = None
    helpfulness: Optional[int] = None
    task_description: Optional[str] = None
    time_saved: Optional[str] = None
    verify_conf: str
    alias: Optional[str] = None
    resident_name: Optional[str] = None
    task_image: Optional[str] = None

    @field_validator("rotation")
    @classmethod
    def validate_rotation(cls, v): 
        if v not in ALLOWED_ROTATIONS: 
            raise ValueError("invalid rotation")
        return v
    
    @field_validator("task")
    @classmethod
    def validate_task(cls, v): 
        if v not in ALLOWED_TASKS: 
            raise ValueError("invalid task")
        return v
    
    @field_validator("tool")
    @classmethod
    def validate_tool(cls, v): 
        if v not in ALLOWED_TOOLS: 
            raise ValueError("invalid tool")
        return v
    
    @field_validator("time_saved")
    @classmethod
    def validate_time_saved(cls, v): 
        if v is not None and v not in ALLOWED_TIME: 
            raise ValueError("invalid time_saved")
        return v
    
    @field_validator("verify_conf")
    @classmethod
    def validate_verify_conf(cls, v): 
        if v not in ALLOWED_VERIFY: 
            raise ValueError("invalid verify_conf")
        return v

class SubmissionResponse(BaseModel):
    ok: bool
    id: str

class LeaderboardEntry(BaseModel):
    rotation: str
    submissions: int

class LeaderboardResponse(BaseModel):
    leaderboard: List[LeaderboardEntry]

class UsageByTask(BaseModel):
    task: str
    n: int
    avg_helpfulness: float

class ToolEffectiveness(BaseModel):
    tool: str
    n: int
    avg_helpfulness: float
    verify_often_rate: float

class TimeDistribution(BaseModel):
    time_saved: str
    n: int

class VerifyDistribution(BaseModel):
    verify_conf: str
    n: int

class RecentActivity(BaseModel):
    date: str
    n: int

class ResultsResponse(BaseModel):
    counts: Dict[str, Any]
    usage_by_task: List[UsageByTask]
    tool_effectiveness: List[ToolEffectiveness]
    time_saved_dist: List[TimeDistribution]
    verify_conf_dist: List[VerifyDistribution]
    recent_activity: List[RecentActivity]

def _guard(password: str):
    if not password or password != RESULTS_PASSWORD:
        raise HTTPException(status_code=401, detail="Unauthorized")

@app.post("/api/submissions", response_model=SubmissionResponse)
def create_submission(s: SubmissionIn):
    # If not using AI, helpfulness should be null
    if not s.used_ai and s.helpfulness is not None:
        s.helpfulness = None
    
    # Truncate alias if too long
    if s.alias and len(s.alias) > 24:
        s.alias = s.alias[:24]

    submission_id = str(uuid.uuid4())
    
    with db() as conn:
        conn.execute(
            """INSERT INTO submissions
               (id, rotation, used_ai, task, tool, tool_other, helpfulness, task_description, time_saved, verify_conf, alias, resident_name, task_image)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (
                submission_id, s.rotation, int(s.used_ai), s.task, s.tool,
                s.tool_other, s.helpfulness, s.task_description, s.time_saved, s.verify_conf, s.alias, s.resident_name, s.task_image
            ),
        )
        conn.commit()
    
    return SubmissionResponse(ok=True, id=submission_id)

@app.get("/api/leaderboard", response_model=LeaderboardResponse)
def leaderboard():
    with db() as conn:
        rows = conn.execute("SELECT rotation, submissions FROM v_team_leaderboard").fetchall()
        leaderboard_data = [LeaderboardEntry(rotation=r["rotation"], submissions=r["submissions"]) for r in rows]
    
    return LeaderboardResponse(leaderboard=leaderboard_data)

@app.get("/api/results", response_model=ResultsResponse)
def results(x_results_password: str = Header(default=None, alias="X-Results-Password")):
    _guard(x_results_password)
    
    with db() as conn:
        # Counts
        counts = conn.execute("SELECT COUNT(*) AS total_submissions, COUNT(DISTINCT rotation) AS unique_rotations FROM submissions").fetchone()
        
        # Usage by task
        usage_by_task = conn.execute("""
            SELECT task, COUNT(*) n, ROUND(AVG(COALESCE(helpfulness,0)),2) avg_helpfulness
            FROM submissions GROUP BY task ORDER BY n DESC
        """).fetchall()
        
        # Tool effectiveness
        tool_eff = conn.execute("""
            SELECT tool,
                   COUNT(*) n,
                   ROUND(AVG(COALESCE(helpfulness,0)),2) avg_helpfulness,
                   SUM(CASE WHEN verify_conf IN ('Always','Usually') THEN 1 ELSE 0 END)*1.0 / COUNT(*)
                      AS verify_often_rate
            FROM submissions GROUP BY tool ORDER BY avg_helpfulness DESC
        """).fetchall()
        
        # Time saved distribution
        time_dist = conn.execute("SELECT time_saved, COUNT(*) n FROM submissions GROUP BY time_saved ORDER BY n DESC").fetchall()
        
        # Verification confidence distribution
        verify_dist = conn.execute("SELECT verify_conf, COUNT(*) n FROM submissions GROUP BY verify_conf ORDER BY n DESC").fetchall()
        
        # Recent activity
        recent = conn.execute("""
            SELECT DATE(created_at) as date, COUNT(*) n
            FROM submissions GROUP BY DATE(created_at)
            ORDER BY date DESC LIMIT 30
        """).fetchall()
    
    return ResultsResponse(
        counts=dict(counts),
        usage_by_task=[UsageByTask(task=r["task"], n=r["n"], avg_helpfulness=r["avg_helpfulness"]) for r in usage_by_task],
        tool_effectiveness=[ToolEffectiveness(tool=r["tool"], n=r["n"], avg_helpfulness=r["avg_helpfulness"], verify_often_rate=r["verify_often_rate"]) for r in tool_eff],
        time_saved_dist=[TimeDistribution(time_saved=r["time_saved"], n=r["n"]) for r in time_dist],
        verify_conf_dist=[VerifyDistribution(verify_conf=r["verify_conf"], n=r["n"]) for r in verify_dist],
        recent_activity=[RecentActivity(date=r["date"], n=r["n"]) for r in recent]
    )

@app.get("/health")
def health_check():
    return {"status": "healthy", "service": "Resident AI Usage Survey API"}

# Export constants for frontend to use
@app.get("/api/constants")
def get_constants():
    return {
        "rotations": ALLOWED_ROTATIONS,
        "tasks": ALLOWED_TASKS,
        "tools": ALLOWED_TOOLS,
        "time_options": ALLOWED_TIME,
        "verify_options": ALLOWED_VERIFY,
        "residents": RESIDENTS
    }

@app.get("/api/residents")
def get_residents(q: Optional[str] = None):
    """Get list of residents, optionally filtered by search query"""
    if q:
        # Simple search - case insensitive, matches any part of the name
        filtered = [r for r in RESIDENTS if q.lower() in r.lower()]
        return {"residents": filtered}
    return {"residents": RESIDENTS}