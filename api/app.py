import os
import uuid
import hashlib
import secrets
import random
import re
import io
import json
import socket
import html as html_lib
from datetime import datetime, timezone, timedelta
from typing import Dict
from contextlib import asynccontextmanager
from urllib.parse import urlparse, parse_qs, urlencode
from urllib import request as urllib_request, error as urllib_error

from fastapi import FastAPI, HTTPException, Request, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, Response
from argon2 import PasswordHasher
from PIL import Image as PILImage, ImageDraw, ImageFont

from models import (
    CreateChartRequest, CreateChartResponse, AddItemsRequest,
    PairVoteRequest, ExplicitVoteRequest, PublicChartResponse,
    Item, ChartSummary, AISuggestionRequest, AISuggestionResponse,
    FeedbackRequest, CreateShortUrlRequest, CreateShortUrlResponse,
    ChartFeedItem, AdminChartUpdateRequest, OwnerChartSettingsRequest
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

_URL_IN_TEXT_RE = re.compile(r"(https?://|www\.)", re.IGNORECASE)
_NON_ALNUM_RE = re.compile(r"[^a-z0-9\s]")
_BAD_WORDS = {
    "fuck", "fucking", "fucked", "shit", "shitty", "bitch", "bastard",
    "asshole", "cunt", "dick", "pussy", "slut", "whore", "retard",
    "nigger", "nigga", "faggot", "porn", "pornhub", "xvideos", "xnxx",
}
_IMAGE_BLOCKED_HOST_TOKENS = {
    "porn", "xxx", "xvideos", "xnxx", "redtube", "youporn", "hentai",
}
_SUGGESTION_STOP_WORDS = {
    "a", "an", "the", "and", "or", "for", "of", "to", "in", "on", "with", "vs",
    "best", "top", "my", "our", "your", "favorite", "favourite",
}
_SUGGESTION_GENERIC_PHRASES = {
    "option", "pick", "item", "choice", "entry", "rank", "ranking", "list",
    "best", "top", "map", "guide", "tips", "explained", "chapter", "season",
    "location", "locations", "named",
}
_SUGGESTION_WEB_NOISE_TOKENS = {
    "wiki", "fandom", "stats", "statistics", "map", "maps",
    "poi", "points", "interest", "current", "battle", "royale",
    "chapter", "season", "guide", "guides", "news", "latest",
}
_SUGGESTION_CACHE_TTL_SECONDS = int(os.environ.get("AI_SUGGESTION_CACHE_TTL_SECONDS", "43200"))
_SUGGESTION_CACHE_VERSION = os.environ.get("AI_SUGGESTION_CACHE_VERSION", "v6")

def _normalize_whitespace(value: str) -> str:
    return re.sub(r"\s+", " ", (value or "").strip())

def _contains_bad_language(value: str) -> bool:
    normalized = _NON_ALNUM_RE.sub(" ", (value or "").lower())
    tokens = {t for t in normalized.split() if t}
    return any(token in _BAD_WORDS for token in tokens)

def _validate_user_text(value: str, *, field_name: str, allow_blank: bool, max_length: int) -> str:
    if value is None:
        return ""
    clean = _normalize_whitespace(value)
    if not clean:
        if allow_blank:
            return ""
        raise HTTPException(400, f"{field_name} is required")
    if len(clean) > max_length:
        raise HTTPException(400, f"{field_name} is too long")
    if _URL_IN_TEXT_RE.search(clean):
        raise HTTPException(400, f"{field_name} cannot contain URLs")
    if _contains_bad_language(clean):
        raise HTTPException(400, f"{field_name} contains restricted language")
    return clean

def _validate_image_url(value: str) -> str:
    clean = (value or "").strip()
    if not clean:
        return ""
    if len(clean) > 500:
        raise HTTPException(400, "image URL is too long")
    try:
        parsed = urlparse(clean)
    except Exception:
        raise HTTPException(400, "invalid image URL")
    if parsed.scheme not in {"http", "https"}:
        raise HTTPException(400, "image URL must use http/https")
    host = (parsed.hostname or "").lower()
    if not host:
        raise HTTPException(400, "invalid image URL host")
    for token in _IMAGE_BLOCKED_HOST_TOKENS:
        if token in host:
            raise HTTPException(400, "image host is not allowed")
    return clean

def _normalize_title_for_cache(title: str) -> str:
    title = _normalize_whitespace(title).lower()
    title = _NON_ALNUM_RE.sub(" ", title)
    return _normalize_whitespace(title)

def _suggestion_cache_key(*, title_norm: str, mode: str, suggestion_type: str) -> str:
    raw = f"{_SUGGESTION_CACHE_VERSION}|{mode}|{suggestion_type}|{title_norm}"
    return hashlib.sha256(raw.encode()).hexdigest()

def _cache_get_ai_suggestion(*, title_norm: str, mode: str, suggestion_type: str):
    cache_key = _suggestion_cache_key(title_norm=title_norm, mode=mode, suggestion_type=suggestion_type)
    with get_connection() as conn:
        cur = conn.cursor()
        cur.execute(
            "SELECT response_json, expires_at FROM ai_suggestion_cache WHERE cache_key=? LIMIT 1",
            (cache_key,),
        )
        row = cur.fetchone()
        if not row:
            return None
        expires_at = dict(row).get("expires_at") or ""
        if expires_at and _parse_created_at(expires_at) <= datetime.now(timezone.utc).replace(tzinfo=None):
            cur.execute("DELETE FROM ai_suggestion_cache WHERE cache_key=?", (cache_key,))
            conn.commit()
            return None
        try:
            return json.loads(dict(row).get("response_json") or "{}")
        except Exception:
            return None

def _cache_set_ai_suggestion(*, title_norm: str, mode: str, suggestion_type: str, payload: dict) -> None:
    cache_key = _suggestion_cache_key(title_norm=title_norm, mode=mode, suggestion_type=suggestion_type)
    created_at = now_iso()
    expires_at = (
        datetime.now(timezone.utc) + timedelta(seconds=_SUGGESTION_CACHE_TTL_SECONDS)
    ).replace(tzinfo=None).isoformat(timespec="seconds") + "Z"
    with get_connection() as conn:
        cur = conn.cursor()
        cur.execute("DELETE FROM ai_suggestion_cache WHERE cache_key=?", (cache_key,))
        cur.execute(
            """INSERT INTO ai_suggestion_cache
               (cache_key, title_norm, mode, suggestion_type, response_json, created_at, expires_at)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (
                cache_key,
                title_norm,
                mode,
                suggestion_type,
                json.dumps(payload),
                created_at,
                expires_at,
            ),
        )
        conn.commit()

def _extract_topic_keywords(title: str) -> list[str]:
    tokens = re.findall(r"[a-z0-9]+", (title or "").lower())
    keywords: list[str] = []
    for token in tokens:
        if token in _SUGGESTION_STOP_WORDS:
            continue
        if len(token) < 3:
            continue
        keywords.append(token)
    return keywords[:4]

def _is_placeholder_item_label(value: str) -> bool:
    lower = (value or "").strip().lower()
    if not lower:
        return True

    if re.search(r"\b(?:option|pick|item|choice|entry)\s*\d+\b", lower):
        return True
    if re.search(r"^\d+$", lower):
        return True

    words = [w for w in re.findall(r"[a-z0-9']+", lower) if w]
    if words and len(words) <= 3 and all(w in _SUGGESTION_GENERIC_PHRASES for w in words):
        return True

    return False

def _sanitize_item_candidate(raw: str, *, title: str = "") -> str:
    clean = _normalize_whitespace(raw or "")
    if not clean:
        return ""

    clean = re.sub(r"^[\+\-\*\d\.\)\(]+", "", clean).strip()
    clean = clean.strip("`\"'“”‘’[]{}<>|•")
    clean = _normalize_whitespace(clean)
    if not clean:
        return ""

    if len(clean) < 2 or len(clean) > 48:
        return ""
    if len(clean.split()) > 6:
        return ""
    if _URL_IN_TEXT_RE.search(clean) or _contains_bad_language(clean):
        return ""
    if _is_placeholder_item_label(clean):
        return ""
    if title and clean.lower() == title.strip().lower():
        return ""

    lower = clean.lower()
    if re.search(r"\b(?:top|best)\s+\d+\b", lower):
        return ""
    if lower.startswith(("best ", "top ", "all ", "ultimate ", "complete ")):
        return ""

    words = [w for w in re.findall(r"[a-z0-9']+", lower) if w]
    title_words = {w for w in re.findall(r"[a-z0-9']+", (title or "").lower()) if len(w) > 2}
    generic_hits = sum(1 for w in words if w in _SUGGESTION_GENERIC_PHRASES)
    if generic_hits >= 2 and len(words) >= 3:
        return ""
    if len(words) <= 5 and any(w in _SUGGESTION_WEB_NOISE_TOKENS for w in words):
        return ""
    if len(words) == 1 and words[0] in _SUGGESTION_GENERIC_PHRASES:
        return ""
    if len(words) == 1 and words[0] in title_words:
        return ""

    return clean

def _extract_search_item_candidates(text: str) -> list[str]:
    clean = _normalize_whitespace(text or "")
    if not clean:
        return []

    candidates: list[str] = []

    # Quoted phrases are often the most direct entity labels.
    for quoted in re.findall(r'"([^"]{2,64})"', clean):
        candidates.append(quoted)

    # Split common list delimiters from titles/snippets.
    pieces = re.split(r"[|•]|(?:\s[-–—]\s)|:|;|/|,", clean)
    for piece in pieces:
        p = _normalize_whitespace(piece)
        if p:
            candidates.append(p)

    # Capture short proper-noun phrases.
    for phrase in re.findall(r"\b[A-Z0-9][A-Za-z0-9'&\.-]*(?:\s+[A-Z0-9][A-Za-z0-9'&\.-]*){0,3}\b", clean):
        candidates.append(phrase)

    return candidates

def _try_search_suggestions(title: str, *, limit: int = 10) -> list[str]:
    serper_api_key = os.environ.get("SERPER_API_KEY")
    if not serper_api_key:
        return []

    query = _normalize_whitespace(title)
    if not query:
        return []

    body = {"q": f"{query} list", "num": 10, "gl": "us", "hl": "en"}
    req = urllib_request.Request(
        "https://google.serper.dev/search",
        data=json.dumps(body).encode("utf-8"),
        headers={
            "X-API-KEY": serper_api_key,
            "Content-Type": "application/json",
        },
        method="POST",
    )

    try:
        with urllib_request.urlopen(req, timeout=1.8) as resp:
            payload = json.loads(resp.read().decode("utf-8"))
    except (urllib_error.URLError, urllib_error.HTTPError, TimeoutError, socket.timeout, json.JSONDecodeError, ValueError):
        return []

    raw_candidates: list[str] = []

    for row in payload.get("organic", [])[:8]:
        if not isinstance(row, dict):
            continue
        raw_candidates.extend(_extract_search_item_candidates(str(row.get("title") or "")))
        raw_candidates.extend(_extract_search_item_candidates(str(row.get("snippet") or "")))

    for row in payload.get("peopleAlsoAsk", [])[:4]:
        if not isinstance(row, dict):
            continue
        raw_candidates.extend(_extract_search_item_candidates(str(row.get("question") or "")))
        raw_candidates.extend(_extract_search_item_candidates(str(row.get("snippet") or "")))

    cleaned: list[str] = []
    seen: set[str] = set()
    for candidate in raw_candidates:
        value = _sanitize_item_candidate(candidate, title=title)
        if not value:
            continue
        key = value.lower()
        if key in seen:
            continue
        seen.add(key)
        cleaned.append(value)
        if len(cleaned) >= limit:
            break

    return cleaned

def _try_llm_suggestions(title: str, mode: str, suggestion_type: str):
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        return None

    model = os.environ.get("OPENAI_SUGGEST_MODEL", "gpt-4o-mini")
    if suggestion_type == "items":
        instruction = (
            "Return strict JSON with an `items` array of 8 to 12 concrete candidates for this chart topic. "
            "Use real entities or named options that users recognize. "
            "Never output placeholders like 'Option 1', 'Pick 1', or generic filler. "
            "No profanity, hate, sexual content, or URLs."
        )
        shape_example = {"items": ["Example A", "Example B", "Example C"]}
    else:
        instruction = (
            "Return strict JSON with an `axes` array of 2 to 3 axis options. "
            "Each axis option must include xLow, xHigh, yLow, yHigh. "
            "No profanity, hate, sexual content, or URLs."
        )
        shape_example = {"axes": [{"xLow": "Low", "xHigh": "High", "yLow": "Bad", "yHigh": "Great"}]}

    prompt = (
        f"Topic title: {title}\n"
        f"Mode: {mode}\n"
        f"Suggestion type: {suggestion_type}\n"
        f"Output schema example: {json.dumps(shape_example)}"
    )
    body = {
        "model": model,
        "temperature": 0.2,
        "messages": [
            {"role": "system", "content": instruction},
            {"role": "user", "content": prompt},
        ],
        "max_tokens": 240,
        "response_format": {"type": "json_object"},
    }

    req = urllib_request.Request(
        "https://api.openai.com/v1/chat/completions",
        data=json.dumps(body).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with urllib_request.urlopen(req, timeout=2.2) as resp:
            payload = json.loads(resp.read().decode("utf-8"))
        content = payload.get("choices", [{}])[0].get("message", {}).get("content", "")
        if not content:
            return None
        return json.loads(content)
    except (urllib_error.URLError, urllib_error.HTTPError, TimeoutError, socket.timeout, json.JSONDecodeError, ValueError):
        return None

def _chart_voting_active(voting_ends_at: str, is_voting_paused: bool) -> bool:
    if is_voting_paused:
        return False
    if not voting_ends_at:
        return True
    try:
        return _parse_created_at(voting_ends_at) > datetime.now(timezone.utc).replace(tzinfo=None)
    except Exception:
        return True

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
    """Generate quick local suggestions with topic-aware fallbacks."""
    title_lower = (title or "").lower()

    item_templates = {
        "program": ["Python", "JavaScript", "TypeScript", "Go", "Rust", "Java", "C++", "Ruby"],
        "language": ["Python", "JavaScript", "TypeScript", "Go", "Rust", "Java", "C++", "Swift"],
        "movie": ["The Godfather", "Pulp Fiction", "The Dark Knight", "Inception", "Interstellar", "Parasite", "The Matrix", "Spirited Away"],
        "film": ["The Godfather", "Pulp Fiction", "The Dark Knight", "Inception", "Interstellar", "Parasite", "The Matrix", "Spirited Away"],
        "tv": ["Breaking Bad", "The Sopranos", "Succession", "The Office", "The Wire", "Severance", "The Bear", "Better Call Saul"],
        "show": ["Breaking Bad", "The Sopranos", "Succession", "The Office", "The Wire", "Severance", "The Bear", "Better Call Saul"],
        "game": ["Minecraft", "Fortnite", "Elden Ring", "Zelda", "Call of Duty", "Valorant", "Stardew Valley", "Among Us"],
        "fortnite": ["Tilted Towers", "Retail Row", "Pleasant Park", "Greasy Grove", "Salty Springs", "Loot Lake", "Mega City", "Frenzy Fields"],
        "location": ["Downtown", "Suburbs", "Beachfront", "Old Town", "Industrial Zone", "Chinatown", "Midtown", "Waterfront"],
        "coffee": ["Starbucks", "Blue Bottle", "Peet's", "Dunkin'", "Local Roaster", "Tim Hortons", "Costa Coffee", "Caribou Coffee"],
        "pizza": ["Pepperoni", "Mushrooms", "Pineapple", "Sausage", "Olives", "Anchovies", "Onions", "Jalapenos"],
        "food": ["Pizza", "Tacos", "Burgers", "Sushi", "Pasta", "BBQ", "Sandwiches", "Wings"],
        "park": ["Yosemite", "Yellowstone", "Zion", "Acadia", "Grand Canyon", "Olympic", "Joshua Tree", "Glacier"],
        "book": ["1984", "Dune", "The Hobbit", "Pride and Prejudice", "The Alchemist", "The Great Gatsby", "Sapiens", "Atomic Habits"],
        "phone": ["iPhone", "Pixel", "Galaxy", "OnePlus", "Nothing Phone", "Motorola Razr", "Xiaomi", "Asus ROG"],
        "car": ["Toyota", "Honda", "Tesla", "BMW", "Audi", "Ford", "Hyundai", "Subaru"],
        "social": ["TikTok", "Instagram", "X", "Reddit", "YouTube", "Facebook", "Discord", "Snapchat"],
    }

    if suggestion_type == "items":
        items: list[str] = []
        for token, values in item_templates.items():
            if token in title_lower:
                items = values[:]
                break

        return items[:8]

    if suggestion_type == "axes":
        if mode == "two_axis":
            return [
                {"xLow": "Underrated", "xHigh": "Overrated", "yLow": "Boring", "yHigh": "Fun"},
                {"xLow": "Cheap", "xHigh": "Expensive", "yLow": "Bad", "yHigh": "Great"},
                {"xLow": "Niche", "xHigh": "Mainstream", "yLow": "Weak", "yHigh": "Strong"},
            ]
        return [
            {"xLow": "Low", "xHigh": "High"},
            {"xLow": "Worst", "xHigh": "Best"},
            {"xLow": "Dislike", "xHigh": "Love"},
        ]

    return []

def get_public_base_url(request: Request) -> str:
    public_url = os.environ.get("PUBLIC_APP_URL")
    if public_url:
        return public_url.rstrip("/")

    proto = request.headers.get("x-forwarded-proto") or request.url.scheme
    host = request.headers.get("x-forwarded-host") or request.headers.get("host") or request.url.netloc
    return f"{proto}://{host}".rstrip("/")

def get_public_short_base_url(request: Request) -> str:
    short_url = os.environ.get("PUBLIC_SHORT_BASE_URL")
    if short_url:
        return short_url.rstrip("/")
    return get_public_base_url(request)

def _clean_footer_text(value: str) -> str:
    raw = _normalize_whitespace(value or "")
    if not raw:
        return ""
    # Keep host-like values concise and stable in previews.
    candidate = raw
    if "://" in candidate:
        try:
            parsed = urlparse(candidate)
            candidate = parsed.hostname or candidate
        except Exception:
            pass
    candidate = candidate.split("/")[0].strip()
    candidate = _normalize_whitespace(candidate)
    if not candidate:
        return ""
    if _contains_bad_language(candidate):
        return ""
    return candidate[:80]

def _derive_footer_host(value: str) -> str:
    if not value:
        return ""
    try:
        parsed = urlparse(value if "://" in value else f"https://{value}")
        return _clean_footer_text(parsed.hostname or value)
    except Exception:
        return _clean_footer_text(value)

def get_og_footer_text(request: Request, preferred: str = "") -> str:
    explicit = _clean_footer_text(os.environ.get("OG_FOOTER_TEXT", ""))
    if explicit:
        return explicit

    preferred_host = _derive_footer_host(preferred)
    if preferred_host:
        return preferred_host

    configured_public = os.environ.get("PUBLIC_APP_URL", "")
    configured_host = _derive_footer_host(configured_public)
    if configured_host:
        return configured_host

    request_base = get_public_base_url(request)
    request_host = _derive_footer_host(request_base)
    # Avoid leaking infra domains into share graphics.
    if request_host.endswith(".railway.app") or request_host.endswith(".up.railway.app"):
        fallback_host = _clean_footer_text(os.environ.get("PUBLIC_SITE_HOST", "twoby.vercel.app"))
        if fallback_host:
            return fallback_host
    return request_host or "twoby.vercel.app"

def _allowed_redirect_hosts(request: Request) -> set[str]:
    hosts: set[str] = set()

    # Explicitly allow the public app URL (recommended for production).
    public_url = os.environ.get("PUBLIC_APP_URL")
    if public_url:
        try:
            parsed = urlparse(public_url)
            if parsed.hostname:
                hosts.add(parsed.hostname)
        except Exception:
            pass

    # Common defaults
    hosts.update({"twoby.ike.rs", "twoby.vercel.app", "localhost", "127.0.0.1"})

    for header in ("x-forwarded-host", "host"):
        value = request.headers.get(header)
        if value:
            hosts.add(value.split(":")[0])

    return hosts

def _is_allowed_redirect_url(url: str, request: Request) -> bool:
    if not url:
        return False

    if url.startswith("/"):
        return True

    try:
        parsed = urlparse(url)
    except Exception:
        return False

    if parsed.scheme not in {"http", "https"}:
        return False

    host = parsed.hostname
    if not host:
        return False

    return host in _allowed_redirect_hosts(request)

_SHORT_CODE_ALLOWED = re.compile(r"[^a-z0-9-]+")
def normalize_short_code(code: str) -> str:
    code = (code or "").strip().lower()
    code = _SHORT_CODE_ALLOWED.sub("-", code)
    code = re.sub(r"-{2,}", "-", code).strip("-")
    return code[:64]

def _load_font(size: int, bold: bool = False) -> ImageFont.ImageFont:
    candidates: list[str] = []
    if bold:
        candidates.extend([
            "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
            "/usr/share/fonts/truetype/dejavu/DejaVuSansCondensed-Bold.ttf",
            "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
            "/System/Library/Fonts/Supplemental/Helvetica Bold.ttf",
        ])
    else:
        candidates.extend([
            "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
            "/usr/share/fonts/truetype/dejavu/DejaVuSansCondensed.ttf",
            "/System/Library/Fonts/Supplemental/Arial.ttf",
            "/System/Library/Fonts/Supplemental/Helvetica.ttf",
        ])

    for path in candidates:
        try:
            return ImageFont.truetype(path, size)
        except Exception:
            continue
    return ImageFont.load_default()

def _score_to_xy(item_row: dict) -> tuple[float, float, bool]:
    # Match the frontend scaling for two_axis charts.
    has_x = item_row.get("x_mu") is not None or (item_row.get("r_x") is not None and abs(float(item_row["r_x"]) - 1000) > 5)
    has_y = item_row.get("y_mu") is not None or (item_row.get("r_y") is not None and abs(float(item_row["r_y"]) - 1000) > 5)

    if has_x:
        x = float(item_row["x_mu"]) if item_row.get("x_mu") is not None else (float(item_row.get("r_x") or 1000) - 1000) / 5.0
    else:
        x = (random.random() - 0.5) * 140.0

    if has_y:
        y = float(item_row["y_mu"]) if item_row.get("y_mu") is not None else (float(item_row.get("r_y") or 1000) - 1000) / 5.0
    else:
        y = (random.random() - 0.5) * 140.0

    x = max(-100.0, min(100.0, x))
    y = max(-100.0, min(100.0, y))
    return x, y, bool(has_x or has_y)

def _quantile_positions(items: list[dict]) -> list[dict]:
    """Apply quantile spreading + confidence gravity to item positions.
    Returns items with 'x_pct' and 'y_pct' fields (0-100)."""
    CONFIDENCE_THRESHOLD = 8

    x_scored = []
    y_scored = []
    meta = {}
    for it in items:
        x, y, has_data = _score_to_xy(it)
        n_x = int(it.get("n_x") or 0)
        n_y = int(it.get("n_y") or 0)
        has_x = it.get("x_mu") is not None or (it.get("r_x") is not None and abs(float(it.get("r_x", 1000)) - 1000) > 5)
        has_y = it.get("y_mu") is not None or (it.get("r_y") is not None and abs(float(it.get("r_y", 1000)) - 1000) > 5)
        meta[it["id"]] = {"x": x, "y": y, "has_x": has_x, "has_y": has_y, "n_x": n_x, "n_y": n_y, "has_data": has_data}
        if has_x:
            x_scored.append((it["id"], x))
        if has_y:
            y_scored.append((it["id"], y))

    def quantiles(scored):
        if len(scored) <= 3:
            return {sid: ((val + 100) / 200) * 100 for sid, val in scored}
        sorted_s = sorted(scored, key=lambda s: s[1])
        result = {}
        for i, (sid, _) in enumerate(sorted_s):
            q = i / (len(sorted_s) - 1) if len(sorted_s) > 1 else 0.5
            result[sid] = 5 + q * 90
        return result

    x_q = quantiles(x_scored)
    y_q = quantiles(y_scored)

    result = []
    for it in items:
        m = meta[it["id"]]
        iid = it["id"]

        if m["has_x"] and iid in x_q:
            xp = x_q[iid]
        else:
            random.seed(iid + "-x")
            raw = random.random()
            xp = raw * 40 + 5 if raw < 0.5 else raw * 40 + 55

        if m["has_y"] and iid in y_q:
            yp = 100 - y_q[iid]  # invert Y for screen coords
        else:
            random.seed(iid + "-y")
            raw = random.random()
            yp = raw * 40 + 5 if raw < 0.5 else raw * 40 + 55

        n_votes = max(m["n_x"], m["n_y"])
        confidence = min(1.0, n_votes / CONFIDENCE_THRESHOLD)

        if m["has_data"] and confidence < 1:
            qcx = 25 if xp < 50 else 75
            qcy = 25 if yp < 50 else 75
            xp = qcx + (xp - qcx) * confidence
            yp = qcy + (yp - qcy) * confidence

        result.append({**it, "x_pct": xp, "y_pct": yp, "has_data": m["has_data"], "confidence": confidence})

    return result


def _render_chart_og_png(
    *,
    chart: dict,
    items: list[dict],
    vote_count: int,
    og_type: str,
    footer_text: str,
) -> bytes:
    width, height = 1200, 630
    img = PILImage.new("RGB", (width, height), (255, 255, 255))
    draw = ImageDraw.Draw(img)

    title_font = _load_font(28, bold=True)
    label_font = _load_font(18, bold=True)
    item_font = _load_font(16, bold=True)
    small_font = _load_font(12, bold=False)
    black = (28, 25, 23)       # stone-900
    gray400 = (168, 162, 158)  # stone-400
    gray300 = (214, 211, 209)  # stone-300

    title = (chart.get("title") or "twoby").strip()
    mode = chart.get("mode") or "two_axis"
    x_label = chart.get("x_label") or "Low → High"
    y_label = chart.get("y_label") or "Low → High"

    if mode == "two_axis":
        margin = 60
        chart_size = min(width, height) - margin * 2
        cx = width // 2
        cy = height // 2
        left = cx - chart_size // 2
        top = cy - chart_size // 2
        right = left + chart_size
        bottom = top + chart_size
        mid_x = (left + right) // 2
        mid_y = (top + bottom) // 2

        # Axes
        draw.line((mid_x, top, mid_x, bottom), fill=black, width=2)
        draw.line((left, mid_y, right, mid_y), fill=black, width=2)

        # Arrow tips
        draw.polygon([(mid_x - 5, top + 8), (mid_x + 5, top + 8), (mid_x, top)], fill=black)
        draw.polygon([(mid_x - 5, bottom - 8), (mid_x + 5, bottom - 8), (mid_x, bottom)], fill=black)
        draw.polygon([(right - 8, mid_y - 5), (right - 8, mid_y + 5), (right, mid_y)], fill=black)
        draw.polygon([(left + 8, mid_y - 5), (left + 8, mid_y + 5), (left, mid_y)], fill=black)

        # Axis labels
        x_parts = [p.strip() for p in x_label.split("→")]
        y_parts = [p.strip() for p in y_label.split("→")]
        x_low = x_parts[0] if len(x_parts) > 0 else "Low"
        x_high = x_parts[1] if len(x_parts) > 1 else "High"
        y_low = y_parts[0] if len(y_parts) > 0 else "Low"
        y_high = y_parts[1] if len(y_parts) > 1 else "High"

        draw.text((left, mid_y + 6), x_low, fill=black, font=label_font)
        xhw = draw.textlength(x_high, font=label_font)
        draw.text((right - xhw, mid_y + 6), x_high, fill=black, font=label_font)
        yhw = draw.textlength(y_high, font=label_font)
        draw.text((mid_x - yhw / 2, top - 24), y_high, fill=black, font=label_font)
        ylw = draw.textlength(y_low, font=label_font)
        draw.text((mid_x - ylw / 2, bottom + 8), y_low, fill=black, font=label_font)

        # Place items with quantile spreading
        positioned = _quantile_positions(items)
        inner_left = left + 30
        inner_top = top + 20
        inner_w = chart_size - 60
        inner_h = chart_size - 40

        for it in positioned:
            px = inner_left + (it["x_pct"] / 100) * inner_w
            py = inner_top + (it["y_pct"] / 100) * inner_h
            label_text = it["label"]
            if len(label_text) > 24:
                label_text = label_text[:23] + "…"

            conf = it.get("confidence", 0)
            if not it["has_data"]:
                color = gray300
            elif conf < 0.5:
                color = gray400
            else:
                color = black

            tw = draw.textlength(label_text, font=item_font)
            draw.text((px - tw / 2, py - 8), label_text, fill=color, font=item_font)

        # Title top-left
        draw.text((12, 8), title, fill=black, font=title_font)
        meta = f"{vote_count} votes"
        draw.text((12, 38), meta, fill=gray400, font=small_font)

        # Branding bottom-right
        bw = draw.textlength("twoby", font=small_font)
        draw.text((width - bw - 12, height - 20), "twoby", fill=gray300, font=small_font)

    else:
        # Non-two_axis: simple list layout with white bg
        draw.text((40, 20), title, fill=black, font=title_font)
        shown = [it["label"] for it in items[:10]]
        for idx, label in enumerate(shown):
            y0 = 60 + idx * 28
            display = label if len(label) <= 40 else label[:39] + "…"
            draw.text((50, y0), f"• {display}", fill=black, font=item_font)
        bw = draw.textlength("twoby", font=small_font)
        draw.text((width - bw - 12, height - 20), "twoby", fill=gray300, font=small_font)

    out = io.BytesIO()
    img.save(out, format="PNG", optimize=True)
    return out.getvalue()

def _parse_created_at(value: str) -> datetime:
    clean = (value or "").replace("+00:00Z", "Z")
    if clean.endswith("Z"):
        clean = clean[:-1]
    try:
        return datetime.fromisoformat(clean)
    except Exception:
        return datetime.now(timezone.utc).replace(tzinfo=None)

def _trending_score(vote_count: int, created_at: str) -> float:
    created = _parse_created_at(created_at)
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    age_hours = max(0.0, (now - created).total_seconds() / 3600.0)
    return float(vote_count) / ((age_hours + 2.0) ** 1.35)

def _require_admin(request: Request) -> None:
    token = os.environ.get("ADMIN_TOKEN")
    if not token:
        raise HTTPException(503, "Admin is not configured")

    auth = request.headers.get("authorization") or ""
    provided = ""
    if auth.lower().startswith("bearer "):
        provided = auth.split(" ", 1)[1].strip()
    if not provided:
        provided = request.query_params.get("token", "")

    if not provided or not secrets.compare_digest(provided, token):
        raise HTTPException(403, "Forbidden")

@app.post("/api/charts", response_model=CreateChartResponse)
def create_chart(payload: CreateChartRequest):
    chart_id = make_id()
    admin_key = secrets.token_urlsafe(24)
    share_key = secrets.token_urlsafe(16)

    title = _validate_user_text(payload.title, field_name="title", allow_blank=False, max_length=200)
    x_label = _validate_user_text(payload.x_label or "", field_name="x_label", allow_blank=True, max_length=100) or None
    y_label = _validate_user_text(payload.y_label or "", field_name="y_label", allow_blank=True, max_length=100) or None
    description = _validate_user_text(payload.description or "", field_name="description", allow_blank=True, max_length=500) or None
    creator_take = _validate_user_text(payload.creator_take or "", field_name="creator_take", allow_blank=True, max_length=1000) or None
    task_description = _validate_user_text(payload.task_description or "", field_name="task_description", allow_blank=True, max_length=1000) or None
    tool_name = _validate_user_text(payload.tool_name or "OpenEvidence", field_name="tool_name", allow_blank=True, max_length=100) or "OpenEvidence"
    task_image_url = _validate_image_url(payload.task_image_url or "") or None
    
    # Calculate voting end date if voting period is specified
    voting_ends_at = None
    if payload.voting_period_days:
        voting_ends_at = (datetime.now(timezone.utc) + timedelta(days=payload.voting_period_days)).replace(tzinfo=None).isoformat(timespec="seconds") + "Z"
    
    with get_connection() as conn:
        cur = conn.cursor()
        cur.execute(
            """INSERT INTO charts 
            (id, mode, title, x_label, y_label, description, creator_take, voting_period_days, voting_ends_at, visibility, is_voting_paused, admin_key_hash, share_key_hash, created_at, task_description, task_image_url, tool_name, upload_images)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (chart_id, payload.mode, title, x_label, y_label,
             description, creator_take, payload.voting_period_days, voting_ends_at,
             payload.visibility, 0, argon_hash(admin_key), argon_hash(share_key), now_iso(),
             task_description, task_image_url, tool_name, payload.upload_images)
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

    validated_items: List[tuple] = []
    seen_labels: set[str] = set()
    for raw_item in payload.items:
        if not isinstance(raw_item, dict):
            raise HTTPException(400, "each item must be an object")
        label = _validate_user_text(
            str(raw_item.get("label", "")),
            field_name="item label",
            allow_blank=False,
            max_length=120,
        )
        image_url_raw = raw_item.get("image_url")
        image_url = _validate_image_url(str(image_url_raw)) if image_url_raw else ""
        key = label.lower()
        if key in seen_labels:
            continue
        seen_labels.add(key)
        validated_items.append((label, image_url or None))

    if not validated_items:
        raise HTTPException(400, "No valid items provided")
    
    with get_connection() as conn:
        cur = conn.cursor()
        for label, image_url in validated_items:
            item_id = make_id()
            cur.execute(
                "INSERT INTO items (id, chart_id, label, image_url, status) VALUES (?, ?, ?, ?, ?)",
                (item_id, chart_id, label, image_url, "active")
            )
            # Neutral starting score; UI can display a preliminary spread before votes.
            start_r_x = 1000
            start_r_y = 1000
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
            clean_label = _validate_user_text(label, field_name="item label", allow_blank=False, max_length=120)
            updates.append("label=?")
            params.append(clean_label)
        if image_url is not None:
            clean_image_url = _validate_image_url(image_url) if image_url else ""
            updates.append("image_url=?")
            params.append(clean_image_url if clean_image_url else None)

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
            "SELECT voting_ends_at, COALESCE(is_voting_paused, 0) as is_voting_paused FROM charts WHERE id=? LIMIT 1",
            (payload.chart_id,),
        )
        chart_row = cur.fetchone()
        if not chart_row:
            raise HTTPException(404, "Chart not found")
        chart_dict = dict(chart_row)
        if not _chart_voting_active(chart_dict.get("voting_ends_at"), bool(chart_dict.get("is_voting_paused"))):
            raise HTTPException(409, "Voting is closed for this chart")

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
            "SELECT voting_ends_at, COALESCE(is_voting_paused, 0) as is_voting_paused FROM charts WHERE id=? LIMIT 1",
            (payload.chart_id,),
        )
        chart_row = cur.fetchone()
        if not chart_row:
            raise HTTPException(404, "Chart not found")
        chart_dict = dict(chart_row)
        if not _chart_voting_active(chart_dict.get("voting_ends_at"), bool(chart_dict.get("is_voting_paused"))):
            raise HTTPException(409, "Voting is closed for this chart")

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
            """SELECT share_key_hash, title, mode, x_label, y_label, description, creator_take, visibility,
                      voting_ends_at, COALESCE(is_voting_paused, 0) as is_voting_paused
               FROM charts WHERE id=?""",
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
                      sc.r_x, sc.r_y, sc.x_mu, sc.y_mu, sc.tier_mu, sc.n_x, sc.n_y
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
                tier_mu=r["tier_mu"],
                n_x=r.get("n_x"),
                n_y=r.get("n_y")
            )
            for r in raw_items
        ]

    chart_dict = dict(chart_row)
    voting_ends_at = chart_dict.get("voting_ends_at")
    is_voting_paused = bool(chart_dict.get("is_voting_paused"))
    voting_active = _chart_voting_active(voting_ends_at, is_voting_paused)
    
    return PublicChartResponse(
        title=chart_row["title"],
        mode=chart_row["mode"],
        x_label=chart_row["x_label"],
        y_label=chart_row["y_label"],
        description=chart_row["description"],
        creator_take=chart_row["creator_take"],
        items=items,
        voting_active=voting_active,
        ends_at=voting_ends_at,
        is_voting_paused=is_voting_paused,
    )

