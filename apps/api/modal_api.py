import modal
import os
import uuid
import hashlib
import secrets
import random
from datetime import datetime, timezone
from typing import Dict, List, Optional
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from argon2 import PasswordHasher
from pydantic import BaseModel
from PIL import Image, ImageDraw, ImageFont
import io
import textwrap

# Models
class CreateChartRequest(BaseModel):
    mode: str
    title: str
    x_label: str = ""
    y_label: str = ""
    visibility: str = "private"
    voting_period_days: Optional[int] = None

class CreateChartResponse(BaseModel):
    id: str
    admin_url: str
    share_url: str

class AddItemsRequest(BaseModel):
    items: List[Dict[str, Optional[str]]]

class PairVoteRequest(BaseModel):
    chart_id: str
    axis: Optional[str] = None
    item_a: str
    item_b: str
    winner: str

class ExplicitVoteRequest(BaseModel):
    chart_id: str
    item_id: str
    tier: Optional[int] = None
    x: Optional[float] = None
    y: Optional[float] = None

class Item(BaseModel):
    id: str
    label: str
    image_url: Optional[str] = None
    color: Optional[str] = None
    bg_color: Optional[str] = None
    description: Optional[str] = None
    sort_order: int = 0
    r_x: Optional[float] = None
    r_y: Optional[float] = None
    x_mu: Optional[float] = None
    y_mu: Optional[float] = None
    tier_mu: Optional[float] = None

class PublicChartResponse(BaseModel):
    title: str
    mode: str
    x_label: str = ""
    y_label: str = ""
    items: List[Item]
    voting_active: bool = True
    ends_at: Optional[str] = None

class ChartSummary(BaseModel):
    id: str
    title: str
    mode: str
    item_count: int
    vote_count: int
    created_at: str

# Database setup
import sqlite3
from contextlib import contextmanager

DB_PATH = os.environ.get("DB_PATH", "/db/twoby.db")

def migrate_db():
    """Run database migrations for existing databases"""
    with sqlite3.connect(DB_PATH) as conn:
        cur = conn.cursor()
        
        # Check if end_at column exists in charts table, add if it doesn't
        cur.execute("PRAGMA table_info(charts)")
        charts_columns = [row[1] for row in cur.fetchall()]
        
        if 'end_at' not in charts_columns:
            print("Adding end_at column to charts table...")
            cur.execute("ALTER TABLE charts ADD COLUMN end_at TEXT")
            conn.commit()
        
        # Check if image_url column exists in items table, add if it doesn't
        cur.execute("PRAGMA table_info(items)")
        items_columns = [row[1] for row in cur.fetchall()]
        
        if 'image_url' not in items_columns:
            print("Adding image_url column to items table...")
            cur.execute("ALTER TABLE items ADD COLUMN image_url TEXT")
            conn.commit()
            
        # Add enhanced item configuration fields
        migrations_needed = []
        if 'color' not in items_columns:
            migrations_needed.append("ALTER TABLE items ADD COLUMN color TEXT DEFAULT NULL")
        if 'bg_color' not in items_columns:
            migrations_needed.append("ALTER TABLE items ADD COLUMN bg_color TEXT DEFAULT NULL")
        if 'description' not in items_columns:
            migrations_needed.append("ALTER TABLE items ADD COLUMN description TEXT DEFAULT NULL")
        if 'sort_order' not in items_columns:
            migrations_needed.append("ALTER TABLE items ADD COLUMN sort_order INTEGER DEFAULT 0")
        if 'created_at' not in items_columns:
            migrations_needed.append("ALTER TABLE items ADD COLUMN created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))")
        
        for migration in migrations_needed:
            print(f"Running migration: {migration}")
            cur.execute(migration)
            conn.commit()

