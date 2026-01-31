import pytest
import os
import tempfile
from fastapi.testclient import TestClient
from unittest.mock import patch
import sqlite3

os.environ["PEPPER"] = "test-pepper"

with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as f:
    TEST_DB_PATH = f.name

os.environ["DB_PATH"] = TEST_DB_PATH

from app import app
from database import init_db

client = TestClient(app)

@pytest.fixture(autouse=True)
def setup_db():
    init_db()
    yield
    conn = sqlite3.connect(TEST_DB_PATH)
    tables = ["explicit_votes", "pair_votes", "scores", "items", "charts"]
    for table in tables:
        conn.execute(f"DELETE FROM {table}")
    conn.commit()
    conn.close()

class TestChartCreation:
    def test_create_chart_tier_mode(self):
        response = client.post("/api/charts", json={
            "title": "Best Bikes",
            "mode": "tier"
        })
        assert response.status_code == 200
        data = response.json()
        assert "id" in data
        assert "admin_url" in data
        assert "share_url" in data
        assert "/c/" in data["admin_url"]
        assert "/v/" in data["share_url"]
        assert "?k=" in data["admin_url"]
        assert "?s=" in data["share_url"]
    
    def test_create_chart_single_axis(self):
        response = client.post("/api/charts", json={
            "title": "Coolness Scale",
            "mode": "single_axis",
            "x_label": "Lame to Cool"
        })
        assert response.status_code == 200
        data = response.json()
        assert "id" in data
    
    def test_create_chart_two_axis(self):
        response = client.post("/api/charts", json={
            "title": "2x2 Chart",
            "mode": "two_axis",
            "x_label": "Thinks it's cool",
            "y_label": "Is cool"
        })
        assert response.status_code == 200
        data = response.json()
        assert "id" in data
    
    def test_create_chart_missing_title(self):
        response = client.post("/api/charts", json={
            "mode": "tier"
        })
        assert response.status_code == 422
    
    def test_create_chart_invalid_mode(self):
        response = client.post("/api/charts", json={
            "title": "Test",
            "mode": "invalid"
        })
        assert response.status_code == 422

class TestItemManagement:
    def test_add_items_with_valid_admin_key(self):
        create_response = client.post("/api/charts", json={
            "title": "Test Chart",
            "mode": "tier"
        })
        chart_data = create_response.json()
        chart_id = chart_data["id"]
        admin_key = chart_data["admin_url"].split("?k=")[1]
        
        response = client.post(
            f"/api/charts/{chart_id}/items?k={admin_key}",
            json={"items": [{"label": "Item 1"}, {"label": "Item 2"}]}
        )
        assert response.status_code == 200
        assert response.json() == {"ok": True}
        
        conn = sqlite3.connect(TEST_DB_PATH)
        cur = conn.cursor()
        cur.execute("SELECT COUNT(*) FROM items WHERE chart_id=?", (chart_id,))
        count = cur.fetchone()[0]
        conn.close()
        assert count == 2
    
    def test_add_items_with_invalid_admin_key(self):
        create_response = client.post("/api/charts", json={
            "title": "Test Chart",
            "mode": "tier"
        })
        chart_id = create_response.json()["id"]
        
        response = client.post(
            f"/api/charts/{chart_id}/items?k=invalid_key",
            json={"items": [{"label": "Item 1"}]}
        )
        assert response.status_code == 403
        assert "Invalid admin key" in response.json()["detail"]
    
    def test_add_items_creates_score_entries(self):
        create_response = client.post("/api/charts", json={
            "title": "Test Chart",
            "mode": "tier"
        })
        chart_data = create_response.json()
        chart_id = chart_data["id"]
        admin_key = chart_data["admin_url"].split("?k=")[1]
        
        client.post(
            f"/api/charts/{chart_id}/items?k={admin_key}",
            json={"items": [{"label": "Item 1"}]}
        )
        
        conn = sqlite3.connect(TEST_DB_PATH)
        cur = conn.cursor()
        cur.execute("SELECT COUNT(*) FROM scores WHERE chart_id=?", (chart_id,))
        count = cur.fetchone()[0]
        conn.close()
        assert count == 1

