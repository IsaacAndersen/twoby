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
    visibility   TEXT NOT NULL DEFAULT 'unlisted',
    admin_key_hash TEXT NOT NULL,
    share_key_hash TEXT NOT NULL,
    created_at   TEXT NOT NULL
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

CREATE INDEX IF NOT EXISTS idx_items_chart ON items(chart_id);
CREATE INDEX IF NOT EXISTS idx_pair_votes_chart ON pair_votes(chart_id);
CREATE INDEX IF NOT EXISTS idx_explicit_votes_chart ON explicit_votes(chart_id);
CREATE INDEX IF NOT EXISTS idx_scores_chart ON scores(chart_id);
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
        conn.commit()

def dict_from_row(row) -> Dict[str, Any]:
    if row is None:
        return {}
    return {key: row[key] for key in row.keys()}