def init_db():
    with sqlite3.connect(DB_PATH) as conn:
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS charts (
                id TEXT PRIMARY KEY,
                mode TEXT NOT NULL,
                title TEXT NOT NULL,
                x_label TEXT,
                y_label TEXT,
                visibility TEXT DEFAULT 'private',
                admin_key_hash TEXT NOT NULL,
                share_key_hash TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
                start_at TEXT,
                end_at TEXT,
                reveal_policy TEXT DEFAULT 'after_vote',
                featured INTEGER DEFAULT 0
            );
            
            CREATE TABLE IF NOT EXISTS items (
                id TEXT PRIMARY KEY,
                chart_id TEXT NOT NULL,
                label TEXT NOT NULL,
                image_url TEXT,
                color TEXT DEFAULT NULL,
                bg_color TEXT DEFAULT NULL,
                description TEXT DEFAULT NULL,
                sort_order INTEGER DEFAULT 0,
                status TEXT DEFAULT 'active',
                created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
                FOREIGN KEY(chart_id) REFERENCES charts(id)
            );
            
            CREATE TABLE IF NOT EXISTS scores (
                chart_id TEXT NOT NULL,
                item_id TEXT NOT NULL,
                r_x REAL DEFAULT 1000,
                r_y REAL DEFAULT 1000,
                n_x INTEGER DEFAULT 0,
                n_y INTEGER DEFAULT 0,
                n_tier INTEGER DEFAULT 0,
                x_mu REAL DEFAULT NULL,
                y_mu REAL DEFAULT NULL,
                tier_mu REAL DEFAULT NULL,
                updated_at TEXT NOT NULL,
                PRIMARY KEY(chart_id, item_id),
                FOREIGN KEY(chart_id) REFERENCES charts(id),
                FOREIGN KEY(item_id) REFERENCES items(id)
            );
            
            CREATE TABLE IF NOT EXISTS pair_votes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                chart_id TEXT NOT NULL,
                axis TEXT,
                item_a TEXT NOT NULL,
                item_b TEXT NOT NULL,
                winner TEXT NOT NULL,
                ip_hash TEXT NOT NULL,
                ua_hash TEXT NOT NULL,
                created_at TEXT NOT NULL,
                FOREIGN KEY(chart_id) REFERENCES charts(id)
            );
            
            CREATE TABLE IF NOT EXISTS explicit_votes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                chart_id TEXT NOT NULL,
                item_id TEXT NOT NULL,
                tier INTEGER,
                x REAL,
                y REAL,
                ip_hash TEXT NOT NULL,
                ua_hash TEXT NOT NULL,
                created_at TEXT NOT NULL,
                FOREIGN KEY(chart_id) REFERENCES charts(id),
                FOREIGN KEY(item_id) REFERENCES items(id)
            );
        """)

@contextmanager
def get_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
    finally:
        conn.close()

# Modal setup
app = modal.App("twoby-api")

image = (
    modal.Image.debian_slim(python_version="3.12")
    .pip_install(
        "fastapi[standard]==0.115.0",
        "argon2-cffi==23.1.0",
        "orjson==3.10.7",
        "pillow==10.0.1"
    )
)

volume = modal.Volume.from_name("twoby-sqlite", create_if_missing=True)

PEPPER = os.environ.get("PEPPER", "dev-pepper-insecure")
ph = PasswordHasher()

@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    migrate_db()
    yield

# Define FastAPI app at module level
web_app = FastAPI(title="twoby API", lifespan=lifespan)

# Configure CORS for development and production
cors_origins = ["https://twoby.ike.rs"]
# Add localhost origins for development
if os.environ.get("ENVIRONMENT") != "production":
    cors_origins.extend([
        "http://localhost:5173", 
        "http://localhost:5174",
        "http://localhost:3000",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:5174"
    ])

web_app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def now_iso() -> str:
    return datetime.now(timezone.utc).replace(tzinfo=None).isoformat(timespec="seconds") + "Z"

def generate_og_image(title: str, mode: str, item_count: int, vote_count: int, chart_type: str = "results") -> bytes:
    """Generate OpenGraph image for chart sharing"""
    # Image dimensions optimized for social media
    width, height = 1200, 630
    
    # Create image with gradient background
    img = Image.new('RGB', (width, height), '#4338ca')  # Blue background
    draw = ImageDraw.Draw(img)
    
    # Add gradient effect (simple linear gradient simulation)
    for y in range(height):
        fade = int(255 * (1 - y / height * 0.3))
        color = (67, 56, min(255, 202 + fade // 4))
        draw.line([(0, y), (width, y)], fill=color)
    
    try:
        # Try to load a font (fallback to default if not available)
        title_font = ImageFont.truetype("DejaVuSans-Bold.ttf", 60)
        subtitle_font = ImageFont.truetype("DejaVuSans.ttf", 36)
        meta_font = ImageFont.truetype("DejaVuSans.ttf", 28)
    except:
        # Fallback to default font
        title_font = ImageFont.load_default()
        subtitle_font = ImageFont.load_default()
        meta_font = ImageFont.load_default()
    
    # Brand name
    draw.text((60, 50), "twoby", fill='white', font=title_font)
    
    # Chart title (wrapped)
    wrapped_title = textwrap.fill(title, width=35)
    title_lines = wrapped_title.split('\n')
    
    y_offset = 160
    for line in title_lines:
        draw.text((60, y_offset), line, fill='white', font=subtitle_font)
        y_offset += 45
    
    # Chart mode and type indicator
    mode_text = {
        'tier': 'Tier List',
        'single_axis': 'Single Axis Ranking', 
        'two_axis': '2×2 Grid Comparison'
    }.get(mode, mode.title())
    
    action_text = "Vote Now" if chart_type == "vote" else "View Results"
    draw.text((60, y_offset + 20), f"{action_text} • {mode_text}", fill='#e2e8f0', font=meta_font)
    
    # Stats
    stats_y = height - 120
    draw.text((60, stats_y), f"{item_count} items • {vote_count} votes", fill='#cbd5e1', font=meta_font)
    
    # Visual elements - simple chart representation
    chart_x = width - 300
    chart_y = 200
    chart_size = 180
    
    # Draw simple visual based on mode
    if mode == 'tier':
        # Draw tier boxes
        colors = ['#ef4444', '#f97316', '#eab308', '#22c55e']
        for i, color in enumerate(colors):
            y = chart_y + i * 35
            draw.rectangle([chart_x, y, chart_x + chart_size - 20, y + 25], fill=color, outline='white', width=2)
            draw.text((chart_x + 10, y + 2), f"{'SABC'[i]}", fill='white', font=meta_font)
            
    elif mode == 'single_axis':
        # Draw horizontal bars
        for i in range(5):
            bar_width = chart_size - i * 25
            y = chart_y + i * 25
            draw.rectangle([chart_x, y, chart_x + bar_width, y + 18], fill='#60a5fa', outline='white', width=1)
            
    elif mode == 'two_axis':
        # Draw scatter plot
        draw.rectangle([chart_x, chart_y, chart_x + chart_size, chart_y + chart_size], outline='white', width=2)
        # Add grid lines
        for i in range(1, 4):
            x = chart_x + i * chart_size // 4
            draw.line([(x, chart_y), (x, chart_y + chart_size)], fill='#94a3b8', width=1)
            y = chart_y + i * chart_size // 4
            draw.line([(chart_x, y), (chart_x + chart_size, y)], fill='#94a3b8', width=1)
        
        # Add some dots
        import random
        random.seed(hash(title) % 1000)  # Deterministic based on title
        for _ in range(min(8, item_count)):
            x = chart_x + random.randint(10, chart_size - 10)
            y = chart_y + random.randint(10, chart_size - 10)
            draw.ellipse([x-4, y-4, x+4, y+4], fill='#fbbf24')
    
    # Convert to bytes
    buffer = io.BytesIO()
    img.save(buffer, format='PNG')
    return buffer.getvalue()

def make_id() -> str:
    return str(uuid.uuid4())

def hash_string(s: str) -> str:
    return hashlib.sha256((s or "").encode()).hexdigest()

def argon_hash(raw: str) -> str:
    return ph.hash(raw + PEPPER)

def verify_capability(chart_id: str, key: str, admin: bool) -> bool:
    col = "admin_key_hash" if admin else "share_key_hash"
    with get_connection() as conn:
        cur = conn.cursor()
        cur.execute(f"SELECT {col}, visibility FROM charts WHERE id=?", (chart_id,))
        row = cur.fetchone()
        if not row:
            return False
        
        # Allow "public" as share key for public charts (not admin)
        if not admin and key == "public" and row["visibility"] == "public":
            return True
            
        try:
            ph.verify(row[col], key + PEPPER)
            return True
        except Exception:
            return False

def elo_update(ri: float, rj: float, winner_i: bool, K: float = 100.0):
    """Ultra-aggressive Elo with maximum K-factor for immediate separation"""
    Ei = 1.0 / (1.0 + 10 ** ((rj - ri) / 100.0))  # Very sensitive
    if winner_i:
        return ri + K * (1 - Ei), rj - K * (1 - Ei)
    else:
        return ri - K * Ei, rj + K * Ei

@web_app.post("/api/charts", response_model=CreateChartResponse)
def create_chart(payload: CreateChartRequest):
    chart_id = make_id()
    admin_key = secrets.token_urlsafe(24)
    share_key = secrets.token_urlsafe(16)
    
    with get_connection() as conn:
        cur = conn.cursor()
        # Calculate end_at if voting period is specified
        end_at = None
        if payload.voting_period_days:
            from datetime import timedelta
            end_time = datetime.now(timezone.utc) + timedelta(days=payload.voting_period_days)
            end_at = end_time.replace(tzinfo=None).isoformat(timespec="seconds") + "Z"
        
        cur.execute(
            """INSERT INTO charts 
            (id, mode, title, x_label, y_label, visibility, admin_key_hash, share_key_hash, created_at, end_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (chart_id, payload.mode, payload.title, payload.x_label, payload.y_label,
             payload.visibility, argon_hash(admin_key), argon_hash(share_key), now_iso(), end_at)
        )
        conn.commit()
    
    return CreateChartResponse(
        id=chart_id,
        admin_url=f"/c/{chart_id}?k={admin_key}",
        share_url=f"/v/{chart_id}?s={share_key}"
    )