@app.get("/api/charts/public", response_model=List[ChartSummary])
def list_public_charts():
    with get_connection() as conn:
        cur = conn.cursor()
        cur.execute(
            """SELECT 
                c.id, c.title, c.mode, c.created_at,
                COALESCE(c.is_hot, 0) as is_hot,
                COALESCE(c.is_featured, 0) as is_featured,
                COALESCE(c.is_hidden, 0) as is_hidden,
                COUNT(DISTINCT i.id) as item_count,
                (SELECT COUNT(*) FROM pair_votes WHERE chart_id = c.id) + 
                (SELECT COUNT(*) FROM explicit_votes WHERE chart_id = c.id) as vote_count
            FROM charts c
            LEFT JOIN items i ON c.id = i.chart_id AND i.status = 'active'
            WHERE c.visibility = 'public' AND COALESCE(c.is_hidden, 0) = 0
            GROUP BY c.id, c.title, c.mode, c.created_at, c.is_hot, c.is_featured, c.is_hidden
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
                created_at=row["created_at"],
                is_hot=bool(row["is_hot"]),
                is_featured=bool(row["is_featured"]),
                is_hidden=bool(row["is_hidden"]),
            ))
        
        return charts

def _get_chart_preview_items(cur, chart_id: str, limit: int = 16) -> list[dict]:
    cur.execute(
        """SELECT i.id, i.label, i.image_url, sc.r_x, sc.r_y, sc.x_mu, sc.y_mu, sc.n_x, sc.n_y
           FROM items i
           LEFT JOIN scores sc ON sc.chart_id = i.chart_id AND sc.item_id = i.id
           WHERE i.chart_id = ? AND i.status = 'active'
           ORDER BY i.sort_order ASC, i.created_at ASC
           LIMIT ?""",
        (chart_id, limit),
    )
    items = []
    for row in cur.fetchall():
        d = dict(row)
        label = d.get("label") or ""
        image_url = d.get("image_url")
        if "|" in label and not image_url:
            parts = label.split("|", 1)
            if len(parts) == 2 and parts[1].strip().startswith("http"):
                label = parts[0].strip()
                image_url = parts[1].strip()
        items.append({
            "id": d.get("id"),
            "label": label,
            "image_url": image_url,
            "r_x": d.get("r_x"),
            "r_y": d.get("r_y"),
            "x_mu": d.get("x_mu"),
            "y_mu": d.get("y_mu"),
            "n_x": d.get("n_x"),
            "n_y": d.get("n_y"),
        })
    return items

@app.get("/api/charts/feed", response_model=List[ChartFeedItem])
def charts_feed(
    filter: str = Query("trending"),
    limit: int = Query(12, ge=1, le=50),
    offset: int = Query(0, ge=0),
    mode: str = Query("two_axis"),
):
    """Public chart feed with basic pagination (offset/limit)."""
    filter = (filter or "trending").lower().strip()
    mode = (mode or "").strip()
    mode_filter = None if mode in {"", "all", "any"} else mode

    base_select = """SELECT 
            c.id, c.title, c.mode, c.created_at, c.x_label, c.y_label,
            COALESCE(c.is_hot, 0) as is_hot,
            COALESCE(c.is_featured, 0) as is_featured,
            COUNT(DISTINCT i.id) as item_count,
            (SELECT COUNT(*) FROM pair_votes WHERE chart_id = c.id) + 
            (SELECT COUNT(*) FROM explicit_votes WHERE chart_id = c.id) as vote_count
        FROM charts c
        LEFT JOIN items i ON c.id = i.chart_id AND i.status = 'active'
    """
    where = "WHERE c.visibility = 'public' AND COALESCE(c.is_hidden, 0) = 0"
    params: list = []
    if mode_filter:
        where += " AND c.mode = ?"
        params.append(mode_filter)

    group_by = "GROUP BY c.id, c.title, c.mode, c.created_at, c.x_label, c.y_label, c.is_hot, c.is_featured"

    with get_connection() as conn:
        cur = conn.cursor()

        def build_feed_item(row) -> ChartFeedItem:
            d = dict(row)
            preview_items = _get_chart_preview_items(cur, d["id"], limit=16)
            return ChartFeedItem(
                id=d["id"],
                title=d["title"],
                mode=d["mode"],
                item_count=d["item_count"] or 0,
                vote_count=d["vote_count"] or 0,
                created_at=d["created_at"],
                is_hot=bool(d["is_hot"]),
                is_featured=bool(d["is_featured"]),
                x_label=d.get("x_label"),
                y_label=d.get("y_label"),
                preview_items=preview_items,
            )

        if filter == "featured":
            sql = f"""{base_select}
{where} AND COALESCE(c.is_featured, 0) = 1
{group_by}
ORDER BY COALESCE(c.is_hot, 0) DESC, c.created_at DESC
LIMIT ? OFFSET ?"""
            cur.execute(sql, tuple(params + [limit, offset]))
            rows = cur.fetchall()
            return [build_feed_item(row) for row in rows]

        if filter == "new":
            sql = f"""{base_select}
{where}
{group_by}
ORDER BY c.created_at DESC
LIMIT ? OFFSET ?"""
            cur.execute(sql, tuple(params + [limit, offset]))
            rows = cur.fetchall()
            return [build_feed_item(row) for row in rows]

        # Trending: compute score in Python for portability.
        fetch_limit = min(500, max(60, offset + limit + 120))
        sql = f"""{base_select}
{where}
{group_by}
ORDER BY c.created_at DESC
LIMIT ?"""
        cur.execute(sql, tuple(params + [fetch_limit]))
        rows = [dict(r) for r in cur.fetchall()]

        scored = []
        for r in rows:
            votes = int(r.get("vote_count") or 0)
            score = _trending_score(votes, r.get("created_at") or "")
            scored.append((bool(r.get("is_hot")), score, votes, r.get("created_at") or "", r))

        scored.sort(key=lambda x: (x[0], x[1], x[2], x[3]), reverse=True)
        selected = [x[4] for x in scored][offset: offset + limit]

        return [build_feed_item(r) for r in selected]

@app.get("/api/admin/charts", response_model=List[ChartSummary])
def admin_list_charts(
    request: Request,
    limit: int = Query(200, ge=1, le=500),
    offset: int = Query(0, ge=0),
    mode: str = Query("all"),
):
    _require_admin(request)

    mode = (mode or "").strip()
    mode_filter = None if mode in {"", "all", "any"} else mode

    with get_connection() as conn:
        cur = conn.cursor()
        where = "WHERE c.visibility = 'public'"
        params: list = []
        if mode_filter:
            where += " AND c.mode = ?"
            params.append(mode_filter)

        cur.execute(
            f"""SELECT 
                c.id, c.title, c.mode, c.created_at,
                COALESCE(c.is_hot, 0) as is_hot,
                COALESCE(c.is_featured, 0) as is_featured,
                COALESCE(c.is_hidden, 0) as is_hidden,
                COUNT(DISTINCT i.id) as item_count,
                (SELECT COUNT(*) FROM pair_votes WHERE chart_id = c.id) + 
                (SELECT COUNT(*) FROM explicit_votes WHERE chart_id = c.id) as vote_count
            FROM charts c
            LEFT JOIN items i ON c.id = i.chart_id AND i.status = 'active'
            {where}
            GROUP BY c.id, c.title, c.mode, c.created_at, c.is_hot, c.is_featured, c.is_hidden
            ORDER BY c.created_at DESC
            LIMIT ? OFFSET ?""",
            tuple(params + [limit, offset])
        )

        charts: list[ChartSummary] = []
        for row in cur.fetchall():
            charts.append(ChartSummary(
                id=row["id"],
                title=row["title"],
                mode=row["mode"],
                item_count=row["item_count"] or 0,
                vote_count=row["vote_count"] or 0,
                created_at=row["created_at"],
                is_hot=bool(row["is_hot"]),
                is_featured=bool(row["is_featured"]),
                is_hidden=bool(row["is_hidden"]),
            ))

        return charts

@app.patch("/api/admin/charts/{chart_id}")
def admin_update_chart(chart_id: str, payload: AdminChartUpdateRequest, request: Request):
    _require_admin(request)

    updates = []
    params = []
    if payload.is_hot is not None:
        updates.append("is_hot=?")
        params.append(1 if payload.is_hot else 0)
    if payload.is_featured is not None:
        updates.append("is_featured=?")
        params.append(1 if payload.is_featured else 0)
    if payload.is_hidden is not None:
        updates.append("is_hidden=?")
        params.append(1 if payload.is_hidden else 0)
    if payload.is_voting_paused is not None:
        updates.append("is_voting_paused=?")
        params.append(1 if payload.is_voting_paused else 0)

    if not updates:
        return {"ok": True}

    params.append(chart_id)

    with get_connection() as conn:
        cur = conn.cursor()
        cur.execute(f"UPDATE charts SET {', '.join(updates)} WHERE id=?", tuple(params))
        conn.commit()

    return {"ok": True}

@app.patch("/api/charts/{chart_id}/owner-settings")
def update_owner_settings(chart_id: str, payload: OwnerChartSettingsRequest, k: str = Query(...)):
    if not verify_capability(chart_id, k, admin=True):
        raise HTTPException(403, "Invalid admin key")

    updates = []
    params = []
    if payload.is_voting_paused is not None:
        updates.append("is_voting_paused=?")
        params.append(1 if payload.is_voting_paused else 0)

    if not updates:
        return {"ok": True}

    params.append(chart_id)
    with get_connection() as conn:
        cur = conn.cursor()
        cur.execute(f"UPDATE charts SET {', '.join(updates)} WHERE id=?", tuple(params))
        conn.commit()

    return {"ok": True}

@app.post("/api/ai/suggest", response_model=AISuggestionResponse)
def ai_suggest(payload: AISuggestionRequest):
    """Generate suggestions with cache-first behavior and optional LLM augmentation."""

    title = _validate_user_text(payload.title, field_name="title", allow_blank=False, max_length=200)
    title_norm = _normalize_title_for_cache(title)

    cached = _cache_get_ai_suggestion(title_norm=title_norm, mode=payload.mode, suggestion_type=payload.type)
    if cached:
        if payload.type == "items":
            return AISuggestionResponse(items=(cached.get("items") or []))
        return AISuggestionResponse(axes=(cached.get("axes") or []))

    llm_data = _try_llm_suggestions(title=title, mode=payload.mode, suggestion_type=payload.type)
    search_items = _try_search_suggestions(title=title, limit=12) if payload.type == "items" else []
    local_data = {
        "items": generate_smart_suggestions(title, payload.mode, "items"),
        "axes": generate_smart_suggestions(title, payload.mode, "axes"),
    }

    if payload.type == "items":
        merged: list[str] = []
        seen_items: set[str] = set()
        source_candidates: list[str] = []
        llm_items = (llm_data or {}).get("items", [])

        # If we already have a strong local topic match, avoid noisy search expansion.
        if local_data["items"]:
            source_candidates.extend(local_data["items"])
            source_candidates.extend(llm_items)
        else:
            source_candidates.extend(llm_items)
            source_candidates.extend(search_items)

        for candidate in source_candidates:
            if not isinstance(candidate, str):
                continue
            clean = _sanitize_item_candidate(candidate, title=title)
            if not clean:
                continue
            key = clean.lower()
            if key in seen_items:
                continue
            seen_items.add(key)
            merged.append(clean)
        merged = merged[:10]
        cache_payload = {"items": merged}
        _cache_set_ai_suggestion(title_norm=title_norm, mode=payload.mode, suggestion_type=payload.type, payload=cache_payload)
        return AISuggestionResponse(items=merged)

    if payload.type == "axes":
        raw_axes = (llm_data or {}).get("axes", []) + local_data["axes"]
        clean_axes = []
        seen_keys = set()
        for axis in raw_axes:
            if not isinstance(axis, dict):
                continue
            x_low = _normalize_whitespace(str(axis.get("xLow", "")))
            x_high = _normalize_whitespace(str(axis.get("xHigh", "")))
            y_low = _normalize_whitespace(str(axis.get("yLow", "")))
            y_high = _normalize_whitespace(str(axis.get("yHigh", "")))
            if not x_low or not x_high or not y_low or not y_high:
                continue
            joined = " ".join([x_low, x_high, y_low, y_high])
            if _URL_IN_TEXT_RE.search(joined) or _contains_bad_language(joined):
                continue
            key = f"{x_low}|{x_high}|{y_low}|{y_high}".lower()
            if key in seen_keys:
                continue
            seen_keys.add(key)
            clean_axes.append({"xLow": x_low, "xHigh": x_high, "yLow": y_low, "yHigh": y_high})
        clean_axes = clean_axes[:3] if clean_axes else local_data["axes"][:3]
        cache_payload = {"axes": clean_axes}
        _cache_set_ai_suggestion(title_norm=title_norm, mode=payload.mode, suggestion_type=payload.type, payload=cache_payload)
        return AISuggestionResponse(axes=clean_axes)

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
    free_response = _validate_user_text(
        payload.free_response or "",
        field_name="feedback",
        allow_blank=True,
        max_length=2000,
    ) or None
    
    with get_connection() as conn:
        cur = conn.cursor()
        cur.execute(
            """INSERT INTO feedback 
            (chart_id, tool_helpfulness, free_response, session_id, ip_hash, created_at)
            VALUES (?, ?, ?, ?, ?, ?)""",
            (payload.chart_id, payload.tool_helpfulness, free_response, 
             session_id, ip_hash, now_iso())
        )
        conn.commit()
    
    return {"status": "success", "message": "Feedback submitted successfully"}

@app.post("/api/short-urls", response_model=CreateShortUrlResponse)
def create_short_url(payload: CreateShortUrlRequest, request: Request):
    app_base_url = get_public_base_url(request)
    short_base_url = get_public_short_base_url(request)
    long_url = (payload.long_url or "").strip()
    if not long_url:
        raise HTTPException(400, "long_url is required")

    if long_url.startswith("/"):
        long_url = f"{app_base_url}{long_url}"

    if not _is_allowed_redirect_url(long_url, request):
        raise HTTPException(400, "long_url must be on an allowed host")

    requested = normalize_short_code(payload.short_code)
    if not requested or len(requested) < 3:
        requested = f"chart-{(payload.chart_id or 'unknown')[:8]}"

    created_at = now_iso()

    with get_connection() as conn:
        cur = conn.cursor()

        # Reuse existing mapping for the same long URL.
        cur.execute("SELECT short_code FROM short_urls WHERE long_url=? LIMIT 1", (long_url,))
        existing = cur.fetchone()
        if existing:
            code = dict(existing).get("short_code") or requested
            return CreateShortUrlResponse(short_url=f"{short_base_url}/s/{code}", short_code=code, long_url=long_url)

        code = requested
        for _ in range(8):
            cur.execute(
                "INSERT OR IGNORE INTO short_urls (short_code, long_url, chart_id, is_vote, title, created_at) VALUES (?, ?, ?, ?, ?, ?)",
                (code, long_url, payload.chart_id, 1 if payload.is_vote else 0, payload.title, created_at)
            )
            conn.commit()

            if getattr(cur, "rowcount", 0) > 0:
                return CreateShortUrlResponse(short_url=f"{short_base_url}/s/{code}", short_code=code, long_url=long_url)

            cur.execute("SELECT long_url FROM short_urls WHERE short_code=? LIMIT 1", (code,))
            taken = cur.fetchone()
            if taken and dict(taken).get("long_url") == long_url:
                return CreateShortUrlResponse(short_url=f"{short_base_url}/s/{code}", short_code=code, long_url=long_url)

            suffix = secrets.token_urlsafe(3).replace("_", "").replace("-", "").lower()[:4]
            code = f"{requested}-{suffix}"

    raise HTTPException(409, "Unable to allocate short URL")

@app.get("/s/{short_code}")
def resolve_short_url(short_code: str, request: Request):
    base_url = get_public_base_url(request)
    code = normalize_short_code(short_code)
    if not code:
        raise HTTPException(404, "Not found")

    with get_connection() as conn:
        cur = conn.cursor()
        cur.execute("SELECT short_code, long_url, chart_id, is_vote, title FROM short_urls WHERE short_code=? LIMIT 1", (code,))
        row = cur.fetchone()
        if not row:
            raise HTTPException(404, "Not found")

        row = dict(row)
        long_url = row.get("long_url") or ""
        if not _is_allowed_redirect_url(long_url, request):
            raise HTTPException(404, "Not found")

        chart_id = row.get("chart_id")
        is_vote = bool(row.get("is_vote"))
        stored_title = row.get("title")

        share_key = "public"
        try:
            parsed = urlparse(long_url)
            qs = parse_qs(parsed.query)
            if qs.get("s"):
                share_key = qs["s"][0]
        except Exception:
            pass

        chart = {"title": stored_title or "twoby", "mode": "two_axis", "x_label": None, "y_label": None}
        vote_count = 0
        item_count = 0
        if chart_id:
            try:
                cur.execute("SELECT title, mode, x_label, y_label, visibility FROM charts WHERE id=? LIMIT 1", (chart_id,))
                chart_row = cur.fetchone()
                if chart_row:
                    chart = dict(chart_row)

                cur.execute("SELECT COUNT(*) AS c FROM items WHERE chart_id=? AND status='active'", (chart_id,))
                ic = cur.fetchone()
                if ic and dict(ic).get("c") is not None:
                    item_count = int(dict(ic)["c"])

                cur.execute(
                    "SELECT (SELECT COUNT(*) FROM pair_votes WHERE chart_id = ?) + (SELECT COUNT(*) FROM explicit_votes WHERE chart_id = ?) AS vote_count",
                    (chart_id, chart_id)
                )
                vc = cur.fetchone()
                if vc and dict(vc).get("vote_count") is not None:
                    vote_count = int(dict(vc)["vote_count"])
            except Exception:
                pass

        og_type = "vote" if is_vote else "results"
        footer_hint = ""
        try:
            parsed_long = urlparse(long_url)
            footer_hint = _clean_footer_text(parsed_long.hostname or "")
        except Exception:
            footer_hint = ""

        if chart_id:
            og_query = {"s": share_key, "type": og_type}
            if footer_hint:
                og_query["footer"] = footer_hint
            og_image_url = f"{base_url}/api/og/chart/{chart_id}?{urlencode(og_query)}"
        else:
            og_image_url = f"{base_url}/og-default.png"

    title = str(chart.get("title") or "twoby")
    page_title = f"{title} • twoby"
    mode_tag = "2×2" if chart.get("mode") == "two_axis" else str(chart.get("mode") or "chart")
    description = f'Vote and see where things land on a {mode_tag} map.'
    if og_type == "results":
        description = f'Results for a collaborative {mode_tag} map.'

    esc = html_lib.escape
    long_url_html = esc(long_url)
    long_url_js = json.dumps(long_url)
    html = f"""<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>{esc(page_title)}</title>

    <meta property="og:site_name" content="twoby" />
    <meta property="og:type" content="website" />
    <meta property="og:title" content="{esc(title)}" />
    <meta property="og:description" content="{esc(description)}" />
    <meta property="og:image" content="{esc(og_image_url)}" />
    <meta property="og:url" content="{esc(str(request.url))}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="{esc(title)}" />
    <meta name="twitter:description" content="{esc(description)}" />
    <meta name="twitter:image" content="{esc(og_image_url)}" />
    <link rel="canonical" href="{long_url_html}" />

    <meta http-equiv="refresh" content="0;url={long_url_html}" />
    <script>window.location.replace({long_url_js});</script>
  </head>
  <body style="background:#0b1220;color:#e2e8f0;font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:24px;">
    <div style="max-width:680px;text-align:center;">
      <div style="font-weight:700;font-size:18px;letter-spacing:-0.02em;">twoby</div>
      <div style="opacity:0.85;margin-top:10px;">Redirecting…</div>
      <div style="opacity:0.6;margin-top:18px;font-size:14px;">
        {item_count} items • {vote_count} votes
      </div>
      <div style="opacity:0.6;margin-top:18px;font-size:14px;word-break:break-all;">
        If you aren’t redirected, <a href="{long_url_html}" style="color:#93c5fd;">tap here</a>.
      </div>
    </div>
  </body>
</html>"""

    return HTMLResponse(content=html, status_code=200)

@app.get("/api/og/chart/{chart_id}")
def get_chart_og(
    chart_id: str,
    request: Request,
    s: str = Query("public"),
    type: str = Query("results"),
    footer: str = Query(""),
):
    og_type = (type or "results").lower()
    if og_type not in {"results", "vote"}:
        raise HTTPException(400, "Invalid OG type")

    if not verify_capability(chart_id, s, admin=False):
        raise HTTPException(404, "Chart not found")

    with get_connection() as conn:
        cur = conn.cursor()
        cur.execute("SELECT title, mode, x_label, y_label, visibility FROM charts WHERE id=? LIMIT 1", (chart_id,))
        chart_row = cur.fetchone()
        if not chart_row:
            raise HTTPException(404, "Chart not found")

        cur.execute(
            """SELECT i.id, i.label, i.image_url,
                      sc.r_x, sc.r_y, sc.x_mu, sc.y_mu, sc.tier_mu, sc.n_x, sc.n_y
            FROM items i
            LEFT JOIN scores sc ON sc.chart_id = i.chart_id AND sc.item_id = i.id
            WHERE i.chart_id = ? AND i.status = 'active'
            ORDER BY i.sort_order ASC, i.created_at ASC""",
            (chart_id,)
        )
        items = [dict(row) for row in cur.fetchall()]

        cur.execute(
            "SELECT (SELECT COUNT(*) FROM pair_votes WHERE chart_id = ?) + (SELECT COUNT(*) FROM explicit_votes WHERE chart_id = ?) AS vote_count",
            (chart_id, chart_id)
        )
        vc = cur.fetchone()
        vote_count = int(dict(vc).get("vote_count") or 0) if vc else 0

    random.seed(chart_id)
    png = _render_chart_og_png(
        chart=dict(chart_row),
        items=items,
        vote_count=vote_count,
        og_type=og_type,
        footer_text=get_og_footer_text(request, preferred=_clean_footer_text(footer)),
    )

    headers = {
        "Cache-Control": "public, max-age=120",
    }
    return Response(content=png, media_type="image/png", headers=headers)

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

    query = _validate_user_text(q, field_name="query", allow_blank=False, max_length=100)

    # Check cache first
    cache_key = query.lower().strip()
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
                    "q": query,
                    "safe": "active",
                    "num": 5
                },
                timeout=10.0
            )

            if response.status_code == 200:
                data = response.json()
                results = []
                for item in data.get("images", []):
                    try:
                        url = _validate_image_url(item.get("imageUrl") or "") if item.get("imageUrl") else ""
                        thumb = _validate_image_url(item.get("thumbnailUrl") or "") if item.get("thumbnailUrl") else ""
                        title = _normalize_whitespace(item.get("title") or "")
                        if title and _contains_bad_language(title):
                            continue
                        if not url and not thumb:
                            continue
                        results.append({
                            "url": url or thumb,
                            "thumbnail": thumb or url,
                            "title": title,
                            "source": item.get("source")
                        })
                    except HTTPException:
                        continue

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
