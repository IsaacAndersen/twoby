import sqlite3
from typing import Dict, Any
from contextlib import contextmanager
import os

DB_PATH = os.environ.get("DB_PATH", "/db/twoby.db")

SCHEMA_SQL = """
PRAGMA journal_mode=WAL;
PRAGMA synchronous=NORMAL;

CREATE TABLE IF NOT EXISTS charts (
    id           TEXT PRIMARY KEY,
    mode         TEXT NOT NULL CHECK (mode IN ('tier','single_axis','two_axis')),
    title        TEXT NOT NULL,
    x_label      TEXT,
    y_label      TEXT,
    description  TEXT,
    creator_take TEXT,
    voting_period_days INTEGER,
    voting_ends_at TEXT,
    visibility   TEXT NOT NULL DEFAULT 'unlisted',
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
    status    TEXT NOT NULL DEFAULT 'active',
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
    tool_helpfulness INTEGER CHECK (tool_helpfulness >= 1 AND tool_helpfulness <= 5),
    free_response TEXT,
    session_id TEXT,
    ip_hash   TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY(chart_id) REFERENCES charts(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_items_chart ON items(chart_id);
CREATE INDEX IF NOT EXISTS idx_pair_votes_chart ON pair_votes(chart_id);
CREATE INDEX IF NOT EXISTS idx_explicit_votes_chart ON explicit_votes(chart_id);
CREATE INDEX IF NOT EXISTS idx_scores_chart ON scores(chart_id);
CREATE INDEX IF NOT EXISTS idx_feedback_chart ON feedback(chart_id);
"""

@contextmanager
def get_connection():
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.execute("PRAGMA journal_mode=WAL;")
    conn.execute("PRAGMA synchronous=NORMAL;")
    conn.row_factory = sqlite3.Row
    try:
        yield conn
    finally:
        conn.close()

def init_db():
    with get_connection() as conn:
        for statement in SCHEMA_SQL.strip().split(";"):
            if statement.strip():
                try:
                    conn.execute(statement)
                except sqlite3.OperationalError:
                    pass
        
        # Add new columns if they don't exist (migration)
        try:
            conn.execute("ALTER TABLE charts ADD COLUMN description TEXT")
        except sqlite3.OperationalError:
            pass
        try:
            conn.execute("ALTER TABLE charts ADD COLUMN creator_take TEXT")
        except sqlite3.OperationalError:
            pass
        try:
            conn.execute("ALTER TABLE charts ADD COLUMN voting_period_days INTEGER")
        except sqlite3.OperationalError:
            pass
        try:
            conn.execute("ALTER TABLE charts ADD COLUMN voting_ends_at TEXT")
        except sqlite3.OperationalError:
            pass
        try:
            conn.execute("ALTER TABLE charts ADD COLUMN task_description TEXT")
        except sqlite3.OperationalError:
            pass
        try:
            conn.execute("ALTER TABLE charts ADD COLUMN task_image_url TEXT")
        except sqlite3.OperationalError:
            pass
        try:
            conn.execute("ALTER TABLE charts ADD COLUMN tool_name TEXT DEFAULT 'OpenEvidence'")
        except sqlite3.OperationalError:
            pass
        try:
            conn.execute("ALTER TABLE charts ADD COLUMN upload_images TEXT")
        except sqlite3.OperationalError:
            pass
        
        # Create feedback table if it doesn't exist
        try:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS feedback (
                    id        INTEGER PRIMARY KEY AUTOINCREMENT,
                    chart_id  TEXT NOT NULL,
                    tool_helpfulness INTEGER CHECK (tool_helpfulness >= 1 AND tool_helpfulness <= 5),
                    free_response TEXT,
                    session_id TEXT,
                    ip_hash   TEXT,
                    created_at TEXT NOT NULL,
                    FOREIGN KEY(chart_id) REFERENCES charts(id) ON DELETE CASCADE
                )
            """)
            conn.execute("CREATE INDEX IF NOT EXISTS idx_feedback_chart ON feedback(chart_id)")
        except sqlite3.OperationalError:
            pass
        
        conn.commit()

def dict_from_row(row) -> Dict[str, Any]:
    if row is None:
        return {}
    return {key: row[key] for key in row.keys()}