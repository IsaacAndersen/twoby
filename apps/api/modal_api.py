import modal
import os
import uuid
import hashlib
import secrets
import random
import json
from datetime import datetime, timezone
from typing import Dict, List, Optional
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request, Query, Body
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from argon2 import PasswordHasher
from pydantic import BaseModel
from PIL import Image, ImageDraw, ImageFont
import io
import textwrap
try:
    from openai import OpenAI
except ImportError:
    OpenAI = None

# Models
class CreateChartRequest(BaseModel):
    mode: str
    title: str
    x_label: str = ""
    y_label: str = ""
    description: str = ""
    creator_take: str = ""
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

class AISuggestRequest(BaseModel):
    title: str
    mode: str
    type: str  # 'items' or 'axes'

class AISuggestResponse(BaseModel):
    items: Optional[List[str]] = None
    axes: Optional[List[Dict[str, str]]] = None

# New models for enhanced API endpoints
class CreateShortUrlRequest(BaseModel):
    long_url: str
    short_code: str
    chart_id: str
    is_vote: bool
    title: Optional[str] = None

class CreateShortUrlResponse(BaseModel):
    short_url: str
    short_code: str
    long_url: str

class GenerateItemsRequest(BaseModel):
    title: str
    description: Optional[str] = None
    existingItems: Optional[List[str]] = None
    xAxis: Optional[str] = None
    yAxis: Optional[str] = None
    mode: Optional[str] = None

class GenerateItemsResponse(BaseModel):
    items: List[str]

class GenerateAxesRequest(BaseModel):
    title: str
    items: List[str]

class GenerateAxesResponse(BaseModel):
    x_axis: str
    y_axis: str

class GenerateDescriptionRequest(BaseModel):
    title: str
    items: List[str]

class GenerateDescriptionResponse(BaseModel):
    description: str

class ImageSearchRequest(BaseModel):
    query: str
    per_page: int = 9

class ImageSearchResponse(BaseModel):
    results: List[Dict]

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
            migrations_needed.append("ALTER TABLE items ADD COLUMN created_at TEXT")
        if 'image_src' not in items_columns:
            migrations_needed.append("ALTER TABLE items ADD COLUMN image_src TEXT DEFAULT NULL")
        if 'image_attribution' not in items_columns:
            migrations_needed.append("ALTER TABLE items ADD COLUMN image_attribution TEXT DEFAULT NULL")
        if 'dominant_color' not in items_columns:
            migrations_needed.append("ALTER TABLE items ADD COLUMN dominant_color TEXT DEFAULT NULL")
        
        for migration in migrations_needed:
            print(f"Running migration: {migration}")
            cur.execute(migration)
            conn.commit()
        
        # Add description and creator_take to charts table if they don't exist
        if 'description' not in charts_columns:
            print("Adding description column to charts table...")
            cur.execute("ALTER TABLE charts ADD COLUMN description TEXT DEFAULT ''")
            conn.commit()
        
        if 'creator_take' not in charts_columns:
            print("Adding creator_take column to charts table...")
            cur.execute("ALTER TABLE charts ADD COLUMN creator_take TEXT DEFAULT ''")
            conn.commit()
        
        # Create short_urls table if it doesn't exist
        try:
            cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='short_urls'")
            if not cur.fetchone():
                print("Creating short_urls table...")
                cur.execute("""
                    CREATE TABLE short_urls (
                        id INTEGER PRIMARY KEY,
                        short_code TEXT UNIQUE NOT NULL,
                        long_url TEXT NOT NULL,
                        chart_id TEXT,
                        is_vote BOOLEAN DEFAULT FALSE,
                        title TEXT,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        click_count INTEGER DEFAULT 0
                    )
                """)
                cur.execute("CREATE INDEX idx_short_urls_short_code ON short_urls(short_code)")
                cur.execute("CREATE INDEX idx_short_urls_chart_id ON short_urls(chart_id)")
                conn.commit()
        except Exception as e:
            print(f"Error creating short_urls table: {e}")

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
        "pillow==10.0.1",
        "requests==2.31.0",
        "openai==1.55.3"
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

def generate_og_image(title: str, mode: str, item_count: int, vote_count: int, chart_type: str = "results", items_data: List[Dict] = None) -> bytes:
    """Generate OpenGraph image with ShadCN styling matching the app"""
    width, height = 1200, 630
    
    # ShadCN color palette (HSL to RGB converted)
    BACKGROUND = (255, 255, 255)      # --background: 0 0% 100%
    FOREGROUND = (9, 9, 11)           # --foreground: 222.2 84% 4.9%
    MUTED = (241, 245, 249)           # --muted: 210 40% 96%  
    MUTED_FOREGROUND = (100, 116, 139)  # --muted-foreground: 215.4 16.3% 46.9%
    BORDER = (226, 232, 240)          # --border: 214.3 31.8% 91.4%
    PRIMARY = (59, 130, 246)          # --primary: 221.2 83.2% 53.3%
    
    # Create clean white background
    img = Image.new('RGB', (width, height))
    draw = ImageDraw.Draw(img)
    draw.rectangle([(0, 0), (width, height)], fill=BACKGROUND)
    
    # Load system fonts
    try:
        title_font = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 38)
        subtitle_font = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 18)
        font = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 16)
        small_font = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 14)
    except:
        title_font = ImageFont.load_default()
        subtitle_font = ImageFont.load_default()
        font = ImageFont.load_default()
        small_font = ImageFont.load_default()
    
    # App branding
    draw.text((40, 40), "twoby", fill=FOREGROUND, font=subtitle_font)
    
    # Chart title
    draw.text((40, 80), title, fill=FOREGROUND, font=title_font)
    
    # Mode subtitle
    mode_display = {
        'tier': 'Tier List',
        'single_axis': 'Single Axis',
        'two_axis': '2×2 Grid'
    }
    subtitle = f"Results • {mode_display.get(mode, mode.title())}"
    draw.text((40, 130), subtitle, fill=MUTED_FOREGROUND, font=font)
    
    # Stats
    stats_text = f"{item_count} items • {vote_count} votes"
    draw.text((40, height - 50), stats_text, fill=MUTED_FOREGROUND, font=small_font)
    
    # Chart visualization area
    chart_x = 400
    chart_y = 60
    chart_width = 720
    chart_height = 500
    
    if items_data and len(items_data) > 0:
        if mode == "tier":
            render_shadcn_tier_list(draw, items_data, chart_x, chart_y, chart_width, chart_height, font, small_font)
        elif mode == "single_axis":
            render_shadcn_single_axis(draw, items_data, chart_x, chart_y, chart_width, chart_height, font, small_font)
        elif mode == "two_axis":
            render_shadcn_two_axis(draw, items_data, chart_x, chart_y, chart_width, chart_height, font, small_font)
    
    # Convert to bytes
    buffer = io.BytesIO()
    img.save(buffer, format='PNG', quality=95)
    return buffer.getvalue()

def render_actual_chart_visualization(draw, items_data: List[Dict], mode: str, x: int, y: int, size: int, font):
    """Render the actual chart with real data"""
    if mode == 'tier':
        render_tier_visualization(draw, items_data, x, y, size, font)
    elif mode == 'single_axis':
        render_single_axis_visualization(draw, items_data, x, y, size, font)
    elif mode == 'two_axis':
        render_two_axis_visualization(draw, items_data, x, y, size, font)

