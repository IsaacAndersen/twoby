#!/usr/bin/env python3
import sqlite3
import os

# Connect to the database
DB_PATH = os.environ.get("DB_PATH", "./twoby_local.db")
conn = sqlite3.connect(DB_PATH)
conn.row_factory = sqlite3.Row
cur = conn.cursor()

# Find the most recent chart
cur.execute("SELECT id, title FROM charts ORDER BY created_at DESC LIMIT 1")
recent_chart = cur.fetchone()
if not recent_chart:
    print("No charts found")
    exit()

chart_id = recent_chart["id"]
print(f"Debugging chart: {recent_chart['title']} ({chart_id})")

# Count votes
cur.execute("SELECT COUNT(*) as count FROM pair_votes WHERE chart_id=?", (chart_id,))
pair_count = cur.fetchone()["count"]

cur.execute("SELECT COUNT(*) as count FROM explicit_votes WHERE chart_id=?", (chart_id,))
explicit_count = cur.fetchone()["count"]

print(f"Pair votes: {pair_count}")
print(f"Explicit votes: {explicit_count}")
print(f"Total votes: {pair_count + explicit_count}")

# Show actual scores
cur.execute("""
    SELECT i.label, s.r_x, s.r_y, s.x_mu, s.y_mu 
    FROM items i 
    JOIN scores s ON i.id = s.item_id 
    WHERE i.chart_id = ? AND i.status = 'active'
""", (chart_id,))

print("\nCurrent scores:")
for row in cur.fetchall():
    print(f"{row['label']}: r_x={row['r_x']:.1f}, r_y={row['r_y']:.1f}, x_mu={row['x_mu']}, y_mu={row['y_mu']}")

# Show last few votes
print("\nLast 10 pair votes:")
cur.execute("""
    SELECT item_a, item_b, winner, axis, created_at 
    FROM pair_votes 
    WHERE chart_id = ? 
    ORDER BY created_at DESC 
    LIMIT 10
""", (chart_id,))

for row in cur.fetchall():
    print(f"{row['item_a'][:8]} vs {row['item_b'][:8]}, winner: {row['winner'][:8]}, axis: {row['axis']}")

conn.close()