class TestPairwiseVoting:
    def setup_chart_with_items(self):
        create_response = client.post("/api/charts", json={
            "title": "Test Chart",
            "mode": "tier"
        })
        chart_data = create_response.json()
        chart_id = chart_data["id"]
        admin_key = chart_data["admin_url"].split("?k=")[1]
        share_key = chart_data["share_url"].split("?s=")[1]
        
        client.post(
            f"/api/charts/{chart_id}/items?k={admin_key}",
            json={"items": [{"label": "Item A"}, {"label": "Item B"}]}
        )
        
        conn = sqlite3.connect(TEST_DB_PATH)
        cur = conn.cursor()
        cur.execute("SELECT id FROM items WHERE chart_id=? ORDER BY label", (chart_id,))
        items = [row[0] for row in cur.fetchall()]
        conn.close()
        
        return chart_id, share_key, items
    
    def test_pair_vote_updates_elo_ratings(self):
        chart_id, share_key, items = self.setup_chart_with_items()
        
        response = client.post(
            f"/api/vote/pair?s={share_key}",
            json={
                "chart_id": chart_id,
                "item_a": items[0],
                "item_b": items[1],
                "winner": items[0]
            }
        )
        assert response.status_code == 200
        
        conn = sqlite3.connect(TEST_DB_PATH)
        cur = conn.cursor()
        cur.execute("SELECT r_x FROM scores WHERE item_id=? AND chart_id=?", (items[0], chart_id))
        winner_rating = cur.fetchone()[0]
        cur.execute("SELECT r_x FROM scores WHERE item_id=? AND chart_id=?", (items[1], chart_id))
        loser_rating = cur.fetchone()[0]
        conn.close()
        
        assert winner_rating > 1000
        assert loser_rating < 1000
        assert abs((winner_rating - 1000) + (loser_rating - 1000)) < 0.01
    
    def test_pair_vote_with_axis(self):
        chart_id, share_key, items = self.setup_chart_with_items()
        
        response = client.post(
            f"/api/vote/pair?s={share_key}",
            json={
                "chart_id": chart_id,
                "axis": "y",
                "item_a": items[0],
                "item_b": items[1],
                "winner": items[1]
            }
        )
        assert response.status_code == 200
        
        conn = sqlite3.connect(TEST_DB_PATH)
        cur = conn.cursor()
        cur.execute("SELECT r_y FROM scores WHERE item_id=? AND chart_id=?", (items[1], chart_id))
        winner_rating = cur.fetchone()[0]
        conn.close()
        
        assert winner_rating > 1000
    
    def test_pair_vote_invalid_share_key(self):
        chart_id, _, items = self.setup_chart_with_items()
        
        response = client.post(
            f"/api/vote/pair?s=invalid_key",
            json={
                "chart_id": chart_id,
                "item_a": items[0],
                "item_b": items[1],
                "winner": items[0]
            }
        )
        assert response.status_code == 403

class TestExplicitVoting:
    def setup_chart_with_items(self):
        create_response = client.post("/api/charts", json={
            "title": "Test Chart",
            "mode": "two_axis",
            "x_label": "X axis",
            "y_label": "Y axis"
        })
        chart_data = create_response.json()
        chart_id = chart_data["id"]
        admin_key = chart_data["admin_url"].split("?k=")[1]
        share_key = chart_data["share_url"].split("?s=")[1]
        
        client.post(
            f"/api/charts/{chart_id}/items?k={admin_key}",
            json={"items": [{"label": "Item 1"}]}
        )
        
        conn = sqlite3.connect(TEST_DB_PATH)
        cur = conn.cursor()
        cur.execute("SELECT id FROM items WHERE chart_id=?", (chart_id,))
        item_id = cur.fetchone()[0]
        conn.close()
        
        return chart_id, share_key, item_id
    
    def test_explicit_vote_tier(self):
        chart_id, share_key, item_id = self.setup_chart_with_items()
        
        response = client.post(
            f"/api/vote/explicit?s={share_key}",
            json={
                "chart_id": chart_id,
                "item_id": item_id,
                "tier": 4
            }
        )
        assert response.status_code == 200
        
        conn = sqlite3.connect(TEST_DB_PATH)
        cur = conn.cursor()
        cur.execute("SELECT tier_mu, n_tier FROM scores WHERE item_id=? AND chart_id=?", 
                   (item_id, chart_id))
        row = cur.fetchone()
        conn.close()
        
        assert row[0] == 4.0
        assert row[1] == 1
    
    def test_explicit_vote_x_y_coordinates(self):
        chart_id, share_key, item_id = self.setup_chart_with_items()
        
        response = client.post(
            f"/api/vote/explicit?s={share_key}",
            json={
                "chart_id": chart_id,
                "item_id": item_id,
                "x": 50.0,
                "y": -25.0
            }
        )
        assert response.status_code == 200
        
        conn = sqlite3.connect(TEST_DB_PATH)
        cur = conn.cursor()
        cur.execute("SELECT x_mu, y_mu, n_x, n_y FROM scores WHERE item_id=? AND chart_id=?",
                   (item_id, chart_id))
        row = cur.fetchone()
        conn.close()
        
        assert row[0] == 50.0
        assert row[1] == -25.0
        assert row[2] == 1
        assert row[3] == 1
    
    def test_explicit_vote_incremental_mean(self):
        chart_id, share_key, item_id = self.setup_chart_with_items()
        
        client.post(f"/api/vote/explicit?s={share_key}", json={
            "chart_id": chart_id, "item_id": item_id, "x": 10.0
        })
        client.post(f"/api/vote/explicit?s={share_key}", json={
            "chart_id": chart_id, "item_id": item_id, "x": 20.0
        })
        client.post(f"/api/vote/explicit?s={share_key}", json={
            "chart_id": chart_id, "item_id": item_id, "x": 30.0
        })
        
        conn = sqlite3.connect(TEST_DB_PATH)
        cur = conn.cursor()
        cur.execute("SELECT x_mu, n_x FROM scores WHERE item_id=? AND chart_id=?",
                   (item_id, chart_id))
        row = cur.fetchone()
        conn.close()
        
        assert row[0] == 20.0
        assert row[1] == 3