def render_tier_visualization(draw, items_data: List[Dict], x: int, y: int, size: int, font):
    """Render beautiful tier list visualization"""
    tiers = [
        {'name': 'S', 'value': 4, 'color': (239, 68, 68), 'bg': (254, 226, 226)},
        {'name': 'A', 'value': 3, 'color': (249, 115, 22), 'bg': (255, 237, 213)},
        {'name': 'B', 'value': 2, 'color': (234, 179, 8), 'bg': (254, 249, 195)},
        {'name': 'C', 'value': 1, 'color': (34, 197, 94), 'bg': (220, 252, 231)}
    ]
    
    tier_height = size // 5
    
    for i, tier in enumerate(tiers):
        tier_y = y + i * (tier_height + 5)
        
        # Get items for this tier
        tier_items = [
            item for item in items_data 
            if abs((item.get('tier_mu') or 2.5) - tier['value']) < 0.5
        ][:3]  # Limit to top 3 for space
        
        # Tier background with gradient
        draw.rectangle([x, tier_y, x + size, tier_y + tier_height], 
                      fill=tier['bg'], outline=tier['color'], width=2)
        
        # Tier label with bold styling
        label_bg = (tier['color'][0], tier['color'][1], tier['color'][2], 180)
        draw.rectangle([x, tier_y, x + 50, tier_y + tier_height], fill=tier['color'])
        draw.text((x + 15, tier_y + tier_height//2 - 8), tier['name'], 
                 fill='white', font=font)
        
        # Items in tier - display as text list
        item_x_start = x + 60
        item_text_y = tier_y + 8
        
        for j, item in enumerate(tier_items):
            if j >= 3:  # Maximum 3 items per tier to prevent overflow
                break
                
            item_label = item.get('label', 'Item')
            # Smart truncation - keep important words
            if len(item_label) > 18:
                words = item_label.split()
                if len(words) > 1:
                    item_label = ' '.join(words[:2]) + '...'
                else:
                    item_label = item_label[:18] + '...'
            
            # Display item as text with bullet point
            bullet_y = item_text_y + j * 14
            if bullet_y > tier_y + tier_height - 10:
                break
                
            draw.text((item_x_start, bullet_y), f"• {item_label}", 
                     fill='white', font=font)

def render_single_axis_visualization(draw, items_data: List[Dict], x: int, y: int, size: int, font):
    """Render beautiful single axis ranking"""
    # Sort items by score
    sorted_items = sorted(items_data, 
                         key=lambda item: item.get('x_mu') or (item.get('r_x', 1000) - 1000) / 10, 
                         reverse=True)[:8]  # Top 8 items
    
    # Background
    draw.rectangle([x, y, x + size, y + size], fill=(248, 250, 252), outline=(203, 213, 225))
    
    # Title
    draw.text((x + 10, y + 10), "Ranking", fill='black', font=font)
    
    bar_height = 30
    max_width = size - 40
    
    for i, item in enumerate(sorted_items):
        item_y = y + 40 + i * (bar_height + 8)
        score = item.get('x_mu') or (item.get('r_x', 1000) - 1000) / 10
        
        # Normalize score to bar width (assuming -100 to 100 range)
        bar_width = int((score + 100) / 200 * max_width)
        bar_width = max(20, min(bar_width, max_width))
        
        # Color gradient based on rank
        colors = [(34, 197, 94), (59, 130, 246), (168, 85, 247), (239, 68, 68)]
        color = colors[min(i // 2, len(colors) - 1)]
        
        # Draw bar with gradient effect
        draw.rectangle([x + 20, item_y, x + 20 + bar_width, item_y + bar_height], 
                      fill=color, outline=(255, 255, 255), width=2)
        
        # Item label
        label = (item.get('label') or 'Item')[:12]
        draw.text((x + 25, item_y + 8), label, fill='white', font=font)
        
        # Rank number
        draw.text((x + 5, item_y + 8), f"{i+1}", fill='black', font=font)

def render_two_axis_visualization(draw, items_data: List[Dict], x: int, y: int, size: int, font):
    """Render beautiful 2x2 grid scatter plot"""
    # Background with quadrants
    draw.rectangle([x, y, x + size, y + size], fill=(248, 250, 252), outline=(203, 213, 225), width=2)
    
    # Quadrant backgrounds
    half_size = size // 2
    # Top left (purple) - Low X, High Y
    draw.rectangle([x, y, x + half_size, y + half_size], fill=(243, 232, 255, 100))
    # Top right (emerald) - High X, High Y  
    draw.rectangle([x + half_size, y, x + size, y + half_size], fill=(209, 250, 229, 100))
    # Bottom left (gray) - Low X, Low Y
    draw.rectangle([x, y + half_size, x + half_size, y + size], fill=(249, 250, 251, 100))
    # Bottom right (amber) - High X, Low Y
    draw.rectangle([x + half_size, y + half_size, x + size, y + size], fill=(255, 251, 235, 100))
    
    # Grid lines
    draw.line([(x + half_size, y), (x + half_size, y + size)], fill=(156, 163, 175), width=2)
    draw.line([(x, y + half_size), (x + size, y + half_size)], fill=(156, 163, 175), width=2)
    
    # Plot items
    for i, item in enumerate(items_data[:12]):  # Limit to 12 items for readability
        item_x = item.get('x_mu') or ((item.get('r_x', 1000) - 1000) / 5)
        item_y = item.get('y_mu') or ((item.get('r_y', 1000) - 1000) / 5)
        
        # Convert to pixel coordinates
        pixel_x = x + int((item_x + 100) / 200 * size)
        pixel_y = y + int((1 - (item_y + 100) / 200) * size)  # Flip Y axis
        
        # Clamp to bounds
        pixel_x = max(x + 5, min(pixel_x, x + size - 5))
        pixel_y = max(y + 5, min(pixel_y, y + size - 5))
        
        # Determine color based on quadrant
        is_high_x = pixel_x > x + half_size
        is_high_y = pixel_y < y + half_size
        
        if is_high_x and is_high_y:
            color = (34, 197, 94)  # Emerald
        elif not is_high_x and is_high_y:
            color = (168, 85, 247)  # Purple
        elif is_high_x and not is_high_y:
            color = (245, 158, 11)  # Amber
        else:
            color = (107, 114, 128)  # Gray
        
        # Draw item dot with halo effect
        draw.ellipse([pixel_x-8, pixel_y-8, pixel_x+8, pixel_y+8], 
                    fill=color, outline=(255, 255, 255), width=2)
        
        # Add label if space allows (first few items only)
        if i < 6:
            label = (item.get('label') or '')[:6]
            if label:
                # Position label to avoid overlap
                label_x = pixel_x + 12 if pixel_x < x + size - 60 else pixel_x - 50
                label_y = pixel_y - 6
                
                # Label background
                label_width = draw.textlength(label, font=font)
                draw.rectangle([label_x - 2, label_y - 2, label_x + label_width + 2, label_y + 14], 
                             fill=(255, 255, 255, 200), outline=(0, 0, 0, 100))
                draw.text((label_x, label_y), label, fill='black', font=font)

def render_placeholder_visualization(draw, mode: str, item_count: int, x: int, y: int, size: int, font):
    """Render placeholder visualization when no data available"""
    import random
    
    if mode == 'tier':
        colors = [(239, 68, 68), (249, 115, 22), (234, 179, 8), (34, 197, 94)]
        tier_height = size // 5
        for i, color in enumerate(colors):
            tier_y = y + i * (tier_height + 5)
            draw.rectangle([x, tier_y, x + size, tier_y + tier_height], 
                          fill=color, outline='white', width=2)
            draw.text((x + 15, tier_y + tier_height//2 - 8), f"{'SABC'[i]}", 
                     fill='white', font=font)
            
    elif mode == 'single_axis':
        for i in range(min(6, item_count)):
            bar_width = size - i * 30
            item_y = y + 40 + i * 35
            draw.rectangle([x + 20, item_y, x + 20 + bar_width, item_y + 25], 
                          fill=(96, 165, 250), outline='white', width=1)
            
    elif mode == 'two_axis':
        draw.rectangle([x, y, x + size, y + size], outline='white', width=2)
        # Grid
        for i in range(1, 4):
            grid_x = x + i * size // 4
            draw.line([(grid_x, y), (grid_x, y + size)], fill=(148, 163, 184), width=1)
            grid_y = y + i * size // 4
            draw.line([(x, grid_y), (x + size, grid_y)], fill=(148, 163, 184), width=1)
        
        # Random dots
        random.seed(item_count)
        for _ in range(min(8, item_count)):
            dot_x = x + random.randint(10, size - 10)
            dot_y = y + random.randint(10, size - 10)
            draw.ellipse([dot_x-4, dot_y-4, dot_x+4, dot_y+4], fill=(251, 191, 36))

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
            (id, mode, title, description, creator_take, x_label, y_label, visibility, admin_key_hash, share_key_hash, created_at, end_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (chart_id, payload.mode, payload.title, payload.description or "", payload.creator_take or "",
             payload.x_label, payload.y_label, payload.visibility, argon_hash(admin_key), 
             argon_hash(share_key), now_iso(), end_at)
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
            created_at = datetime.now(timezone.utc).isoformat()
            cur.execute(
                """INSERT INTO items (id, chart_id, label, image_url, color, bg_color, description, sort_order, status, created_at) 
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    item_id, 
                    chart_id, 
                    item["label"], 
                    item.get("image_url"), 
                    item.get("color"),
                    item.get("bg_color"),
                    item.get("description"),
                    item.get("sort_order", i),  # Default to order they were added
                    "active",
                    created_at
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
        # First check if end_at column exists
        cur.execute("PRAGMA table_info(charts)")
        columns = [column[1] for column in cur.fetchall()]
        
        # Build query dynamically based on available columns
        if 'end_at' in columns:
            cur.execute(
                "SELECT share_key_hash, title, mode, x_label, y_label, visibility, end_at FROM charts WHERE id=?",
                (chart_id,)
            )
        else:
            cur.execute(
                "SELECT share_key_hash, title, mode, x_label, y_label, visibility FROM charts WHERE id=?",
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
        # Convert old concatenated format to structured format for backward compatibility
        raw_items = []
        for item_row in cur.fetchall():
            label = item_row["label"]
            image_url = item_row["image_url"]
            
            # Handle legacy data where image URLs were concatenated with labels
            if "|" in label and not image_url:
                parts = label.split("|", 1)
                if len(parts) == 2 and parts[1].strip().startswith("http"):
                    label = parts[0].strip()
                    image_url = parts[1].strip()
            
            raw_items.append({
                **dict(item_row),
                "label": label,
                "image_url": image_url
            })
        
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
            for r in raw_items
        ]
    
    # Check if voting is still active
    voting_active = True
    end_at_value = None
    try:
        end_at_value = row["end_at"] if "end_at" in columns else None
        if end_at_value:
            from datetime import datetime
            try:
                end_time = datetime.fromisoformat(end_at_value.replace('Z', '+00:00'))
                voting_active = datetime.now(timezone.utc) < end_time
            except (ValueError, TypeError):
                voting_active = True
    except (KeyError, IndexError):
        # Column doesn't exist in this row (backward compatibility)
        voting_active = True
    
    return PublicChartResponse(
        title=row["title"],
        mode=row["mode"],
        x_label=row["x_label"],
        y_label=row["y_label"],
        items=items,
        voting_active=voting_active,
        ends_at=end_at_value
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
        
        # Get items data for visualization
        items_data = []
        if type == "results":
            cur.execute("""
                SELECT i.id, i.label, i.image_url,
                       COALESCE(s.r_x, 1000) as r_x,
                       COALESCE(s.r_y, 1000) as r_y,
                       COALESCE(s.x_mu, NULL) as x_mu,
                       COALESCE(s.y_mu, NULL) as y_mu,
                       COALESCE(s.tier_mu, NULL) as tier_mu
                FROM items i
                LEFT JOIN scores s ON i.id = s.item_id AND i.chart_id = s.chart_id
                WHERE i.chart_id = ? AND i.status = 'active'
                ORDER BY 
                    CASE 
                        WHEN ? = 'tier' THEN COALESCE(s.tier_mu, 1000)
                        WHEN ? = 'single_axis' THEN COALESCE(s.x_mu, 1000)
                        ELSE COALESCE(s.r_x, 1000)
                    END DESC
            """, (chart_id, row["mode"], row["mode"]))
            
            for item_row in cur.fetchall():
                label = item_row["label"]
                image_url = item_row["image_url"]
                
                # Handle legacy data where image URLs were concatenated with labels
                if "|" in label and not image_url:
                    parts = label.split("|", 1)
                    if len(parts) == 2 and parts[1].strip().startswith("http"):
                        label = parts[0].strip()
                        image_url = parts[1].strip()
                
                items_data.append({
                    "id": item_row["id"],
                    "label": label,
                    "image_url": image_url,
                    "r_x": item_row["r_x"],
                    "r_y": item_row["r_y"],
                    "x_mu": item_row["x_mu"],
                    "y_mu": item_row["y_mu"],
                    "tier_mu": item_row["tier_mu"]
                })
        
        # Generate image
        image_bytes = generate_og_image(
            title=row["title"],
            mode=row["mode"],
            item_count=item_count,
            vote_count=vote_count,
            chart_type=type,
            items_data=items_data
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

@web_app.post("/api/ai/suggest", response_model=AISuggestResponse)
def ai_suggest(payload: AISuggestRequest):
    """Generate AI suggestions for items or axes based on chart title"""
    
    # Check if OpenAI is available
    openai_key = os.getenv("OPENAI_API_KEY")
    model = os.getenv("OPENAI_MODEL", "gpt-5-nano")
    if not openai_key or not OpenAI:
        # Return hardcoded suggestions if no API key
        if payload.type == "items":
            # Provide context-aware suggestions based on title keywords
            title_lower = payload.title.lower()
            
            if "coffee" in title_lower:
                items = ["Blue Bottle Coffee", "Stumptown", "La Colombe", "Intelligentsia", 
                        "Counter Culture", "Ritual Coffee", "Verve", "Four Barrel"]
            elif "programming" in title_lower or "language" in title_lower:
                items = ["Python", "JavaScript", "TypeScript", "Rust", "Go", "Java", "C++", "Ruby"]
            elif "movie" in title_lower or "film" in title_lower:
                items = ["The Shawshank Redemption", "The Godfather", "Pulp Fiction", 
                        "The Dark Knight", "Inception", "Fight Club", "Goodfellas", "The Matrix"]
            elif "song" in title_lower or "music" in title_lower or "workout" in title_lower:
                items = ["Eye of the Tiger", "Lose Yourself", "Till I Collapse", 
                        "Stronger", "Can't Hold Us", "Remember the Name", "Power", "Pump It"]
            elif "app" in title_lower:
                items = ["Notion", "Slack", "Spotify", "Discord", "Figma", "Linear", 
                        "Obsidian", "Arc Browser", "ChatGPT", "GitHub"]
            elif "food" in title_lower or "restaurant" in title_lower:
                items = ["Pizza", "Sushi", "Burgers", "Tacos", "Thai Food", 
                        "Italian", "Chinese", "Indian", "Mediterranean"]
            else:
                # Generic suggestions
                items = ["Option A", "Option B", "Option C", "Option D", 
                        "Option E", "Option F", "Option G", "Option H"]
            
            return AISuggestResponse(items=items)
            
        elif payload.type == "axes":
            # Provide mode-specific axis suggestions
            if payload.mode == "single_axis":
                title_lower = payload.title.lower()
                
                if "difficult" in title_lower or "hard" in title_lower:
                    axes = [
                        {"xLow": "Easy", "xHigh": "Difficult"},
                        {"xLow": "Beginner Friendly", "xHigh": "Expert Level"},
                        {"xLow": "Simple", "xHigh": "Complex"}
                    ]
                elif "quality" in title_lower or "best" in title_lower:
                    axes = [
                        {"xLow": "Poor", "xHigh": "Excellent"},
                        {"xLow": "Worst", "xHigh": "Best"},
                        {"xLow": "Low Quality", "xHigh": "High Quality"}
                    ]
                elif "popular" in title_lower:
                    axes = [
                        {"xLow": "Unknown", "xHigh": "Famous"},
                        {"xLow": "Niche", "xHigh": "Mainstream"},
                        {"xLow": "Underrated", "xHigh": "Overrated"}
                    ]
                else:
                    axes = [
                        {"xLow": "Low", "xHigh": "High"},
                        {"xLow": "Weak", "xHigh": "Strong"},
                        {"xLow": "Bad", "xHigh": "Good"}
                    ]
                return AISuggestResponse(axes=axes)
                
            elif payload.mode == "two_axis":
                axes = [
                    {
                        "xLow": "Hard to Learn", "xHigh": "Easy to Learn",
                        "yLow": "Low Demand", "yHigh": "High Demand"
                    },
                    {
                        "xLow": "Expensive", "xHigh": "Affordable", 
                        "yLow": "Low Quality", "yHigh": "High Quality"
                    },
                    {
                        "xLow": "Time Consuming", "xHigh": "Quick",
                        "yLow": "Not Fun", "yHigh": "Very Fun"
                    },
                    {
                        "xLow": "Traditional", "xHigh": "Innovative",
                        "yLow": "Niche", "yHigh": "Mainstream"
                    }
                ]
                return AISuggestResponse(axes=axes)
    
    # Use OpenAI if available
    try:
        client = OpenAI(api_key=openai_key)
        
        if payload.type == "items":
            prompt = f"""Given a chart titled "{payload.title}", suggest 8-12 relevant items to rank.
            Return only a JSON array of strings, no explanation. Example: ["Item 1", "Item 2", ...]"""
            
            response = client.chat.completions.create(
                model=model,
                messages=[{"role": "user", "content": prompt}],
                max_completion_tokens=8000
            )
            
            items = json.loads(response.choices[0].message.content)
            return AISuggestResponse(items=items[:12])  # Limit to 12 items
            
        elif payload.type == "axes":
            if payload.mode == "single_axis":
                prompt = f"""For a single-axis chart titled "{payload.title}", suggest 3 pairs of axis labels.
                Return a JSON array with objects containing xLow and xHigh. 
                Example: [{{"xLow": "Easy", "xHigh": "Difficult"}}, ...]"""
            else:
                prompt = f"""For a 2x2 grid chart titled "{payload.title}", suggest 3 sets of axis labels.
                Return a JSON array with objects containing xLow, xHigh, yLow, and yHigh.
                Example: [{{"xLow": "Cheap", "xHigh": "Expensive", "yLow": "Bad", "yHigh": "Good"}}, ...]"""
            
            response = client.chat.completions.create(
                model=model,
                messages=[{"role": "user", "content": prompt}],
                max_completion_tokens=8000
            )
            
            axes = json.loads(response.choices[0].message.content)
            return AISuggestResponse(axes=axes[:3])  # Limit to 3 suggestions
            
    except Exception as e:
        print(f"OpenAI API error: {e}")
        # Fall back to hardcoded suggestions
        if payload.type == "items":
            return AISuggestResponse(items=["Item 1", "Item 2", "Item 3", "Item 4", "Item 5"])
        else:
            return AISuggestResponse(axes=[{"xLow": "Low", "xHigh": "High"}])
    
    return AISuggestResponse()

# New enhanced API endpoints

@web_app.post("/api/short-urls", response_model=CreateShortUrlResponse)
def create_short_url(payload: CreateShortUrlRequest):
    """Create a shortened URL"""
    try:
        with sqlite3.connect(DB_PATH) as conn:
            cur = conn.cursor()
            
            # Check if short_code already exists
            cur.execute("SELECT long_url FROM short_urls WHERE short_code = ?", (payload.short_code,))
            existing = cur.fetchone()
            
            if existing:
                # Return existing short URL if it matches
                if existing[0] == payload.long_url:
                    base_url = "https://twoby.ike.rs"  # or get from request
                    return CreateShortUrlResponse(
                        short_url=f"{base_url}/s/{payload.short_code}",
                        short_code=payload.short_code,
                        long_url=payload.long_url
                    )
                else:
                    # Generate new unique code if collision
                    import time
                    payload.short_code = f"{payload.short_code}-{int(time.time()) % 10000}"
            
            # Insert new short URL
            cur.execute("""
                INSERT INTO short_urls (short_code, long_url, chart_id, is_vote, title) 
                VALUES (?, ?, ?, ?, ?)
            """, (payload.short_code, payload.long_url, payload.chart_id, payload.is_vote, payload.title))
            conn.commit()
            
            base_url = "https://twoby.ike.rs"  # Replace with actual domain
            return CreateShortUrlResponse(
                short_url=f"{base_url}/s/{payload.short_code}",
                short_code=payload.short_code,
                long_url=payload.long_url
            )
            
    except Exception as e:
        print(f"Error creating short URL: {e}")
        raise HTTPException(status_code=500, detail="Failed to create short URL")

@web_app.get("/s/{short_code}")
def redirect_short_url(short_code: str):
    """Redirect short URL to full URL"""
    try:
        with sqlite3.connect(DB_PATH) as conn:
            cur = conn.cursor()
            cur.execute("SELECT long_url FROM short_urls WHERE short_code = ?", (short_code,))
            result = cur.fetchone()
            
            if result:
                # Increment click count
                cur.execute("UPDATE short_urls SET click_count = click_count + 1 WHERE short_code = ?", (short_code,))
                conn.commit()
                
                from fastapi.responses import RedirectResponse
                return RedirectResponse(url=result[0], status_code=302)
            else:
                raise HTTPException(status_code=404, detail="Short URL not found")
                
    except Exception as e:
        print(f"Error redirecting short URL: {e}")
        raise HTTPException(status_code=500, detail="Failed to redirect")

@web_app.post("/api/ai/generate-items", response_model=GenerateItemsResponse)
def generate_items(payload: GenerateItemsRequest):
    """Generate AI suggestions for chart items"""
    
    # Require OpenAI for dynamic suggestions
    openai_key = os.getenv("OPENAI_API_KEY")
    model = os.getenv("OPENAI_MODEL", "gpt-5-nano")
    
    if not openai_key or not OpenAI:
        raise HTTPException(status_code=503, detail="OpenAI API key not configured in Modal secrets. Add OPENAI_API_KEY to twoby-env secret.")
    
    try:
        client = OpenAI(api_key=openai_key)
        
        # Build location and context-aware prompt
        title_lower = payload.title.lower()
        
        # Extract location context
        location_keywords = ['in', 'from', 'around', 'near', 'of']
        location = ""
        for keyword in location_keywords:
            if keyword in title_lower:
                parts = title_lower.split(keyword, 1)
                if len(parts) > 1:
                    location = parts[1].strip()
                    break
        
        # Build generic prompt
        if location:
            prompt = f"List 8 specific items for '{payload.title}'. Focus on actual names/places in {location}."
        else:
            prompt = f"List 8 specific items for '{payload.title}'. Use actual names, not categories."
        
        if payload.description:
            prompt += f" Context: {payload.description}."
            
        prompt += " Return only the names, one per line."
        
        print(f"Using OpenAI model: {model}")
        print(f"Prompt: {prompt}")
        
        response = client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": "You are a helpful assistant that generates specific, relevant items for comparison charts. Always provide a direct answer."},
                {"role": "user", "content": prompt}
            ],
            max_completion_tokens=8000,
        )
        
        print(f"OpenAI response: {response}")
        content = response.choices[0].message.content or ''
        print(f"OpenAI content: '{content}'")
        
        if not content or not content.strip():
            raise Exception(f"OpenAI returned empty content. Response: {response}")
        
        # Parse items from various formats (numbered, bulleted, etc.)
        import re
        items = []
        for line in content.split('\n'):
            line = line.strip()
            if not line or line.lower().startswith('here are'):
                continue
            
            # Remove common prefixes (numbers, bullets, dashes)
            cleaned = re.sub(r'^[\d\.\-\*\+]\s*', '', line).strip()
            if cleaned:
                items.append(cleaned)
        
        items = items[:8]  # Limit to 8 items
        
        if not items:
            raise Exception("No valid items parsed from OpenAI response")
        
        return GenerateItemsResponse(items=items)
        
    except Exception as e:
        print(f"OpenAI API error: {e}")
        raise HTTPException(status_code=503, detail=f"AI generation failed: {str(e)}")

@web_app.post("/api/ai/generate-axes", response_model=GenerateAxesResponse)
def generate_axes(payload: GenerateAxesRequest):
    """Generate AI suggestions for 2x2 chart axes"""
    
    openai_key = os.getenv("OPENAI_API_KEY")
    model = os.getenv("OPENAI_MODEL", "gpt-5-nano")
    
    if not openai_key or not OpenAI:
        raise HTTPException(status_code=503, detail="OpenAI API key not configured in Modal secrets. Add OPENAI_API_KEY to twoby-env secret.")
    
    try:
        client = OpenAI(api_key=openai_key)
        
        title_lower = payload.title.lower()
        items_text = ', '.join(payload.items[:8])
        
        # Create context-aware prompt based on the domain
        if 'coffee' in title_lower and 'shop' in title_lower:
            prompt = f"""For a comparison chart about coffee shops titled "{payload.title}" with these places: {items_text}, suggest two practical axes that people use to evaluate coffee shops.

Focus on axes that create meaningful comparisons like:
- Price range (Cheap → Expensive)
- Atmosphere (Cozy → Corporate)
- Quality (Low Quality → High Quality)
- Convenience (Inconvenient → Convenient)

Return in this exact format:
X-axis: [Low value] → [High value]  
Y-axis: [Low value] → [High value]"""
        elif 'restaurant' in title_lower:
            prompt = f"""For restaurant comparisons titled "{payload.title}" with these places: {items_text}, suggest two practical evaluation axes.

Focus on common restaurant comparison dimensions like:
- Price (Cheap → Expensive)
- Formality (Casual → Fine Dining)
- Food Quality (Poor → Excellent)
- Service Speed (Slow → Fast)

Return in this exact format:
X-axis: [Low value] → [High value]
Y-axis: [Low value] → [High value]"""
        else:
            # General purpose prompt
            prompt = f"""For a comparison chart titled "{payload.title}" with items: {items_text}, suggest two practical axes for evaluation.

The axes should:
- Be relevant to comparing these specific items
- Create meaningful trade-offs and insights
- Use clear, simple language
- Cover different dimensions of comparison

Return in this exact format:
X-axis: [Low value] → [High value]
Y-axis: [Low value] → [High value]"""
        
        response = client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": "You suggest comparison axes for 2x2 matrix charts."},
                {"role": "user", "content": prompt}
            ],
            max_completion_tokens=2000
        )
        
        content = response.choices[0].message.content or ''
        
        # Parse response looking for the arrow format
        x_match = content.lower().find('x-axis:')
        y_match = content.lower().find('y-axis:')
        
        if x_match == -1 or y_match == -1:
            raise Exception("AI response did not contain required axis labels")
        
        x_line = content[x_match:].split('\n')[0]
        x_axis = x_line.split(':', 1)[1].strip()
        
        y_line = content[y_match:].split('\n')[0]  
        y_axis = y_line.split(':', 1)[1].strip()
        
        if not x_axis or not y_axis:
            raise Exception("AI provided empty axis labels")
        
        # The axes should already be in "Low → High" format from the new prompt
        # But if they're not, we'll return them as-is
            
        return GenerateAxesResponse(x_axis=x_axis, y_axis=y_axis)
        
    except Exception as e:
        print(f"OpenAI API error: {e}")
        raise HTTPException(status_code=503, detail=f"AI axis generation failed: {str(e)}")

@web_app.post("/api/ai/generate-axis-endpoints")
def generate_axis_endpoints(payload: dict):
    """Generate low/high endpoints for a simple axis label"""
    
    openai_key = os.getenv("OPENAI_API_KEY")
    model = os.getenv("OPENAI_MODEL", "gpt-5-nano")
    
    if not openai_key or not OpenAI:
        raise HTTPException(status_code=503, detail="OpenAI API key not configured")
    
    axis_label = payload.get("axis_label", "").strip()
    context = payload.get("context", "")  # Title or additional context
    
    if not axis_label:
        raise HTTPException(status_code=400, detail="axis_label is required")
    
    try:
        client = OpenAI(api_key=openai_key)
        
        # If it already contains an arrow, just return it as-is
        if "→" in axis_label or "->" in axis_label:
            return {"low": axis_label.split("→")[0].strip() if "→" in axis_label else axis_label.split("->")[0].strip(),
                    "high": axis_label.split("→")[1].strip() if "→" in axis_label else axis_label.split("->")[1].strip()}
        
        prompt = f"""Given the axis concept "{axis_label}", create flavorful, interesting endpoint labels for a comparison chart.

Examples of GOOD endpoints (creative and flavorful):
- "Sounds cool" → Low: "Sounds lame", High: "Sounds awesome"  
- "Looks cool" → Low: "Looks terrible", High: "Looks amazing"
- "Vibes" → Low: "Bad vibes", High: "Immaculate vibes"
- "Price" → Low: "Dirt cheap", High: "Eye-wateringly expensive"
- "Difficulty" → Low: "Child's play", High: "Nightmare mode"
- "Quality" → Low: "Hot garbage", High: "Chef's kiss"
- "Speed" → Low: "Snail's pace", High: "Lightning fast"
- "Taste" → Low: "Tastes awful", High: "Absolutely delicious"

Examples of BAD endpoints (too generic):
- "Cool" → Low: "Not Cool", High: "Very Cool" (TOO BORING!)
- "Good" → Low: "Not Good", High: "Very Good" (TOO GENERIC!)

Make the endpoints:
- Flavorful and engaging (use vivid language)
- Natural opposites that people would actually say
- Specific to the concept (not just "not X" and "very X")
- Fun but still clear{f' - relevant to {context}' if context else ''}

Return in this format:
Low: [endpoint]
High: [endpoint]"""

        response = client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": "You generate creative, flavorful axis endpoints for comparison charts. Avoid generic labels like 'Not X' or 'Very X'. Use vivid, engaging language that people would naturally use."},
                {"role": "user", "content": prompt}
            ],
            max_completion_tokens=200
        )
        
        content = response.choices[0].message.content or ''
        print(f"AI axis response for '{axis_label}': {content}")
        
        # Parse the response
        low_match = content.lower().find('low:')
        high_match = content.lower().find('high:')
        
        if low_match == -1 or high_match == -1:
            # If AI failed to generate proper format, try to find any usable content
            print(f"AI response parsing failed. Raw content: {content}")
            lines = content.strip().split('\n')
            if len(lines) >= 2:
                # Try to extract from any line format
                low_candidates = [line for line in lines if 'low' in line.lower()]
                high_candidates = [line for line in lines if 'high' in line.lower()]
                
                if low_candidates and high_candidates:
                    low_text = low_candidates[0].split(':', 1)[-1].strip()
                    high_text = high_candidates[0].split(':', 1)[-1].strip()
                    return {"low": low_text, "high": high_text}
            
            # Final fallback - at least avoid "Not X" pattern  
            return {"low": f"{axis_label} (low)", "high": f"{axis_label} (high)"}
        
        low_line = content[low_match:].split('\n')[0]
        low_endpoint = low_line.split(':', 1)[1].strip()
        
        high_line = content[high_match:].split('\n')[0]
        high_endpoint = high_line.split(':', 1)[1].strip()
        
        return {"low": low_endpoint, "high": high_endpoint}
        
    except Exception as e:
        print(f"Error generating axis endpoints: {e}")
        # Simple fallback without the boring "Not X" pattern
        return {"low": f"{axis_label} (low)", "high": f"{axis_label} (high)"}

@web_app.post("/api/ai/generate-description", response_model=GenerateDescriptionResponse)
def generate_description(payload: GenerateDescriptionRequest):
    """Generate AI description for a chart"""
    
    openai_key = os.getenv("OPENAI_API_KEY")
    model = os.getenv("OPENAI_MODEL", "gpt-5-nano")
    
    if not openai_key or not OpenAI:
        raise HTTPException(status_code=503, detail="OpenAI API key not configured in Modal secrets. Add OPENAI_API_KEY to twoby-env secret.")
    
    try:
        client = OpenAI(api_key=openai_key)
        
        prompt = f"""Write a brief, engaging description (1-2 sentences) for a comparison chart titled "{payload.title}" that compares: {', '.join(payload.items[:5])}{'...' if len(payload.items) > 5 else ''}.

Make it conversational and intriguing to encourage participation. Focus on the value of community input."""
        
        response = client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": "Write engaging descriptions for comparison charts that encourage participation."},
                {"role": "user", "content": prompt}
            ],
            max_completion_tokens=2000
        )
        
        description = response.choices[0].message.content.strip()
        return GenerateDescriptionResponse(description=description)
        
    except Exception as e:
        print(f"OpenAI API error: {e}")
        raise HTTPException(status_code=503, detail=f"AI description generation failed: {str(e)}")

@web_app.get("/api/images/search")
def search_images(q: str = Query(..., description="Search query")):
    """Search for images using Google CSE Images with smart query building"""
    
    google_api_key = os.getenv("GOOGLE_API_KEY")
    google_cse_id = os.getenv("GOOGLE_CSE_ID")
    
    if not google_api_key or not google_cse_id:
        # Return placeholder images
        results = [{
            "id": "placeholder-1",
            "thumbnail": f"https://via.placeholder.com/150x150/6b7280/ffffff?text={q.replace(' ', '+')}",
            "full": f"https://via.placeholder.com/512x512/6b7280/ffffff?text={q.replace(' ', '+')}",
            "source": "placeholder",
            "contextLink": "#"
        }]
        return {"results": results}
    
    try:
        import requests
        
        # Check cache first (simple file-based cache)
        cache_key = hashlib.md5(q.encode()).hexdigest()
        cache_file = f"/tmp/img_cache_{cache_key}.json"
        
        # Try to load from cache (24h)
        try:
            import time
            if os.path.exists(cache_file):
                cache_age = time.time() - os.path.getmtime(cache_file)
                if cache_age < 24 * 60 * 60:  # 24 hours
                    with open(cache_file, 'r') as f:
                        cached_results = json.load(f)
                    return {"results": cached_results}
        except Exception:
            pass
        
        # Build smart query - prioritize logos for brands
        query = f"{q} logo"
        
        url = "https://www.googleapis.com/customsearch/v1"
        params = {
            "key": google_api_key,
            "cx": google_cse_id,
            "q": query,
            "searchType": "image",
            "safe": "active",
            "num": 6,
            "imgSize": "large"
        }
        
        response = requests.get(url, params=params, timeout=10)
        
        if response.status_code == 200:
            data = response.json()
            results = []
            
            for item in data.get('items', []):
                # Skip obvious watermarked/favicon images
                if any(skip in item.get('link', '').lower() for skip in ['favicon', 'watermark']):
                    continue
                    
                # Skip very small images
                if item.get('image', {}).get('width', 0) < 128:
                    continue
                
                results.append({
                    "id": item.get('cacheId', item.get('link')),
                    "thumbnail": item.get('image', {}).get('thumbnailLink', item.get('link')),
                    "full": item.get('link'),
                    "source": item.get('displayLink', ''),
                    "contextLink": item.get('image', {}).get('contextLink', '#')
                })
            
            # Cache results
            try:
                with open(cache_file, 'w') as f:
                    json.dump(results, f)
            except Exception:
                pass
            
            return {"results": results}
        else:
            raise Exception(f"Google CSE returned {response.status_code}")
            
    except Exception as e:
        print(f"Image search error: {e}")
        # Fallback to placeholder
        results = [{
            "id": "placeholder-1",
            "thumbnail": f"https://via.placeholder.com/150x150/6b7280/ffffff?text={q.replace(' ', '+')}",
            "full": f"https://via.placeholder.com/512x512/6b7280/ffffff?text={q.replace(' ', '+')}",
            "source": "placeholder",
            "contextLink": "#"
        }]
        return {"results": results}

@web_app.post("/api/images/auto-pick")
def auto_pick_image(request: dict = Body(...)):
    """Automatically pick the best image for an item with context"""
    
    item_label = request.get("item_label", "")
    chart_title = request.get("chart_title", "")
    chart_description = request.get("chart_description", "")
    
    if not item_label.strip():
        raise HTTPException(status_code=400, detail="Item label is required")
    
    # Build contextual search query
    context_parts = []
    if chart_title:
        context_parts.append(chart_title)
    if chart_description:
        context_parts.append(chart_description)
    
    context = " ".join(context_parts)
    
    # Create enhanced search query with context
    base_query = item_label.strip()
    
    # Add context for better image results
    if context:
        query = f"{base_query} {context}"
    else:
        query = base_query
    
    # Use existing search_images logic but return just the best result
    google_api_key = os.getenv("GOOGLE_API_KEY")
    google_cse_id = os.getenv("GOOGLE_CSE_ID")
    
    if not google_api_key or not google_cse_id:
        # Return placeholder
        return {
            "image_url": f"https://via.placeholder.com/512x512/6b7280/ffffff?text={base_query.replace(' ', '+')}",
            "source": "placeholder"
        }
    
    try:
        import requests
        
        # Check cache first
        cache_key = hashlib.md5(query.encode()).hexdigest()
        cache_file = f"/tmp/auto_img_cache_{cache_key}.json"
        
        try:
            import time
            if os.path.exists(cache_file):
                cache_age = time.time() - os.path.getmtime(cache_file)
                if cache_age < 24 * 60 * 60:  # 24 hours
                    with open(cache_file, 'r') as f:
                        cached_result = json.load(f)
                    return cached_result
        except Exception:
            pass
        
        # Try multiple query strategies for better results
        query_attempts = [
            f"{query} logo",              # Logo first
            f"{base_query} logo",         # Just item + logo
            f"{query}",                   # Full context
            f"{base_query}"               # Just the item
        ]
        
        best_image = None
        
        for attempt_query in query_attempts:
            url = "https://www.googleapis.com/customsearch/v1"
            params = {
                "key": google_api_key,
                "cx": google_cse_id,
                "q": attempt_query,
                "searchType": "image",
                "safe": "active",
                "num": 3,
                "imgSize": "large"
            }
            
            try:
                response = requests.get(url, params=params, timeout=10)
                
                if response.status_code == 200:
                    data = response.json()
                    
                    for item in data.get('items', []):
                        # Skip obvious bad images
                        if any(skip in item.get('link', '').lower() for skip in ['favicon', 'watermark']):
                            continue
                            
                        # Skip very small images
                        if item.get('image', {}).get('width', 0) < 200:
                            continue
                        
                        # We found a good image
                        best_image = {
                            "image_url": item.get('link'),
                            "source": item.get('displayLink', ''),
                            "query_used": attempt_query
                        }
                        break
                    
                    if best_image:
                        break
                        
            except Exception as e:
                print(f"Query attempt failed: {attempt_query}, error: {e}")
                continue
        
        # Cache the result
        if best_image:
            try:
                with open(cache_file, 'w') as f:
                    json.dump(best_image, f)
            except Exception:
                pass
            
            return best_image
        else:
            # Fallback to placeholder
            result = {
                "image_url": f"https://via.placeholder.com/512x512/6b7280/ffffff?text={base_query.replace(' ', '+')}",
                "source": "placeholder"
            }
            return result
            
    except Exception as e:
        print(f"Auto image pick error: {e}")
        return {
            "image_url": f"https://via.placeholder.com/512x512/6b7280/ffffff?text={base_query.replace(' ', '+')}",
            "source": "placeholder"
        }

@web_app.post("/api/images/bulk-auto-pick")
def bulk_auto_pick_images(request: dict = Body(...)):
    """Automatically pick images for multiple items in one request"""
    
    items = request.get("items", [])
    chart_title = request.get("chart_title", "")
    chart_description = request.get("chart_description", "")
    
    if not items:
        raise HTTPException(status_code=400, detail="Items list is required")
    
    google_api_key = os.getenv("GOOGLE_API_KEY")
    google_cse_id = os.getenv("GOOGLE_CSE_ID")
    
    results = []
    
    for item in items:
        item_id = item.get("id")
        item_label = item.get("label", "")
        
        if not item_label.strip():
            results.append({"id": item_id, "image_url": None})
            continue
        
        # Build contextual search query
        context_parts = []
        if chart_title:
            context_parts.append(chart_title)
        if chart_description:
            context_parts.append(chart_description)
        
        context = " ".join(context_parts)
        base_query = item_label.strip()
        
        if context:
            query = f"{base_query} {context}"
        else:
            query = base_query
        
        if not google_api_key or not google_cse_id:
            # Return placeholder for this item
            results.append({
                "id": item_id,
                "image_url": f"https://via.placeholder.com/512x512/6b7280/ffffff?text={base_query.replace(' ', '+')}"
            })
            continue
        
        try:
            import requests
            
            # Check cache first
            cache_key = hashlib.md5(query.encode()).hexdigest()
            cache_file = f"/tmp/auto_img_cache_{cache_key}.json"
            
            # Try cache
            try:
                import time
                if os.path.exists(cache_file):
                    cache_age = time.time() - os.path.getmtime(cache_file)
                    if cache_age < 24 * 60 * 60:  # 24 hours
                        with open(cache_file, 'r') as f:
                            cached_result = json.load(f)
                        results.append({
                            "id": item_id,
                            "image_url": cached_result.get("image_url")
                        })
                        continue
            except Exception:
                pass
            
            # Try to find image
            best_image = None
            query_attempts = [
                f"{query} logo",
                f"{base_query} logo",
                query,
                base_query
            ]
            
            for attempt_query in query_attempts[:2]:  # Limit attempts for bulk operations
                url = "https://www.googleapis.com/customsearch/v1"
                params = {
                    "key": google_api_key,
                    "cx": google_cse_id,
                    "q": attempt_query,
                    "searchType": "image",
                    "safe": "active",
                    "num": 1,  # Just get the best match
                    "imgSize": "large"
                }
                
                try:
                    response = requests.get(url, params=params, timeout=5)  # Shorter timeout for bulk
                    
                    if response.status_code == 200:
                        data = response.json()
                        
                        for img_item in data.get('items', []):
                            # Skip bad images
                            if any(skip in img_item.get('link', '').lower() for skip in ['favicon', 'watermark']):
                                continue
                            if img_item.get('image', {}).get('width', 0) < 200:
                                continue
                            
                            best_image = {
                                "image_url": img_item.get('link'),
                                "source": img_item.get('displayLink', '')
                            }
                            break
                        
                        if best_image:
                            # Cache it
                            try:
                                with open(cache_file, 'w') as f:
                                    json.dump(best_image, f)
                            except Exception:
                                pass
                            break
                            
                except Exception:
                    continue
            
            if best_image:
                results.append({
                    "id": item_id,
                    "image_url": best_image["image_url"]
                })
            else:
                # Placeholder fallback
                results.append({
                    "id": item_id,
                    "image_url": f"https://via.placeholder.com/512x512/6b7280/ffffff?text={base_query.replace(' ', '+')}"
                })
                
        except Exception as e:
            print(f"Bulk image pick error for {item_label}: {e}")
            results.append({
                "id": item_id,
                "image_url": f"https://via.placeholder.com/512x512/6b7280/ffffff?text={base_query.replace(' ', '+')}"
            })
    
    return {"results": results}

@web_app.post("/api/images/attach")
def attach_image(item_id: str, source_url: str, chart_id: str, admin_key: str):
    """Download, normalize, and attach image to an item"""
    
    # Verify admin key
    with sqlite3.connect(DB_PATH) as conn:
        cur = conn.cursor()
        cur.execute("SELECT admin_key_hash FROM charts WHERE id = ?", (chart_id,))
        chart = cur.fetchone()
        
        if not chart or not PasswordHasher().verify(chart[0], admin_key):
            raise HTTPException(status_code=403, detail="Invalid admin key")
    
    try:
        import requests
        from PIL import Image
        import io
        import colorsys
        
        # Download image
        response = requests.get(source_url, timeout=10)
        response.raise_for_status()
        
        # Open and process image
        img = Image.open(io.BytesIO(response.content))
        
        # Convert to RGB if needed
        if img.mode in ('RGBA', 'LA'):
            background = Image.new('RGB', img.size, (255, 255, 255))
            background.paste(img, mask=img.split()[-1] if img.mode == 'RGBA' else None)
            img = background
        elif img.mode != 'RGB':
            img = img.convert('RGB')
        
        # Resize to 512x512 (pad, don't crop)
        img.thumbnail((512, 512), Image.Resampling.LANCZOS)
        
        # Create square canvas
        square_img = Image.new('RGB', (512, 512), (255, 255, 255))
        x = (512 - img.width) // 2
        y = (512 - img.height) // 2
        square_img.paste(img, (x, y))
        
        # Get dominant color
        colors = square_img.getcolors(256 * 256 * 256)
        if colors:
            dominant_color = max(colors, key=lambda x: x[0])[1]
            dominant_hex = f"#{dominant_color[0]:02x}{dominant_color[1]:02x}{dominant_color[2]:02x}"
        else:
            dominant_hex = "#6b7280"
        
        # Save to temporary location (in real app, upload to CDN)
        import tempfile
        import uuid
        
        filename = f"{uuid.uuid4()}.webp"
        temp_path = f"/tmp/{filename}"
        square_img.save(temp_path, "WebP", quality=85)
        
        # For now, we'll store the temp path (in production, upload to CDN and get URL)
        image_url = f"/static/images/{filename}"
        
        # Update database
        with sqlite3.connect(DB_PATH) as conn:
            cur = conn.cursor()
            cur.execute("""
                UPDATE items 
                SET image_url = ?, dominant_color = ? 
                WHERE id = ? AND chart_id = ?
            """, (image_url, dominant_hex, item_id, chart_id))
            conn.commit()
        
        return {"success": True, "image_url": image_url, "dominant_color": dominant_hex}
        
    except Exception as e:
        print(f"Error attaching image: {e}")
        raise HTTPException(status_code=500, detail="Failed to process image")

def render_shadcn_tier_list(draw, items_data: List[Dict], x: int, y: int, width: int, height: int, font, small_font):
    """Render tier list exactly matching ViewChart ShadCN styling"""
    # ShadCN colors
    BACKGROUND = (255, 255, 255)
    BORDER = (226, 232, 240)
    FOREGROUND = (9, 9, 11)
    MUTED_FOREGROUND = (100, 116, 139)
    
    # Group items by tier based on their tier_mu score
    tiers = {'S': [], 'A': [], 'B': [], 'C': []}
    
    for item in items_data:
        score = item.get('tier_mu', 0)
        if score > 1.5:
            tiers['S'].append(item)
        elif score > 0.5:
            tiers['A'].append(item)
        elif score > -0.5:
            tiers['B'].append(item)
        else:
            tiers['C'].append(item)
    
    # Tier styling matching the app's gradient cards
    tier_config = [
        {'name': 'S', 'bg': (254, 226, 226), 'border': (239, 68, 68), 'label_bg': (239, 68, 68)},   # S tier - red
        {'name': 'A', 'bg': (254, 237, 213), 'border': (249, 115, 22), 'label_bg': (249, 115, 22)}, # A tier - orange
        {'name': 'B', 'bg': (254, 249, 195), 'border': (234, 179, 8), 'label_bg': (234, 179, 8)},   # B tier - yellow
        {'name': 'C', 'bg': (220, 252, 231), 'border': (34, 197, 94), 'label_bg': (34, 197, 94)}    # C tier - green
    ]
    
    tier_height = 80
    tier_spacing = 12
    
    for i, tier in enumerate(tier_config):
        tier_items = tiers[tier['name']]
        if not tier_items:
            continue
            
        tier_y = y + i * (tier_height + tier_spacing)
        
        # Draw tier card with ShadCN styling
        draw.rectangle([x, tier_y, x + width, tier_y + tier_height], 
                      fill=tier['bg'], outline=tier['border'], width=2)
        
        # Tier label
        draw.rectangle([x, tier_y, x + 60, tier_y + tier_height], fill=tier['label_bg'])
        draw.text((x + 22, tier_y + tier_height//2 - 10), tier['name'], 
                 fill='white', font=font)
        
        # Items list
        item_start_x = x + 80
        for j, item in enumerate(tier_items[:4]):  # Max 4 items per tier
            item_name = item.get('label', 'Item')
            if len(item_name) > 20:
                item_name = item_name[:20] + '...'
            
            item_y = tier_y + 15 + j * 16
            draw.text((item_start_x, item_y), f"• {item_name}", 
                     fill=FOREGROUND, font=small_font)

def render_shadcn_single_axis(draw, items_data: List[Dict], x: int, y: int, width: int, height: int, font, small_font):
    """Render single axis ranking matching ViewChart ShadCN styling"""
    BACKGROUND = (255, 255, 255)
    BORDER = (226, 232, 240)
    FOREGROUND = (9, 9, 11)
    MUTED_FOREGROUND = (100, 116, 139)
    PRIMARY = (59, 130, 246)
    
    # Sort items by x_mu score
    sorted_items = sorted(items_data, 
                         key=lambda item: item.get('x_mu', 0), 
                         reverse=True)[:8]
    
    # Background
    draw.rectangle([x, y, x + width, y + height], fill=BACKGROUND, outline=BORDER, width=1)
    
    bar_height = 40
    bar_spacing = 10
    max_bar_width = width - 120
    
    for i, item in enumerate(sorted_items):
        item_y = y + 20 + i * (bar_height + bar_spacing)
        
        # Calculate bar width based on score
        score = item.get('x_mu', 0)
        normalized_score = max(0, min(100, (score + 100) / 2))  # 0-100 range
        bar_width = int((normalized_score / 100) * max_bar_width)
        
        # Draw progress bar matching ShadCN style
        draw.rectangle([x + 80, item_y + 15, x + 80 + max_bar_width, item_y + 25], 
                      fill=BORDER, outline=None)
        draw.rectangle([x + 80, item_y + 15, x + 80 + bar_width, item_y + 25], 
                      fill=PRIMARY, outline=None)
        
        # Item label
        item_name = item.get('label', 'Item')
        if len(item_name) > 12:
            item_name = item_name[:12] + '...'
        draw.text((x + 10, item_y + 10), item_name, fill=FOREGROUND, font=small_font)

def render_shadcn_two_axis(draw, items_data: List[Dict], x: int, y: int, width: int, height: int, font, small_font):
    """Render 2x2 grid matching ViewChart ShadCN styling"""
    BACKGROUND = (255, 255, 255)
    BORDER = (226, 232, 240)
    FOREGROUND = (9, 9, 11)
    PRIMARY = (59, 130, 246)
    
    # Draw background
    draw.rectangle([x, y, x + width, y + height], fill=BACKGROUND, outline=BORDER, width=1)
    
    # Draw center lines
    center_x = x + width // 2
    center_y = y + height // 2
    draw.line([(center_x, y), (center_x, y + height)], fill=BORDER, width=1)
    draw.line([(x, center_y), (x + width, center_y)], fill=BORDER, width=1)
    
    # Quadrant backgrounds (very subtle)
    quadrant_size = width // 2
    quadrant_colors = [
        (248, 250, 252),  # Top left - light gray
        (254, 249, 195),  # Top right - light yellow
        (254, 226, 226),  # Bottom left - light red
        (220, 252, 231)   # Bottom right - light green
    ]
    
    positions = [(x, y), (center_x, y), (x, center_y), (center_x, center_y)]
    for i, pos in enumerate(positions):
        draw.rectangle([pos[0], pos[1], pos[0] + quadrant_size, pos[1] + quadrant_size], 
                      fill=quadrant_colors[i])
    
    # Plot items
    for item in items_data[:20]:
        x_score = item.get('x_mu', 0)
        y_score = item.get('y_mu', 0)
        
        # Map scores to pixel coordinates
        pixel_x = center_x + int((x_score / 100) * (quadrant_size - 40))
        pixel_y = center_y - int((y_score / 100) * (quadrant_size - 40))
        
        # Clamp to bounds
        pixel_x = max(x + 10, min(pixel_x, x + width - 10))
        pixel_y = max(y + 10, min(pixel_y, y + height - 10))
        
        # Draw item dot
        draw.ellipse([pixel_x - 4, pixel_y - 4, pixel_x + 4, pixel_y + 4], 
                    fill=PRIMARY, outline='white', width=1)

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