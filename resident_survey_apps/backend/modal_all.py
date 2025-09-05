import os
import uuid
import sqlite3
from typing import Optional, List, Dict, Any
from contextlib import contextmanager, asynccontextmanager

from fastapi import FastAPI, Header, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, PlainTextResponse
from pydantic import BaseModel, field_validator
import csv
import io
import hashlib
import hmac
import time

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
ALLOWED_TOOLS = [
    "OpenEvidence", "Copilot", "ChatGPT", "Perplexity", "SciSpace", "Consensus", 
    "Semantic Scholar", "Elicit", "Claude", "Copy-ai", "Gemini", "Med-PaLM", "Other"
]
ALLOWED_TIME = ["None", "1 minute", "5 minutes", "10+ minutes", "30+ minutes"]
ALLOWED_VERIFY = ["Yes", "No", "Somewhat", "Not sure"]

def load_anonymous_residents():
    """Load residents from file and anonymize names to First Name + Last Initial"""
    # Try Modal deployment path first, then local development path
    residents_file = "/root/residents.txt"  # Modal deployment path
    if not os.path.exists(residents_file):
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
                    if first_name and last_name and len(last_name) > 0:
                        # Create anonymous format: "First L."
                        anonymous_name = f"{first_name} {last_name[0]}."
                        residents.append(anonymous_name)
        
        residents.sort()  # Sort alphabetically for consistent ordering
        
        if not residents:
            raise ValueError(f"No valid residents found in {residents_file}. File may be empty or improperly formatted.")
            
        return residents
        
    except FileNotFoundError:
        raise FileNotFoundError(f"Residents file not found at {residents_file}. This file is required for the application to function.")
    except Exception as e:
        raise RuntimeError(f"Error loading residents from {residents_file}: {e}")

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
          notes TEXT,
          task_image TEXT
        );""")
        
        # Add new columns if they don't exist (for existing databases)
        if 'tool_other' not in columns:
            conn.execute("ALTER TABLE submissions ADD COLUMN tool_other TEXT")
        if 'task_description' not in columns:
            conn.execute("ALTER TABLE submissions ADD COLUMN task_description TEXT")
        if 'resident_name' not in columns:
            conn.execute("ALTER TABLE submissions ADD COLUMN resident_name TEXT")
        if 'notes' not in columns:
            conn.execute("ALTER TABLE submissions ADD COLUMN notes TEXT")
        if 'task_image' not in columns:
            conn.execute("ALTER TABLE submissions ADD COLUMN task_image TEXT")
        
        # Check if new tables exist and create them if they don't (for existing databases)
        tables_cursor = conn.execute("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('submission_likes', 'submission_comments')")
        existing_tables = [row[0] for row in tables_cursor.fetchall()]
        
        if 'submission_likes' not in existing_tables:
            print("Creating submission_likes table...")
            conn.execute("""
                CREATE TABLE submission_likes (
                  id TEXT PRIMARY KEY DEFAULT (hex(randomblob(16))),
                  submission_id TEXT NOT NULL,
                  user_name TEXT NOT NULL,
                  emoji TEXT NOT NULL CHECK (emoji IN ('❤️', '👍', '👎', '🔥', '💡', '🎯')),
                  created_at TEXT NOT NULL DEFAULT (datetime('now')),
                  FOREIGN KEY (submission_id) REFERENCES submissions (id) ON DELETE CASCADE,
                  UNIQUE(submission_id, user_name, emoji)
                )
            """)
            
        if 'submission_comments' not in existing_tables:
            print("Creating submission_comments table...")
            conn.execute("""
                CREATE TABLE submission_comments (
                  id TEXT PRIMARY KEY DEFAULT (hex(randomblob(16))),
                  submission_id TEXT NOT NULL,
                  user_name TEXT NOT NULL,
                  comment TEXT NOT NULL CHECK (length(comment) <= 1000),
                  created_at TEXT NOT NULL DEFAULT (datetime('now')),
                  FOREIGN KEY (submission_id) REFERENCES submissions (id) ON DELETE CASCADE
                )
            """)
        
        # Create indexes for better performance
        conn.executescript("""
        CREATE INDEX IF NOT EXISTS idx_likes_submission ON submission_likes(submission_id);
        CREATE INDEX IF NOT EXISTS idx_comments_submission ON submission_comments(submission_id);
        CREATE INDEX IF NOT EXISTS idx_submissions_created ON submissions(created_at);
        """)
        
        # Commit all changes
        conn.commit()
        print("Database migration completed successfully")
        
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
                 SUM(CASE WHEN verify_conf IN ('Yes', 'Somewhat') THEN 1 ELSE 0 END)*1.0 / COUNT(*) AS verify_often_rate
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
    notes: Optional[str] = None
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

def generate_auth_token(password: str) -> str:
    """Generate a secure auth token that expires after 1 week"""
    if password != RESULTS_PASSWORD:
        raise ValueError("Invalid password")
    
    # Create token with timestamp (valid for 1 week)
    expires_at = int(time.time()) + (7 * 24 * 60 * 60)  # 7 days
    payload = f"{password}:{expires_at}"
    
    # Sign with HMAC using password as secret
    signature = hmac.new(
        RESULTS_PASSWORD.encode('utf-8'),
        payload.encode('utf-8'),
        hashlib.sha256
    ).hexdigest()
    
    return f"{payload}:{signature}"

def validate_auth_token(token: str) -> bool:
    """Validate an auth token and check if it's expired"""
    try:
        parts = token.split(':')
        if len(parts) != 3:
            return False
        
        password, expires_at, signature = parts
        payload = f"{password}:{expires_at}"
        
        # Verify signature
        expected_signature = hmac.new(
            RESULTS_PASSWORD.encode('utf-8'),
            payload.encode('utf-8'),
            hashlib.sha256
        ).hexdigest()
        
        if not hmac.compare_digest(signature, expected_signature):
            return False
        
        # Check if token is expired
        if int(expires_at) < int(time.time()):
            return False
        
        # Check if password matches
        if password != RESULTS_PASSWORD:
            return False
        
        return True
    except (ValueError, IndexError):
        return False

