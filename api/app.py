import os
import uuid
import hashlib
import secrets
import random
from datetime import datetime, timezone, timedelta
from typing import Dict
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request, Query
from fastapi.middleware.cors import CORSMiddleware
from argon2 import PasswordHasher

from models import (
    CreateChartRequest, CreateChartResponse, AddItemsRequest,
    PairVoteRequest, ExplicitVoteRequest, PublicChartResponse,
    Item, ChartSummary, AISuggestionRequest, AISuggestionResponse,
    FeedbackRequest
)
from typing import List
from database import get_connection, init_db

PEPPER = os.environ.get("PEPPER", "dev-pepper-insecure")
ph = PasswordHasher()

@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield

app = FastAPI(title="twoby", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://twoby.vercel.app", "https://twoby.ike.rs", "http://localhost:5173", "http://localhost:5174"],
    allow_origin_regex=r"https://.*\.vercel\.app",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def now_iso() -> str:
    return datetime.now(timezone.utc).replace(tzinfo=None).isoformat(timespec="seconds") + "Z"

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

def calculate_confidence_scale(vote_count: int) -> float:
    """Scale factor based on vote count - more votes = more confidence"""
    if vote_count <= 3:
        return 0.3  # Very low confidence
    elif vote_count <= 8:
        return 0.6  # Medium confidence  
    elif vote_count <= 15:
        return 0.8  # Good confidence
    else:
        return 1.0  # High confidence

def generate_smart_suggestions(title: str, mode: str, suggestion_type: str):
    """Generate contextual suggestions based on title keywords"""
    title_lower = title.lower()
    
    # Define suggestion templates based on common keywords
    item_templates = {
        'coffee': ['Starbucks', 'Blue Bottle', 'Peet\'s Coffee', 'Dunkin\'', 'Local Roasters', 'Tim Hortons', 'Costa Coffee', 'Caribou Coffee'],
        'programming': ['Python', 'JavaScript', 'Java', 'C++', 'Go', 'Rust', 'TypeScript', 'Swift', 'Kotlin', 'Ruby'],
        'movie': ['The Godfather', 'Pulp Fiction', 'The Dark Knight', 'Casablanca', 'Goodfellas', 'The Lord of the Rings', 'Star Wars', 'Inception'],
        'food': ['Pizza', 'Burgers', 'Sushi', 'Tacos', 'Pasta', 'Ice Cream', 'BBQ', 'Fried Chicken', 'Sandwiches', 'Salads'],
        'music': ['Rock', 'Pop', 'Hip Hop', 'Classical', 'Jazz', 'Electronic', 'Country', 'R&B', 'Indie', 'Folk'],
        'sport': ['Football', 'Basketball', 'Baseball', 'Soccer', 'Tennis', 'Golf', 'Swimming', 'Running', 'Cycling', 'Hockey'],
        'video game': ['The Legend of Zelda', 'Super Mario', 'Call of Duty', 'Minecraft', 'Fortnite', 'Grand Theft Auto', 'The Witcher', 'Pokemon'],
        'book': ['Harry Potter', '1984', 'To Kill a Mockingbird', 'The Great Gatsby', 'Pride and Prejudice', 'The Catcher in the Rye', 'Lord of the Flies'],
        'car': ['Toyota', 'Honda', 'Ford', 'BMW', 'Mercedes', 'Audi', 'Tesla', 'Nissan', 'Hyundai', 'Volkswagen'],
        'city': ['New York', 'Los Angeles', 'Chicago', 'Houston', 'Phoenix', 'Philadelphia', 'San Antonio', 'San Diego', 'Dallas', 'San Jose'],
        'pizza': ['Margherita', 'Pepperoni', 'Hawaiian', 'Meat Lovers', 'Vegetarian', 'BBQ Chicken', 'White Pizza', 'Buffalo Chicken'],
        'social media': ['Instagram', 'TikTok', 'Twitter/X', 'Facebook', 'YouTube', 'LinkedIn', 'Snapchat', 'Discord', 'Reddit', 'Pinterest'],
        'streaming': ['Netflix', 'Disney+', 'HBO Max', 'Amazon Prime', 'Hulu', 'Apple TV+', 'Paramount+', 'Peacock', 'YouTube TV'],
    }
    
    axis_templates = {
        'difficulty': [
            {'xLow': 'Easy', 'xHigh': 'Difficult'},
            {'xLow': 'Simple', 'xHigh': 'Complex'},
            {'xLow': 'Beginner-Friendly', 'xHigh': 'Expert-Level'},
        ],
        'quality': [
            {'xLow': 'Poor Quality', 'xHigh': 'High Quality'},
            {'xLow': 'Basic', 'xHigh': 'Premium'},
            {'xLow': 'Mediocre', 'xHigh': 'Excellent'},
        ],
        'popularity': [
            {'xLow': 'Unknown', 'xHigh': 'Very Popular'},
            {'xLow': 'Niche', 'xHigh': 'Mainstream'},
            {'xLow': 'Underrated', 'xHigh': 'Overrated'},
        ],
        'cost': [
            {'xLow': 'Cheap', 'xHigh': 'Expensive'},
            {'xLow': 'Budget', 'xHigh': 'Premium'},
            {'xLow': 'Affordable', 'xHigh': 'Luxury'},
        ],
        'taste': [
            {'xLow': 'Mild', 'xHigh': 'Strong'},
            {'xLow': 'Sweet', 'xHigh': 'Bitter'},
            {'xLow': 'Plain', 'xHigh': 'Flavorful'},
        ],
        'learning': [
            {'xLow': 'Hard to Learn', 'xHigh': 'Easy to Learn'},
            {'xLow': 'Steep Learning Curve', 'xHigh': 'Gentle Learning Curve'},
        ],
        'performance': [
            {'xLow': 'Slow', 'xHigh': 'Fast'},
            {'xLow': 'Low Performance', 'xHigh': 'High Performance'},
        ],
    }
    
    if suggestion_type == 'items':
        # Find relevant items based on title keywords
        suggested_items = []
        for keyword, items in item_templates.items():
            if keyword in title_lower:
                suggested_items.extend(items[:6])  # Take first 6 items
                break
        
        # If no specific match, provide generic suggestions based on context
        if not suggested_items:
            if any(word in title_lower for word in ['best', 'top', 'greatest', 'favorite']):
                # Generate contextual items based on the remaining words
                words = title_lower.split()
                content_words = [w for w in words if w not in ['best', 'top', 'greatest', 'favorite', 'most', 'the', 'of', 'in', 'for']]
                if content_words:
                    base_word = content_words[0]
                    suggested_items = [f"{base_word.title()} Option {i+1}" for i in range(6)]
                else:
                    suggested_items = ['Option A', 'Option B', 'Option C', 'Option D', 'Option E', 'Option F']
            else:
                suggested_items = ['Item 1', 'Item 2', 'Item 3', 'Item 4', 'Item 5', 'Item 6']
        
        return suggested_items[:8]  # Return max 8 items
    
    elif suggestion_type == 'axes':
        suggested_axes = []
        
        # Two-axis suggestions (for 2x2 grids)
        if mode == 'two_axis':
            # Common 2x2 combinations
            combinations = [
                {'xLow': 'Easy to Learn', 'xHigh': 'Hard to Learn', 'yLow': 'Low Utility', 'yHigh': 'High Utility'},
                {'xLow': 'Cheap', 'xHigh': 'Expensive', 'yLow': 'Low Quality', 'yHigh': 'High Quality'},
                {'xLow': 'Simple', 'xHigh': 'Complex', 'yLow': 'Boring', 'yHigh': 'Exciting'},
                {'xLow': 'Niche', 'xHigh': 'Popular', 'yLow': 'Old', 'yHigh': 'New'},
            ]
            
            # Try to find contextual matches
            for keyword in ['learn', 'cost', 'price', 'quality', 'popular']:
                if keyword in title_lower:
                    if keyword in ['learn']:
                        suggested_axes.extend([combinations[0]])
                    elif keyword in ['cost', 'price']:
                        suggested_axes.extend([combinations[1]])
                    elif keyword in ['quality']:
                        suggested_axes.extend([combinations[1], combinations[2]])
                    elif keyword in ['popular']:
                        suggested_axes.extend([combinations[3]])
                    break
            
            if not suggested_axes:
                suggested_axes = combinations[:2]
                
        else:  # single_axis
            # Try to find contextual single-axis suggestions
            for keyword, axes in axis_templates.items():
                if any(k in title_lower for k in keyword.split()):
                    suggested_axes.extend(axes[:2])
                    break
            
            if not suggested_axes:
                suggested_axes = [
                    {'xLow': 'Poor', 'xHigh': 'Great'},
                    {'xLow': 'Worst', 'xHigh': 'Best'},
                    {'xLow': 'Dislike', 'xHigh': 'Love'},
                ]
        
        return suggested_axes[:3]  # Return max 3 axis combinations
    
    return []

@app.post("/api/charts", response_model=CreateChartResponse)
def create_chart(payload: CreateChartRequest):
    chart_id = make_id()
    admin_key = secrets.token_urlsafe(24)
    share_key = secrets.token_urlsafe(16)
    
    # Calculate voting end date if voting period is specified
    voting_ends_at = None
    if payload.voting_period_days:
        voting_ends_at = (datetime.now(timezone.utc) + timedelta(days=payload.voting_period_days)).replace(tzinfo=None).isoformat(timespec="seconds") + "Z"
    
    with get_connection() as conn:
        cur = conn.cursor()
        cur.execute(
            """INSERT INTO charts 
            (id, mode, title, x_label, y_label, description, creator_take, voting_period_days, voting_ends_at, visibility, admin_key_hash, share_key_hash, created_at, task_description, task_image_url, tool_name, upload_images)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (chart_id, payload.mode, payload.title, payload.x_label, payload.y_label,
             payload.description, payload.creator_take, payload.voting_period_days, voting_ends_at,
             payload.visibility, argon_hash(admin_key), argon_hash(share_key), now_iso(),
             payload.task_description, payload.task_image_url, payload.tool_name, payload.upload_images)
        )
        conn.commit()
    
    return CreateChartResponse(
        id=chart_id,
        admin_url=f"/c/{chart_id}?k={admin_key}",
        share_url=f"/v/{chart_id}?s={share_key}"
    )

@app.post("/api/charts/{chart_id}/items")
def add_items(
    chart_id: str,
    payload: AddItemsRequest,
    k: str = Query(...)
):
    if not verify_capability(chart_id, k, admin=True):
        raise HTTPException(403, "Invalid admin key")
    
    with get_connection() as conn:
        cur = conn.cursor()
        for item in payload.items:
            item_id = make_id()
            cur.execute(
                "INSERT INTO items (id, chart_id, label, status) VALUES (?, ?, ?, ?)",
                (item_id, chart_id, item["label"], "active")
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


@app.put("/api/charts/{chart_id}/items/{item_id}")
def update_item(
    chart_id: str,
    item_id: str,
    k: str = Query(...),
    label: str = Query(None),
    image_url: str = Query(None)
):
    """Update an item's label or image URL"""
    if not verify_capability(chart_id, k, admin=True):
        raise HTTPException(403, "Invalid admin key")

    with get_connection() as conn:
        cur = conn.cursor()
        # Check item exists and belongs to chart
        cur.execute("SELECT id FROM items WHERE id=? AND chart_id=?", (item_id, chart_id))
        if not cur.fetchone():
            raise HTTPException(404, "Item not found")

        # Build update query dynamically
        updates = []
        params = []
        if label is not None:
            updates.append("label=?")
            params.append(label)
        if image_url is not None:
            updates.append("image_url=?")
            params.append(image_url if image_url else None)

        if updates:
            params.append(item_id)
            cur.execute(f"UPDATE items SET {', '.join(updates)} WHERE id=?", params)
            conn.commit()

    return {"ok": True}


@app.delete("/api/charts/{chart_id}/items/{item_id}")
def delete_item(
    chart_id: str,
    item_id: str,
    k: str = Query(...)
):
    """Delete an item from a chart"""
    if not verify_capability(chart_id, k, admin=True):
        raise HTTPException(403, "Invalid admin key")

    with get_connection() as conn:
        cur = conn.cursor()
        # Check item exists and belongs to chart
        cur.execute("SELECT id FROM items WHERE id=? AND chart_id=?", (item_id, chart_id))
        if not cur.fetchone():
            raise HTTPException(404, "Item not found")

        # Delete the item (scores will cascade if FK is set up, otherwise delete manually)
        cur.execute("DELETE FROM scores WHERE item_id=?", (item_id,))
        cur.execute("DELETE FROM items WHERE id=?", (item_id,))
        conn.commit()

    return {"ok": True}


@app.post("/api/vote/pair")
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

@app.post("/api/vote/explicit")
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

@app.get("/api/charts/{chart_id}/public", response_model=PublicChartResponse)
def get_public(chart_id: str, s: str = Query(...)):
    with get_connection() as conn:
        cur = conn.cursor()
        cur.execute(
            "SELECT share_key_hash, title, mode, x_label, y_label, description, creator_take, visibility FROM charts WHERE id=?",
            (chart_id,)
        )
        chart_row = cur.fetchone()
        if not chart_row:
            raise HTTPException(404, "Chart not found")

        # Allow "public" as a universal share key for public charts
        if s == "public" and chart_row["visibility"] == "public":
            pass  # Allow access
        else:
            try:
                ph.verify(chart_row["share_key_hash"], s + PEPPER)
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
        for row in cur.fetchall():
            label = row["label"]
            image_url = row["image_url"]
            
            # Handle legacy data where image URLs were concatenated with labels
            if "|" in label and not image_url:
                parts = label.split("|", 1)
                if len(parts) == 2 and parts[1].strip().startswith("http"):
                    label = parts[0].strip()
                    image_url = parts[1].strip()
            
            raw_items.append({
                **dict(row),
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
    
    return PublicChartResponse(
        title=chart_row["title"],
        mode=chart_row["mode"],
        x_label=chart_row["x_label"],
        y_label=chart_row["y_label"],
        description=chart_row["description"],
        creator_take=chart_row["creator_take"],
        items=items
    )

@app.get("/api/charts/public", response_model=List[ChartSummary])
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

@app.post("/api/ai/suggest", response_model=AISuggestionResponse)
def ai_suggest(payload: AISuggestionRequest):
    """Generate AI suggestions for items or axes based on chart title and mode"""
    
    if payload.type == "items":
        suggested_items = generate_smart_suggestions(payload.title, payload.mode, "items")
        return AISuggestionResponse(items=suggested_items)
    
    elif payload.type == "axes":
        suggested_axes = generate_smart_suggestions(payload.title, payload.mode, "axes")
        return AISuggestionResponse(axes=suggested_axes)
    
    else:
        raise HTTPException(400, "Invalid suggestion type")

@app.post("/api/ai/generate-axis-endpoints")
def generate_axis_endpoints(payload: dict):
    """Generate low/high endpoints for a simple axis label"""
    
    # For app.py, we'll provide fallback suggestions without OpenAI
    axis_label = payload.get("axis_label", "").strip()
    
    if not axis_label:
        raise HTTPException(status_code=400, detail="axis_label is required")
    
    # If it already contains an arrow, parse it
    if "→" in axis_label or "->" in axis_label:
        separator = "→" if "→" in axis_label else "->"
        parts = axis_label.split(separator)
        if len(parts) == 2:
            return {"low": parts[0].strip(), "high": parts[1].strip()}
    
    # Simple rule-based suggestions for common cases
    axis_lower = axis_label.lower()
    
    if "comfortable" in axis_lower:
        return {"low": "Uncomfortable", "high": "Very Comfortable"}
    elif "good" in axis_lower and "coffee" in axis_lower:
        return {"low": "Poor Coffee", "high": "Excellent Coffee"}
    elif "cool" in axis_lower:
        if "owner" in axis_lower or "think" in axis_lower:
            return {"low": "Owner doesn't think it's cool", "high": "Owner thinks it's very cool"}
        else:
            return {"low": "Not Cool", "high": "Very Cool"}
    elif "price" in axis_lower or "cost" in axis_lower:
        return {"low": "Cheap", "high": "Expensive"}
    elif "quality" in axis_lower:
        return {"low": "Poor Quality", "high": "High Quality"}
    elif "difficult" in axis_lower or "hard" in axis_lower:
        return {"low": "Easy", "high": "Hard"}
    elif "popular" in axis_lower:
        return {"low": "Unpopular", "high": "Very Popular"}
    elif "size" in axis_lower:
        return {"low": "Small", "high": "Large"}
    elif "speed" in axis_lower or "fast" in axis_lower:
        return {"low": "Slow", "high": "Fast"}
    else:
        # Better generic fallback
        return {"low": f"Less {axis_label}", "high": f"More {axis_label}"}

@app.post("/api/feedback")
def submit_feedback(payload: FeedbackRequest, request: Request):
    """Submit feedback about tool helpfulness"""
    session_id = request.headers.get("x-session-id", "")
    ip_hash = hash_string(request.client.host)
    
    with get_connection() as conn:
        cur = conn.cursor()
        cur.execute(
            """INSERT INTO feedback 
            (chart_id, tool_helpfulness, free_response, session_id, ip_hash, created_at)
            VALUES (?, ?, ?, ?, ?, ?)""",
            (payload.chart_id, payload.tool_helpfulness, payload.free_response, 
             session_id, ip_hash, now_iso())
        )
        conn.commit()
    
    return {"status": "success", "message": "Feedback submitted successfully"}

@app.post("/api/upload-image")
async def upload_image(request: Request):
    """Proxy image upload endpoint for Modal volumes"""
    # This will be implemented when we handle the image proxy functionality
    raise HTTPException(status_code=501, detail="Image upload not yet implemented")


# Image search with caching (using Serper.dev)
_image_cache: Dict[str, dict] = {}  # Simple in-memory cache

@app.get("/api/images/search")
async def search_images(q: str = Query(..., min_length=1, max_length=100)):
    """Search for images using Serper.dev API with caching"""
    import httpx

    # Check cache first
    cache_key = q.lower().strip()
    if cache_key in _image_cache:
        return _image_cache[cache_key]

    serper_api_key = os.environ.get("SERPER_API_KEY")

    if not serper_api_key:
        # Return empty results if not configured
        return {"results": [], "source": "none"}

    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                "https://google.serper.dev/images",
                headers={
                    "X-API-KEY": serper_api_key,
                    "Content-Type": "application/json"
                },
                json={
                    "q": q,
                    "num": 5
                },
                timeout=10.0
            )

            if response.status_code == 200:
                data = response.json()
                results = []
                for item in data.get("images", []):
                    results.append({
                        "url": item.get("imageUrl"),
                        "thumbnail": item.get("thumbnailUrl"),
                        "title": item.get("title"),
                        "source": item.get("source")
                    })

                result = {"results": results, "source": "serper"}
                # Cache successful results
                if results:
                    _image_cache[cache_key] = result
                return result
            else:
                return {"results": [], "source": "error", "error": response.status_code}

    except Exception as e:
        return {"results": [], "source": "error", "error": str(e)}

@app.get("/api/charts/{chart_id}/feedback")
def get_chart_feedback(chart_id: str, k: str = Query(..., description="Admin key")):
    """Get feedback for a chart (admin only)"""
    if not verify_capability(chart_id, k, admin=True):
        raise HTTPException(status_code=403, detail="Access denied")
    
    with get_connection() as conn:
        cur = conn.cursor()
        cur.execute(
            """SELECT tool_helpfulness, free_response, created_at 
               FROM feedback 
               WHERE chart_id = ? 
               ORDER BY created_at DESC""",
            (chart_id,)
        )
        feedback_rows = cur.fetchall()
    
    feedback_list = []
    for row in feedback_rows:
        feedback_list.append({
            "tool_helpfulness": row["tool_helpfulness"],
            "free_response": row["free_response"],
            "created_at": row["created_at"]
        })
    
    return {"feedback": feedback_list}

@app.get("/api/charts/{chart_id}/export-csv")
def export_chart_csv(chart_id: str, k: str = Query(..., description="Admin key")):
    """Export chart data and feedback as CSV (admin only)"""
    if not verify_capability(chart_id, k, admin=True):
        raise HTTPException(status_code=403, detail="Access denied")
    
    import csv
    import io
    from fastapi.responses import StreamingResponse
    
    output = io.StringIO()
    writer = csv.writer(output)
    
    with get_connection() as conn:
        cur = conn.cursor()
        
        # Get chart info
        cur.execute(
            """SELECT title, tool_name, task_description, created_at 
               FROM charts WHERE id = ?""",
            (chart_id,)
        )
        chart_info = cur.fetchone()
        
        # Get items and their scores
        cur.execute(
            """SELECT items.label, 
                      COALESCE(scores.r_x, 1000) as r_x,
                      COALESCE(scores.r_y, 1000) as r_y,
                      COALESCE(scores.x_mu, 0) as x_mu,
                      COALESCE(scores.y_mu, 0) as y_mu,
                      COALESCE(scores.tier_mu, 0) as tier_mu
               FROM items 
               LEFT JOIN scores ON items.id = scores.item_id AND items.chart_id = scores.chart_id
               WHERE items.chart_id = ?
               ORDER BY items.label""",
            (chart_id,)
        )
        items = cur.fetchall()
        
        # Get feedback
        cur.execute(
            """SELECT tool_helpfulness, free_response, created_at 
               FROM feedback 
               WHERE chart_id = ? 
               ORDER BY created_at DESC""",
            (chart_id,)
        )
        feedback_rows = cur.fetchall()
    
    # Write CSV header
    writer.writerow(['Chart Title', chart_info['title'] if chart_info else 'Unknown'])
    writer.writerow(['Tool Used', chart_info['tool_name'] if chart_info and chart_info['tool_name'] else 'Not specified'])
    writer.writerow(['Task Description', chart_info['task_description'] if chart_info and chart_info['task_description'] else 'No description'])
    writer.writerow(['Created At', chart_info['created_at'] if chart_info else 'Unknown'])
    writer.writerow([])  # Empty row
    
    # Write items data
    writer.writerow(['ITEMS AND RANKINGS'])
    writer.writerow(['Item', 'R_X Score', 'R_Y Score', 'X_Mu', 'Y_Mu', 'Tier_Mu'])
    
    for item in items:
        writer.writerow([
            item['label'],
            round(item['r_x'], 2),
            round(item['r_y'], 2),
            round(item['x_mu'], 2),
            round(item['y_mu'], 2),
            round(item['tier_mu'], 2)
        ])
    
    writer.writerow([])  # Empty row
    
    # Write feedback data
    writer.writerow(['FEEDBACK'])
    writer.writerow(['Tool Helpfulness (1-5)', 'Free Response Notes', 'Submitted At'])
    
    for feedback in feedback_rows:
        writer.writerow([
            feedback['tool_helpfulness'] if feedback['tool_helpfulness'] else 'No rating',
            feedback['free_response'] if feedback['free_response'] else 'No notes',
            feedback['created_at']
        ])
    
    output.seek(0)
    
    # Return as downloadable CSV
    response = StreamingResponse(
        io.StringIO(output.getvalue()),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=chart_{chart_id}_export.csv"}
    )
    return response

@app.get("/health")
def health_check():
    return {"status": "healthy", "service": "twoby"}