@web_app.post("/api/charts/{chart_id}/items")
def add_items(
    chart_id: str,
    payload: AddItemsRequest,
    k: str = Query(...)
):
    if not verify_capability(chart_id, k, admin=True):
        raise HTTPException(403, "Invalid admin key")
    
    with get_connection() as conn:
        cur = conn.cursor()
        for i, item in enumerate(payload.items):
            item_id = make_id()
            cur.execute(
                """INSERT INTO items (id, chart_id, label, image_url, color, bg_color, description, sort_order, status) 
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    item_id, 
                    chart_id, 
                    item["label"], 
                    item.get("image_url"), 
                    item.get("color"),
                    item.get("bg_color"),
                    item.get("description"),
                    item.get("sort_order", i),  # Default to order they were added
                    "active"
                )
            )
            # Much more aggressive random starting positions 
            start_r_x = random.uniform(700, 1300)  # Wide spread from 700-1300 
            start_r_y = random.uniform(700, 1300)  # Wide spread from 700-1300
            cur.execute(
                "INSERT OR IGNORE INTO scores (chart_id, item_id, r_x, r_y, updated_at) VALUES (?, ?, ?, ?, ?)",
                (chart_id, item_id, start_r_x, start_r_y, now_iso())
            )
        conn.commit()
    
    return {"ok": True}

@web_app.post("/api/vote/pair")
def vote_pair(
    payload: PairVoteRequest,
    request: Request,
    s: str = Query(...)
):
    if not verify_capability(payload.chart_id, s, admin=False):
        raise HTTPException(403, "Invalid share key")
    
    client_host = request.client.host if request.client else "unknown"
    user_agent = request.headers.get("User-Agent", "")
    
    with get_connection() as conn:
        cur = conn.cursor()
        cur.execute(
            """INSERT INTO pair_votes 
            (chart_id, axis, item_a, item_b, winner, ip_hash, ua_hash, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            (payload.chart_id, payload.axis, payload.item_a, payload.item_b,
             payload.winner, hash_string(f"ip:{client_host}"),
             hash_string(f"ua:{user_agent}"), now_iso())
        )
        
        cur.execute(
            "SELECT item_id, r_x, r_y FROM scores WHERE chart_id=? AND item_id IN (?, ?)",
            (payload.chart_id, payload.item_a, payload.item_b)
        )
        rows = {r["item_id"]: (r["r_x"], r["r_y"]) for r in cur.fetchall()}
        
        if len(rows) == 2:
            ra_x, ra_y = rows[payload.item_a]
            rb_x, rb_y = rows[payload.item_b]
            
            if payload.axis in ("x", None):
                ra2, rb2 = elo_update(
                    ra_x or 1000, rb_x or 1000, 
                    payload.winner == payload.item_a
                )
                cur.execute(
                    "UPDATE scores SET r_x=?, updated_at=? WHERE chart_id=? AND item_id=?",
                    (ra2, now_iso(), payload.chart_id, payload.item_a)
                )
                cur.execute(
                    "UPDATE scores SET r_x=?, updated_at=? WHERE chart_id=? AND item_id=?",
                    (rb2, now_iso(), payload.chart_id, payload.item_b)
                )
            
            if payload.axis == "y":
                ra2, rb2 = elo_update(
                    ra_y or 1000, rb_y or 1000,
                    payload.winner == payload.item_a
                )
                cur.execute(
                    "UPDATE scores SET r_y=?, updated_at=? WHERE chart_id=? AND item_id=?",
                    (ra2, now_iso(), payload.chart_id, payload.item_a)
                )
                cur.execute(
                    "UPDATE scores SET r_y=?, updated_at=? WHERE chart_id=? AND item_id=?",
                    (rb2, now_iso(), payload.chart_id, payload.item_b)
                )
        
        conn.commit()
    
    return {"ok": True}

@web_app.post("/api/vote/explicit")
def vote_explicit(
    payload: ExplicitVoteRequest,
    request: Request,
    s: str = Query(...)
):
    if not verify_capability(payload.chart_id, s, admin=False):
        raise HTTPException(403, "Invalid share key")
    
    client_host = request.client.host if request.client else "unknown"
    user_agent = request.headers.get("User-Agent", "")
    
    with get_connection() as conn:
        cur = conn.cursor()
        cur.execute(
            """INSERT INTO explicit_votes 
            (chart_id, item_id, tier, x, y, ip_hash, ua_hash, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            (payload.chart_id, payload.item_id, payload.tier, payload.x, payload.y,
             hash_string(f"ip:{client_host}"), hash_string(f"ua:{user_agent}"),
             now_iso())
        )
        
        if payload.x is not None:
            cur.execute(
                "SELECT COALESCE(n_x, 0) as n, COALESCE(x_mu, 0) as mu FROM scores WHERE chart_id=? AND item_id=?",
                (payload.chart_id, payload.item_id)
            )
            row = cur.fetchone()
            if row:
                n = row["n"]
                mu = row["mu"]
                n2 = n + 1
                mu2 = payload.x if n == 0 else (mu * n + payload.x) / n2
                cur.execute(
                    "UPDATE scores SET n_x=?, x_mu=?, updated_at=? WHERE chart_id=? AND item_id=?",
                    (n2, mu2, now_iso(), payload.chart_id, payload.item_id)
                )
        
        if payload.y is not None:
            cur.execute(
                "SELECT COALESCE(n_y, 0) as n, COALESCE(y_mu, 0) as mu FROM scores WHERE chart_id=? AND item_id=?",
                (payload.chart_id, payload.item_id)
            )
            row = cur.fetchone()
            if row:
                n = row["n"]
                mu = row["mu"]
                n2 = n + 1
                mu2 = payload.y if n == 0 else (mu * n + payload.y) / n2
                cur.execute(
                    "UPDATE scores SET n_y=?, y_mu=?, updated_at=? WHERE chart_id=? AND item_id=?",
                    (n2, mu2, now_iso(), payload.chart_id, payload.item_id)
                )
        
        if payload.tier is not None:
            cur.execute(
                "SELECT COALESCE(n_tier, 0) as n, COALESCE(tier_mu, 0) as mu FROM scores WHERE chart_id=? AND item_id=?",
                (payload.chart_id, payload.item_id)
            )
            row = cur.fetchone()
            if row:
                n = row["n"]
                mu = row["mu"]
                n2 = n + 1
                mu2 = payload.tier if n == 0 else (mu * n + payload.tier) / n2
                cur.execute(
                    "UPDATE scores SET n_tier=?, tier_mu=?, updated_at=? WHERE chart_id=? AND item_id=?",
                    (n2, mu2, now_iso(), payload.chart_id, payload.item_id)
                )
        
        conn.commit()
    
    return {"ok": True}

@web_app.get("/api/charts/{chart_id}/public", response_model=PublicChartResponse)
def get_public(chart_id: str, s: str = Query(...)):
    with get_connection() as conn:
        cur = conn.cursor()
        cur.execute(
            "SELECT share_key_hash, title, mode, x_label, y_label, visibility, end_at FROM charts WHERE id=?",
            (chart_id,)
        )
        row = cur.fetchone()
        if not row:
            raise HTTPException(404, "Chart not found")
        
        # Allow "public" as a universal share key for public charts
        if s == "public" and row["visibility"] == "public":
            pass  # Allow access
        else:
            try:
                ph.verify(row["share_key_hash"], s + PEPPER)
            except Exception:
                raise HTTPException(403, "Invalid share key")
        
        cur.execute(
            """SELECT i.id, i.label, i.image_url, i.color, i.bg_color, i.description, i.sort_order,
                      sc.r_x, sc.r_y, sc.x_mu, sc.y_mu, sc.tier_mu
            FROM items i
            LEFT JOIN scores sc ON sc.chart_id = i.chart_id AND sc.item_id = i.id
            WHERE i.chart_id = ? AND i.status = 'active'
            ORDER BY i.sort_order ASC, i.created_at ASC""",
            (chart_id,)
        )
        items = [
            Item(
                id=r["id"],
                label=r["label"],
                image_url=r["image_url"],
                color=r["color"],
                bg_color=r["bg_color"],
                description=r["description"],
                sort_order=r["sort_order"],
                r_x=r["r_x"],
                r_y=r["r_y"],
                x_mu=r["x_mu"],
                y_mu=r["y_mu"],
                tier_mu=r["tier_mu"]
            )
            for r in cur.fetchall()
        ]
    
    # Check if voting is still active
    voting_active = True
    if row["end_at"]:
        from datetime import datetime
        try:
            end_time = datetime.fromisoformat(row["end_at"].replace('Z', '+00:00'))
            voting_active = datetime.now(timezone.utc) < end_time
        except:
            voting_active = True
    
    return PublicChartResponse(
        title=row["title"],
        mode=row["mode"],
        x_label=row["x_label"],
        y_label=row["y_label"],
        items=items,
        voting_active=voting_active,
        ends_at=row["end_at"]
    )

@web_app.get("/api/charts/public", response_model=List[ChartSummary])
def list_public_charts():
    with get_connection() as conn:
        cur = conn.cursor()
        cur.execute(
            """SELECT 
                c.id, c.title, c.mode, c.created_at,
                COUNT(DISTINCT i.id) as item_count,
                (SELECT COUNT(*) FROM pair_votes WHERE chart_id = c.id) + 
                (SELECT COUNT(*) FROM explicit_votes WHERE chart_id = c.id) as vote_count
            FROM charts c
            LEFT JOIN items i ON c.id = i.chart_id AND i.status = 'active'
            WHERE c.visibility = 'public'
            GROUP BY c.id, c.title, c.mode, c.created_at
            ORDER BY c.created_at DESC
            LIMIT 50"""
        )
        
        charts = []
        for row in cur.fetchall():
            charts.append(ChartSummary(
                id=row["id"],
                title=row["title"],
                mode=row["mode"],
                item_count=row["item_count"] or 0,
                vote_count=row["vote_count"] or 0,
                created_at=row["created_at"]
            ))
        
        return charts

@web_app.get("/api/og/chart/{chart_id}")
def get_chart_og_image(chart_id: str, s: str = Query(...), type: str = Query("results")):
    """Generate OpenGraph image for chart sharing"""
    with get_connection() as conn:
        cur = conn.cursor()
        
        # Get chart info
        cur.execute(
            "SELECT share_key_hash, title, mode, visibility FROM charts WHERE id=?",
            (chart_id,)
        )
        row = cur.fetchone()
        if not row:
            raise HTTPException(404, "Chart not found")
        
        # Verify share key
        if s == "public" and row["visibility"] == "public":
            pass  # Allow access
        else:
            try:
                ph.verify(row["share_key_hash"], s + PEPPER)
            except Exception:
                raise HTTPException(403, "Invalid share key")
        
        # Get item count
        cur.execute(
            "SELECT COUNT(*) as count FROM items WHERE chart_id = ? AND status = 'active'",
            (chart_id,)
        )
        item_count = cur.fetchone()["count"]
        
        # Get vote count
        cur.execute(
            """SELECT 
                (SELECT COUNT(*) FROM pair_votes WHERE chart_id = ?) + 
                (SELECT COUNT(*) FROM explicit_votes WHERE chart_id = ?) as vote_count""",
            (chart_id, chart_id)
        )
        vote_count = cur.fetchone()["vote_count"] or 0
        
        # Generate image
        image_bytes = generate_og_image(
            title=row["title"],
            mode=row["mode"],
            item_count=item_count,
            vote_count=vote_count,
            chart_type=type
        )
        
        # Return as PNG image
        return Response(
            content=image_bytes,
            media_type="image/png",
            headers={
                "Cache-Control": "public, max-age=3600",  # Cache for 1 hour
                "Content-Disposition": f"inline; filename=chart-{chart_id}.png"
            }
        )

@web_app.get("/health")
def health_check():
    return {"status": "healthy", "service": "twoby API"}

@app.function(
    image=image,
    volumes={"/db": volume},
    min_containers=1,  # Keep 1 container warm to avoid cold starts
    scaledown_window=300,
    max_containers=1,  # Single container to protect SQLite
    secrets=[modal.Secret.from_name("twoby-env")],
)
@modal.concurrent(max_inputs=64)
@modal.asgi_app(custom_domains=["twobyapi.ike.rs"])
def asgi():
    return web_app