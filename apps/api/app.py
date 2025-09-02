import os
import uuid
import hashlib
import secrets
import random
from datetime import datetime, timezone
from typing import Dict
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request, Query
from fastapi.middleware.cors import CORSMiddleware
from argon2 import PasswordHasher

from models import (
    CreateChartRequest, CreateChartResponse, AddItemsRequest,
    PairVoteRequest, ExplicitVoteRequest, PublicChartResponse,
    Item, ChartSummary
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
    allow_origins=["https://twoby.ike.rs", "http://localhost:5173"],
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

@app.post("/api/charts", response_model=CreateChartResponse)
def create_chart(payload: CreateChartRequest):
    chart_id = make_id()
    admin_key = secrets.token_urlsafe(24)
    share_key = secrets.token_urlsafe(16)
    
    with get_connection() as conn:
        cur = conn.cursor()
        cur.execute(
            """INSERT INTO charts 
            (id, mode, title, x_label, y_label, visibility, admin_key_hash, share_key_hash, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (chart_id, payload.mode, payload.title, payload.x_label, payload.y_label,
             payload.visibility, argon_hash(admin_key), argon_hash(share_key), now_iso())
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
            """SELECT i.id, i.label, sc.r_x, sc.r_y, sc.x_mu, sc.y_mu, sc.tier_mu
            FROM items i
            LEFT JOIN scores sc ON sc.chart_id = i.chart_id AND sc.item_id = i.id
            WHERE i.chart_id = ? AND i.status = 'active'""",
            (chart_id,)
        )
        items = [
            Item(
                id=r["id"],
                label=r["label"],
                r_x=r["r_x"],
                r_y=r["r_y"],
                x_mu=r["x_mu"],
                y_mu=r["y_mu"],
                tier_mu=r["tier_mu"]
            )
            for r in cur.fetchall()
        ]
    
    return PublicChartResponse(
        title=row["title"],
        mode=row["mode"],
        x_label=row["x_label"],
        y_label=row["y_label"],
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

@app.get("/health")
def health_check():
    return {"status": "healthy", "service": "twoby"}