import sqlite3
import os
from typing import Dict, Any
from contextlib import contextmanager

# Support both SQLite (local) and PostgreSQL (production)
DATABASE_URL = os.environ.get("DATABASE_URL")
DB_PATH = os.environ.get("DB_PATH", "twoby_local.db")

# Check if we're using PostgreSQL
USE_POSTGRES = DATABASE_URL and DATABASE_URL.startswith("postgres")

if USE_POSTGRES:
    try:
        import psycopg2
        import psycopg2.extras
    except ImportError:
        psycopg2 = None
        print("Warning: psycopg2 not installed, falling back to SQLite")
        USE_POSTGRES = False

SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS charts (
    id           TEXT PRIMARY KEY,
    mode         TEXT NOT NULL,
    title        TEXT NOT NULL,
    x_label      TEXT,
    y_label      TEXT,
    description  TEXT,
    creator_take TEXT,
    voting_period_days INTEGER,
    voting_ends_at TEXT,
    visibility   TEXT NOT NULL DEFAULT 'unlisted',
    is_hot       INTEGER NOT NULL DEFAULT 0,
    is_featured  INTEGER NOT NULL DEFAULT 0,
    is_hidden    INTEGER NOT NULL DEFAULT 0,
    is_voting_paused INTEGER NOT NULL DEFAULT 0,
    admin_key_hash TEXT NOT NULL,
    share_key_hash TEXT NOT NULL,
    created_at   TEXT NOT NULL,
    task_description TEXT,
    task_image_url TEXT,
    tool_name TEXT DEFAULT 'OpenEvidence',
    upload_images TEXT
);

