#!/usr/bin/env python3
"""
Integration tests for Twoby API
Run with: python test_integration.py
"""
import requests
import os
import json

API_BASE = os.getenv("API_URL", "https://twobyapi.ike.rs")

def test_image_search():
    """Test image search endpoint"""
    print("Testing image search...")
    
    try:
        response = requests.get(f"{API_BASE}/api/images/search?q=apple")
        
        if response.status_code == 200:
            data = response.json()
            if "results" in data and len(data["results"]) > 0:
                print("✅ Image search working - found results")
                return True
            else:
                print("⚠️  Image search returned empty results")
                return False
        else:
            print(f"❌ Image search failed with status {response.status_code}")
            print(f"Response: {response.text}")
            return False
    except Exception as e:
        print(f"❌ Image search error: {e}")
        return False

def test_ai_suggestions():
    """Test AI suggestion endpoints"""
    print("Testing AI suggestions...")
    
    try:
        # Test item suggestions
        payload = {
            "title": "Best Programming Languages",
            "description": "Languages for web development",
            "existingItems": ["Python", "JavaScript"],
            "mode": "ranking"
        }
        
        response = requests.post(f"{API_BASE}/api/ai/generate-items", json=payload)
        
        if response.status_code == 200:
            data = response.json()
            if "items" in data and len(data["items"]) > 0:
                print("✅ AI item suggestions working")
                return True
            else:
                print("⚠️  AI suggestions returned empty")
                return False
        else:
            print(f"❌ AI suggestions failed with status {response.status_code}")
            return False
    except Exception as e:
        print(f"❌ AI suggestions error: {e}")
        return False

def test_chart_creation():
    """Test basic chart creation flow"""
    print("Testing chart creation...")
    
    try:
        payload = {
            "mode": "ranking",
            "title": "Test Chart",
            "description": "Test description",
            "visibility": "private"
        }
        
        response = requests.post(f"{API_BASE}/api/charts", json=payload)
        
        if response.status_code == 200:
            data = response.json()
            if "id" in data and "admin_url" in data:
                print("✅ Chart creation working")
                return True
            else:
                print("⚠️  Chart creation missing expected fields")
                return False
        else:
            print(f"❌ Chart creation failed with status {response.status_code}")
            return False
    except Exception as e:
        print(f"❌ Chart creation error: {e}")
        return False

def main():
    print(f"Running integration tests against {API_BASE}")
    print("-" * 50)
    
    tests = [
        test_chart_creation,
        test_image_search,
        test_ai_suggestions
    ]
    
    results = []
    for test in tests:
        results.append(test())
        print()
    
    passed = sum(results)
    total = len(results)
    
    print(f"Results: {passed}/{total} tests passed")
    
    if passed == total:
        print("🎉 All tests passed!")
        return True
    else:
        print("❌ Some tests failed")
        return False

if __name__ == "__main__":
    success = main()
    exit(0 if success else 1)