class TestPublicEndpoint:
    def test_get_public_chart_with_valid_share_key(self):
        create_response = client.post("/api/charts", json={
            "title": "Public Test",
            "mode": "two_axis",
            "x_label": "X Label",
            "y_label": "Y Label"
        })
        chart_data = create_response.json()
        chart_id = chart_data["id"]
        admin_key = chart_data["admin_url"].split("?k=")[1]
        share_key = chart_data["share_url"].split("?s=")[1]
        
        client.post(
            f"/api/charts/{chart_id}/items?k={admin_key}",
            json={"items": [{"label": "Item 1"}, {"label": "Item 2"}]}
        )
        
        response = client.get(f"/api/charts/{chart_id}/public?s={share_key}")
        assert response.status_code == 200
        
        data = response.json()
        assert data["title"] == "Public Test"
        assert data["mode"] == "two_axis"
        assert data["x_label"] == "X Label"
        assert data["y_label"] == "Y Label"
        assert len(data["items"]) == 2
        assert data["items"][0]["label"] in ["Item 1", "Item 2"]
    
    def test_get_public_chart_invalid_share_key(self):
        create_response = client.post("/api/charts", json={
            "title": "Test",
            "mode": "tier"
        })
        chart_id = create_response.json()["id"]
        
        response = client.get(f"/api/charts/{chart_id}/public?s=invalid")
        assert response.status_code == 403
        assert "Invalid share key" in response.json()["detail"]
    
    def test_get_public_chart_not_found(self):
        response = client.get("/api/charts/nonexistent/public?s=key")
        assert response.status_code == 404
        assert "not found" in response.json()["detail"].lower()

class TestHealthCheck:
    def test_health_endpoint(self):
        response = client.get("/health")
        assert response.status_code == 200
        assert response.json() == {"status": "healthy", "service": "twoby"}

class TestAcceptanceCriteria:
    def test_full_workflow(self):
        response = client.post("/api/charts", json={
            "title": "Acceptance Test",
            "mode": "tier"
        })
        chart_data = response.json()
        chart_id = chart_data["id"]
        admin_key = chart_data["admin_url"].split("?k=")[1]
        share_key = chart_data["share_url"].split("?s=")[1]
        
        assert chart_id
        assert admin_key
        assert share_key
        
        response = client.post(
            f"/api/charts/{chart_id}/items?k={admin_key}",
            json={"items": [{"label": "A"}, {"label": "B"}, {"label": "C"}]}
        )
        assert response.status_code == 200
        
        conn = sqlite3.connect(TEST_DB_PATH)
        cur = conn.cursor()
        cur.execute("SELECT COUNT(*) FROM scores WHERE chart_id=?", (chart_id,))
        assert cur.fetchone()[0] == 3
        
        cur.execute("SELECT id FROM items WHERE chart_id=? ORDER BY label", (chart_id,))
        items = [row[0] for row in cur.fetchall()]
        
        response = client.post(f"/api/vote/pair?s={share_key}", json={
            "chart_id": chart_id,
            "item_a": items[0],
            "item_b": items[1],
            "winner": items[0]
        })
        assert response.status_code == 200
        
        response = client.post(f"/api/vote/explicit?s={share_key}", json={
            "chart_id": chart_id,
            "item_id": items[0],
            "tier": 4
        })
        assert response.status_code == 200
        
        cur.execute("SELECT r_x, tier_mu FROM scores WHERE item_id=?", (items[0],))
        row = cur.fetchone()
        assert row[0] > 1000
        assert row[1] == 4.0
        
        response = client.get(f"/api/charts/{chart_id}/public?s={share_key}")
        assert response.status_code == 200
        data = response.json()
        assert data["title"] == "Acceptance Test"
        assert data["mode"] == "tier"
        assert len(data["items"]) == 3
        
        item_a_data = next(i for i in data["items"] if i["id"] == items[0])
        assert item_a_data["r_x"] > 1000
        assert item_a_data["tier_mu"] == 4.0
        
        conn.close()

if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])