def verify_auth(token: str = None, password: str = None) -> bool:
    """Verify authentication via token or password"""
    if token and validate_auth_token(token):
        return True
    if password and password == RESULTS_PASSWORD:
        return True
    return False

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
               (id, rotation, used_ai, task, tool, tool_other, helpfulness, task_description, time_saved, verify_conf, alias, resident_name, notes, task_image)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (
                submission_id, s.rotation, int(s.used_ai), s.task, s.tool,
                s.tool_other, s.helpfulness, s.task_description, s.time_saved, s.verify_conf, s.alias, s.resident_name, s.notes, s.task_image
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

class ResidentLeaderboardEntry(BaseModel):
    resident_name: str
    submissions: int

class ResidentLeaderboardResponse(BaseModel):
    leaderboard: List[ResidentLeaderboardEntry]

@app.get("/api/leaderboard/residents", response_model=ResidentLeaderboardResponse)
def resident_leaderboard():
    with db() as conn:
        rows = conn.execute("""
            SELECT resident_name, COUNT(*) as submissions 
            FROM submissions 
            WHERE resident_name IS NOT NULL 
            GROUP BY resident_name 
            ORDER BY submissions DESC
        """).fetchall()
        leaderboard_data = [ResidentLeaderboardEntry(resident_name=r["resident_name"], submissions=r["submissions"]) for r in rows]
    
    return ResidentLeaderboardResponse(leaderboard=leaderboard_data)

class LikeEntry(BaseModel):
    emoji: str
    user_name: str
    created_at: str

class CommentEntry(BaseModel):
    id: str
    user_name: str
    comment: str
    created_at: str

class RawSubmissionEntry(BaseModel):
    id: str
    created_at: str
    resident_name: Optional[str]
    rotation: str
    used_ai: bool
    task: str
    tool: str
    tool_other: Optional[str]
    helpfulness: Optional[int]
    task_description: Optional[str]
    time_saved: Optional[str]
    verify_conf: str
    notes: Optional[str]
    task_image: Optional[str]
    likes: List[LikeEntry] = []
    comments: List[CommentEntry] = []

class RawSubmissionsResponse(BaseModel):
    submissions: List[RawSubmissionEntry]
    total_count: int

class PasswordRequest(BaseModel):
    password: str

class AuthResponse(BaseModel):
    success: bool
    token: Optional[str] = None
    message: Optional[str] = None

class AddLikeRequest(BaseModel):
    submission_id: str
    emoji: str
    user_name: str

class AddCommentRequest(BaseModel):
    submission_id: str
    comment: str
    user_name: str

class LikeResponse(BaseModel):
    success: bool
    message: str

class CommentResponse(BaseModel):
    success: bool
    message: str
    comment_id: str

@app.get("/api/results", response_model=ResultsResponse)
def results(
    x_auth_token: str = Header(default=None, alias="X-Auth-Token"),
    x_results_password: str = Header(default=None, alias="X-Results-Password")
):
    if not verify_auth(token=x_auth_token, password=x_results_password):
        raise HTTPException(status_code=401, detail="Unauthorized")
    
    with db() as conn:
        # Counts with time ranges
        counts = conn.execute("""
            SELECT 
                COUNT(*) AS total_submissions,
                COUNT(DISTINCT rotation) AS unique_rotations,
                COUNT(CASE WHEN DATE(created_at) = DATE('now') THEN 1 END) AS today_count,
                COUNT(CASE WHEN DATE(created_at) >= DATE('now', '-7 days') THEN 1 END) AS week_count,
                COUNT(CASE WHEN DATE(created_at) >= DATE('now', '-30 days') THEN 1 END) AS month_count
            FROM submissions
        """).fetchone()
        
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
                   SUM(CASE WHEN verify_conf IN ('Yes', 'Somewhat') THEN 1 ELSE 0 END)*1.0 / COUNT(*)
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

@app.get("/api/results/submissions", response_model=RawSubmissionsResponse)
def raw_submissions(
    x_auth_token: str = Header(default=None, alias="X-Auth-Token"),
    x_results_password: str = Header(default=None, alias="X-Results-Password"),
    limit: int = Query(100, ge=1, le=1000),
    offset: int = Query(0, ge=0)
):
    if not verify_auth(token=x_auth_token, password=x_results_password):
        raise HTTPException(status_code=401, detail="Unauthorized")
    
    with db() as conn:
        # Get total count
        count_result = conn.execute("SELECT COUNT(*) as total FROM submissions").fetchone()
        total_count = count_result["total"]
        
        # Get submissions with limit and offset
        rows = conn.execute("""
            SELECT id, created_at, resident_name, rotation, used_ai, task, tool, tool_other,
                   helpfulness, task_description, time_saved, verify_conf, notes, task_image
            FROM submissions 
            ORDER BY created_at DESC 
            LIMIT ? OFFSET ?
        """, (limit, offset)).fetchall()
        
        # Get likes and comments for each submission
        submission_ids = [r["id"] for r in rows]
        likes_data = {}
        comments_data = {}
        
        if submission_ids:
            # Get all likes for these submissions
            likes_query = f"""
                SELECT submission_id, emoji, user_name, created_at
                FROM submission_likes 
                WHERE submission_id IN ({','.join(['?' for _ in submission_ids])})
                ORDER BY created_at DESC
            """
            likes_rows = conn.execute(likes_query, submission_ids).fetchall()
            
            for like_row in likes_rows:
                sub_id = like_row["submission_id"]
                if sub_id not in likes_data:
                    likes_data[sub_id] = []
                likes_data[sub_id].append(LikeEntry(
                    emoji=like_row["emoji"],
                    user_name=like_row["user_name"],
                    created_at=like_row["created_at"]
                ))
            
            # Get all comments for these submissions
            comments_query = f"""
                SELECT id, submission_id, user_name, comment, created_at
                FROM submission_comments 
                WHERE submission_id IN ({','.join(['?' for _ in submission_ids])})
                ORDER BY created_at DESC
            """
            comments_rows = conn.execute(comments_query, submission_ids).fetchall()
            
            for comment_row in comments_rows:
                sub_id = comment_row["submission_id"]
                if sub_id not in comments_data:
                    comments_data[sub_id] = []
                comments_data[sub_id].append(CommentEntry(
                    id=comment_row["id"],
                    user_name=comment_row["user_name"],
                    comment=comment_row["comment"],
                    created_at=comment_row["created_at"]
                ))
        
        submissions_data = [RawSubmissionEntry(
            id=r["id"],
            created_at=r["created_at"],
            resident_name=r["resident_name"],
            rotation=r["rotation"],
            used_ai=bool(r["used_ai"]),
            task=r["task"],
            tool=r["tool"],
            tool_other=r["tool_other"],
            helpfulness=r["helpfulness"],
            task_description=r["task_description"],
            time_saved=r["time_saved"],
            verify_conf=r["verify_conf"],
            notes=r["notes"],
            task_image=r["task_image"],
            likes=likes_data.get(r["id"], []),
            comments=comments_data.get(r["id"], [])
        ) for r in rows]
    
    return RawSubmissionsResponse(submissions=submissions_data, total_count=total_count)

@app.get("/api/results/download")
def download_csv(
    x_auth_token: str = Header(default=None, alias="X-Auth-Token"),
    x_results_password: str = Header(default=None, alias="X-Results-Password")
):
    if not verify_auth(token=x_auth_token, password=x_results_password):
        raise HTTPException(status_code=401, detail="Unauthorized")
    
    with db() as conn:
        rows = conn.execute("""
            SELECT id, created_at, resident_name, rotation, used_ai, task, tool, tool_other,
                   helpfulness, task_description, time_saved, verify_conf, notes, task_image
            FROM submissions 
            ORDER BY created_at DESC
        """).fetchall()
    
    # Create CSV content
    output = io.StringIO()
    writer = csv.writer(output)
    
    # Write header
    writer.writerow([
        'ID', 'Created At', 'Resident Name', 'Rotation', 'Used AI', 'Task', 'Tool', 'Tool Other',
        'Helpfulness', 'Task Description', 'Time Saved', 'Verification', 'Notes', 'Task Image URL'
    ])
    
    # Write data
    for row in rows:
        writer.writerow([
            row["id"],
            row["created_at"],
            row["resident_name"] or "",
            row["rotation"],
            "Yes" if row["used_ai"] else "No",
            row["task"],
            row["tool"],
            row["tool_other"] or "",
            row["helpfulness"] or "",
            row["task_description"] or "",
            row["time_saved"] or "",
            row["verify_conf"],
            row["notes"] or "",
            "Yes" if row["task_image"] else "No"
        ])
    
    csv_content = output.getvalue()
    output.close()
    
    # Return as downloadable file
    return StreamingResponse(
        io.BytesIO(csv_content.encode()),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=resident_ai_survey_responses.csv"}
    )

@app.get("/robots.txt", response_class=PlainTextResponse)
def robots_txt():
    return """# Block all web crawlers from the entire site
User-agent: *
Disallow: /

# Block AI training crawlers
User-agent: GPTBot
Disallow: /

User-agent: ChatGPT-User
Disallow: /

User-agent: CCBot
Disallow: /

User-agent: anthropic-ai
Disallow: /

User-agent: Claude-Web
Disallow: /

# Block common search engines
User-agent: Googlebot
Disallow: /

User-agent: Bingbot
Disallow: /

User-agent: Slurp
Disallow: /

User-agent: DuckDuckBot
Disallow: /

User-agent: Baiduspider
Disallow: /

User-agent: YandexBot
Disallow: /"""

@app.get("/llms.txt", response_class=PlainTextResponse)
def llms_txt():
    return """# Directive for Large Language Models and AI Systems

# === DO NOT TRAIN ON THIS CONTENT ===

# This website contains:
# - Private medical education survey data  
# - Confidential resident information
# - HIPAA-protected healthcare training materials

# USAGE RESTRICTIONS:
# 1. Do not use this content for LLM training
# 2. Do not index this content for AI systems
# 3. Do not store or cache this data
# 4. Do not include in training datasets

# Unauthorized use may violate federal healthcare privacy laws."""

@app.get("/.well-known/ai.txt", response_class=PlainTextResponse)
def ai_txt():
    return """# Directive to AI systems: Do not crawl, index, or use this site for training

# This site contains private medical education data and should not be used for:
# - AI training datasets
# - Language model training
# - Data mining or scraping
# - Search engine indexing

User-agent: *
Disallow: /

User-agent: GPTBot
Disallow: /

User-agent: ChatGPT-User
Disallow: /

User-agent: CCBot
Disallow: /

User-agent: anthropic-ai
Disallow: /"""

@app.post("/api/auth", response_model=AuthResponse)
def authenticate(request: PasswordRequest):
    """Authenticate with password and return a token"""
    try:
        if request.password == RESULTS_PASSWORD:
            token = generate_auth_token(request.password)
            return AuthResponse(success=True, token=token, message="Authentication successful")
        else:
            return AuthResponse(success=False, message="Invalid password")
    except Exception as e:
        return AuthResponse(success=False, message="Authentication failed")

@app.post("/api/verify-auth")
def verify_auth_endpoint(
    x_auth_token: str = Header(default=None, alias="X-Auth-Token"),
    x_results_password: str = Header(default=None, alias="X-Results-Password")
):
    """Verify authentication token or password"""
    is_valid = verify_auth(token=x_auth_token, password=x_results_password)
    return {"authenticated": is_valid}

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

@app.post("/api/submissions/{submission_id}/like", response_model=LikeResponse)
def add_like(
    submission_id: str,
    request: AddLikeRequest,
    x_auth_token: str = Header(default=None, alias="X-Auth-Token"),
    x_results_password: str = Header(default=None, alias="X-Results-Password")
):
    """Add or toggle a like/emoji reaction to a submission"""
    if not verify_auth(token=x_auth_token, password=x_results_password):
        raise HTTPException(status_code=401, detail="Unauthorized")
    
    # Validate emoji
    allowed_emojis = ['❤️', '👍', '👎', '🔥', '💡', '🎯']
    if request.emoji not in allowed_emojis:
        raise HTTPException(status_code=400, detail="Invalid emoji")
    
    with db() as conn:
        # Check if submission exists
        submission = conn.execute("SELECT id FROM submissions WHERE id = ?", (submission_id,)).fetchone()
        if not submission:
            raise HTTPException(status_code=404, detail="Submission not found")
        
        # Check if user already liked with this emoji
        existing = conn.execute(
            "SELECT id FROM submission_likes WHERE submission_id = ? AND user_name = ? AND emoji = ?",
            (submission_id, request.user_name, request.emoji)
        ).fetchone()
        
        if existing:
            # Remove the like (toggle off)
            conn.execute(
                "DELETE FROM submission_likes WHERE submission_id = ? AND user_name = ? AND emoji = ?",
                (submission_id, request.user_name, request.emoji)
            )
            conn.commit()
            return LikeResponse(success=True, message="Like removed")
        else:
            # Add the like
            conn.execute(
                "INSERT INTO submission_likes (submission_id, user_name, emoji) VALUES (?, ?, ?)",
                (submission_id, request.user_name, request.emoji)
            )
            conn.commit()
            return LikeResponse(success=True, message="Like added")

@app.post("/api/submissions/{submission_id}/comment", response_model=CommentResponse)
def add_comment(
    submission_id: str,
    request: AddCommentRequest,
    x_auth_token: str = Header(default=None, alias="X-Auth-Token"),
    x_results_password: str = Header(default=None, alias="X-Results-Password")
):
    """Add a comment to a submission"""
    if not verify_auth(token=x_auth_token, password=x_results_password):
        raise HTTPException(status_code=401, detail="Unauthorized")
    
    # Validate comment length
    if len(request.comment.strip()) == 0:
        raise HTTPException(status_code=400, detail="Comment cannot be empty")
    if len(request.comment) > 1000:
        raise HTTPException(status_code=400, detail="Comment too long (max 1000 characters)")
    
    with db() as conn:
        # Check if submission exists
        submission = conn.execute("SELECT id FROM submissions WHERE id = ?", (submission_id,)).fetchone()
        if not submission:
            raise HTTPException(status_code=404, detail="Submission not found")
        
        # Add the comment
        cursor = conn.execute(
            "INSERT INTO submission_comments (submission_id, user_name, comment) VALUES (?, ?, ?) RETURNING id",
            (submission_id, request.user_name, request.comment.strip())
        )
        comment_id = cursor.fetchone()["id"]
        conn.commit()
        
        return CommentResponse(success=True, message="Comment added", comment_id=comment_id)

# Modal deployment configuration
import modal

modal_app = modal.App("resident-ai-survey-api")

# Create Modal image with dependencies
image = (
    modal.Image.debian_slim(python_version="3.12")
    .pip_install(
        "fastapi[standard]",
        "pydantic"
    )
    .apt_install("sqlite3")
    .add_local_file("../residents.txt", "/root/residents.txt")
)

# Create a volume for persistent SQLite database
volume = modal.Volume.from_name("resident-survey-db", create_if_missing=True)

@modal_app.function(
    image=image,
    volumes={"/vol/db": volume},
    secrets=[modal.Secret.from_name("resident-survey-secrets")],
    min_containers=1
)
@modal.asgi_app(custom_domains=["surveyapi.ike.rs"])
def api():
    return app