CREATE TABLE IF NOT EXISTS items (
    id        TEXT PRIMARY KEY,
    chart_id  TEXT NOT NULL,
    label     TEXT NOT NULL,
    image_url TEXT,
    color     TEXT,
    bg_color  TEXT,
    description TEXT,
    sort_order INTEGER DEFAULT 0,
    status    TEXT NOT NULL DEFAULT 'active',
    created_at TEXT,
    image_src TEXT,
    image_attribution TEXT,
    dominant_color TEXT,
    FOREIGN KEY(chart_id) REFERENCES charts(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS pair_votes (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    chart_id  TEXT NOT NULL,
    axis      TEXT,
    item_a    TEXT NOT NULL,
    item_b    TEXT NOT NULL,
    winner    TEXT NOT NULL,
    session_id TEXT,
    ip_hash   TEXT,
    ua_hash   TEXT,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS explicit_votes (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    chart_id  TEXT NOT NULL,
    item_id   TEXT NOT NULL,
    tier      INTEGER,
    x         REAL,
    y         REAL,
    session_id TEXT,
    ip_hash   TEXT,
    ua_hash   TEXT,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS scores (
    chart_id  TEXT NOT NULL,
    item_id   TEXT NOT NULL,
    r_x       REAL DEFAULT 1000,
    r_y       REAL DEFAULT 1000,
    x_mu      REAL,
    x_sigma   REAL,
    n_x       INTEGER DEFAULT 0,
    y_mu      REAL,
    y_sigma   REAL,
    n_y       INTEGER DEFAULT 0,
    tier_mu   REAL,
    tier_sigma REAL,
    n_tier    INTEGER DEFAULT 0,
    updated_at TEXT NOT NULL,
    PRIMARY KEY(chart_id, item_id),
    FOREIGN KEY(chart_id) REFERENCES charts(id) ON DELETE CASCADE,
    FOREIGN KEY(item_id) REFERENCES items(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS feedback (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    chart_id  TEXT NOT NULL,
    tool_helpfulness INTEGER,
    free_response TEXT,
    session_id TEXT,
    ip_hash   TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY(chart_id) REFERENCES charts(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS short_urls (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    short_code TEXT UNIQUE NOT NULL,
    long_url TEXT NOT NULL,
    chart_id TEXT,
    is_vote INTEGER DEFAULT 0,
    title TEXT,
    created_at TEXT,
    click_count INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS ai_suggestion_cache (
    cache_key TEXT PRIMARY KEY,
    title_norm TEXT NOT NULL,
    mode TEXT NOT NULL,
    suggestion_type TEXT NOT NULL,
    response_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL
);
"""

INDEXES_SQL = """
CREATE INDEX IF NOT EXISTS idx_items_chart ON items(chart_id);
CREATE INDEX IF NOT EXISTS idx_pair_votes_chart ON pair_votes(chart_id);
CREATE INDEX IF NOT EXISTS idx_explicit_votes_chart ON explicit_votes(chart_id);
CREATE INDEX IF NOT EXISTS idx_scores_chart ON scores(chart_id);
CREATE INDEX IF NOT EXISTS idx_feedback_chart ON feedback(chart_id);
CREATE INDEX IF NOT EXISTS idx_short_urls_short_code ON short_urls(short_code);
CREATE INDEX IF NOT EXISTS idx_short_urls_chart_id ON short_urls(chart_id);
CREATE INDEX IF NOT EXISTS idx_ai_suggestion_cache_expires_at ON ai_suggestion_cache(expires_at);
"""


class PostgresCursorWrapper:
    """Wrapper that converts SQLite ? placeholders to PostgreSQL %s"""
    def __init__(self, cursor):
        self._cursor = cursor

    def execute(self, query, params=None):
        # Convert ? to %s for PostgreSQL
        query = query.replace("?", "%s")
        # Also handle INSERT OR IGNORE -> INSERT ... ON CONFLICT DO NOTHING
        query = query.replace("INSERT OR IGNORE", "INSERT")
        if "INSERT" in query and "ON CONFLICT" not in query:
            # Add ON CONFLICT DO NOTHING for INSERT statements
            if "VALUES" in query:
                query = query.rstrip(")") + ") ON CONFLICT DO NOTHING"
        if params:
            return self._cursor.execute(query, params)
        return self._cursor.execute(query)

    def fetchone(self):
        return self._cursor.fetchone()

    def fetchall(self):
        return self._cursor.fetchall()

    def __getattr__(self, name):
        return getattr(self._cursor, name)


class PostgresConnectionWrapper:
    """Wrapper that returns wrapped cursors"""
    def __init__(self, conn):
        self._conn = conn

    def cursor(self):
        return PostgresCursorWrapper(self._conn.cursor())

    def commit(self):
        return self._conn.commit()

    def rollback(self):
        return self._conn.rollback()

    def close(self):
        return self._conn.close()

    def __getattr__(self, name):
        return getattr(self._conn, name)


@contextmanager
def get_connection():
    """Get database connection - SQLite for local, PostgreSQL for production"""
    if USE_POSTGRES and psycopg2:
        conn = psycopg2.connect(DATABASE_URL)
        conn.cursor_factory = psycopg2.extras.RealDictCursor
        wrapped = PostgresConnectionWrapper(conn)
        try:
            yield wrapped
        finally:
            conn.close()
    else:
        conn = sqlite3.connect(DB_PATH, check_same_thread=False)
        conn.execute("PRAGMA journal_mode=WAL;")
        conn.execute("PRAGMA synchronous=NORMAL;")
        conn.row_factory = sqlite3.Row
        try:
            yield conn
        finally:
            conn.close()

def init_db():
    """Initialize database schema"""
    if USE_POSTGRES and psycopg2:
        _init_postgres()
    else:
        _init_sqlite()

def _init_sqlite():
    """Initialize SQLite database"""
    with get_connection() as conn:
        # Execute schema
        for statement in SCHEMA_SQL.strip().split(";"):
            if statement.strip():
                try:
                    conn.execute(statement)
                except sqlite3.OperationalError:
                    pass

        # Execute indexes
        for statement in INDEXES_SQL.strip().split(";"):
            if statement.strip():
                try:
                    conn.execute(statement)
                except sqlite3.OperationalError:
                    pass

        # Run migrations for existing columns
        _run_sqlite_migrations(conn)
        conn.commit()

def _run_sqlite_migrations(conn):
    """Add columns that may not exist in older databases"""
    migrations = [
        ("charts", "description", "TEXT"),
        ("charts", "creator_take", "TEXT"),
        ("charts", "voting_period_days", "INTEGER"),
        ("charts", "voting_ends_at", "TEXT"),
        ("charts", "task_description", "TEXT"),
        ("charts", "task_image_url", "TEXT"),
        ("charts", "tool_name", "TEXT DEFAULT 'OpenEvidence'"),
        ("charts", "upload_images", "TEXT"),
        ("charts", "is_hot", "INTEGER NOT NULL DEFAULT 0"),
        ("charts", "is_featured", "INTEGER NOT NULL DEFAULT 0"),
        ("charts", "is_hidden", "INTEGER NOT NULL DEFAULT 0"),
        ("charts", "is_voting_paused", "INTEGER NOT NULL DEFAULT 0"),
        ("items", "image_url", "TEXT"),
        ("items", "color", "TEXT"),
        ("items", "bg_color", "TEXT"),
        ("items", "description", "TEXT"),
        ("items", "sort_order", "INTEGER DEFAULT 0"),
        ("items", "created_at", "TEXT"),
        ("items", "image_src", "TEXT"),
        ("items", "image_attribution", "TEXT"),
        ("items", "dominant_color", "TEXT"),
    ]

    for table, column, col_type in migrations:
        try:
            conn.execute(f"ALTER TABLE {table} ADD COLUMN {column} {col_type}")
        except sqlite3.OperationalError:
            pass  # Column already exists

def _init_postgres():
    """Initialize PostgreSQL database"""
    # Convert SQLite schema to PostgreSQL
    pg_schema = SCHEMA_SQL
    # Replace SQLite-specific syntax
    pg_schema = pg_schema.replace("INTEGER PRIMARY KEY AUTOINCREMENT", "SERIAL PRIMARY KEY")
    pg_schema = pg_schema.replace("TEXT PRIMARY KEY", "VARCHAR(255) PRIMARY KEY")

    conn = psycopg2.connect(DATABASE_URL)
    cur = conn.cursor()

    for statement in pg_schema.strip().split(";"):
        if statement.strip():
            try:
                cur.execute(statement)
                conn.commit()
            except Exception as e:
                conn.rollback()

    for statement in INDEXES_SQL.strip().split(";"):
        if statement.strip():
            try:
                cur.execute(statement)
                conn.commit()
            except Exception:
                conn.rollback()

    _run_postgres_migrations(conn)
    conn.close()

def _run_postgres_migrations(conn):
    """Add columns that may not exist in older PostgreSQL databases"""
    migrations = [
        ("charts", "description", "TEXT"),
        ("charts", "creator_take", "TEXT"),
        ("charts", "voting_period_days", "INTEGER"),
        ("charts", "voting_ends_at", "TEXT"),
        ("charts", "task_description", "TEXT"),
        ("charts", "task_image_url", "TEXT"),
        ("charts", "tool_name", "TEXT DEFAULT 'OpenEvidence'"),
        ("charts", "upload_images", "TEXT"),
        ("charts", "is_hot", "INTEGER NOT NULL DEFAULT 0"),
        ("charts", "is_featured", "INTEGER NOT NULL DEFAULT 0"),
        ("charts", "is_hidden", "INTEGER NOT NULL DEFAULT 0"),
        ("charts", "is_voting_paused", "INTEGER NOT NULL DEFAULT 0"),
        ("items", "image_url", "TEXT"),
        ("items", "color", "TEXT"),
        ("items", "bg_color", "TEXT"),
        ("items", "description", "TEXT"),
        ("items", "sort_order", "INTEGER DEFAULT 0"),
        ("items", "created_at", "TEXT"),
        ("items", "image_src", "TEXT"),
        ("items", "image_attribution", "TEXT"),
        ("items", "dominant_color", "TEXT"),
    ]

    cur = conn.cursor()
    for table, column, col_type in migrations:
        try:
            cur.execute(f"ALTER TABLE {table} ADD COLUMN {column} {col_type}")
            conn.commit()
        except Exception:
            conn.rollback()

def dict_from_row(row) -> Dict[str, Any]:
    """Convert database row to dictionary"""
    if row is None:
        return {}
    if isinstance(row, dict):
        return row
    return {key: row[key] for key in row.keys()}
