import modal
from fastapi import FastAPI, Response
from fastapi.responses import HTMLResponse
import os
import base64

app = modal.App("twoby-frontend")
image = modal.Image.debian_slim(python_version="3.12").pip_install("fastapi[standard]")

# Read and embed static files at module level (during deployment)
def read_static_files():
    dist_path = "/Users/isaac/Developer/twoby/apps/web/dist"
    files = {}
    
    # Read index.html
    with open(os.path.join(dist_path, "index.html"), 'r') as f:
        files['index.html'] = f.read()
    
    # Read asset files
    assets_path = os.path.join(dist_path, "assets")
    for filename in os.listdir(assets_path):
        filepath = os.path.join(assets_path, filename)
        if filename.endswith('.css'):
            with open(filepath, 'r', encoding='utf-8') as f:
                files[f"assets/{filename}"] = f.read()
        elif filename.endswith('.js'):
            with open(filepath, 'r', encoding='utf-8') as f:
                files[f"assets/{filename}"] = f.read()
    
    return files

# Load files during deployment
STATIC_FILES = read_static_files()

# Create FastAPI app at module level
frontend_app = FastAPI(title="twoby Frontend")

@frontend_app.get("/assets/{filename}")
def serve_asset(filename: str):
    asset_key = f"assets/{filename}"
    if asset_key in STATIC_FILES:
        content = STATIC_FILES[asset_key]
        if filename.endswith('.css'):
            return Response(content=content, media_type="text/css")
        elif filename.endswith('.js'):
            return Response(content=content, media_type="application/javascript")
    
    return Response(status_code=404)

@frontend_app.get("/")
@frontend_app.get("/{path:path}")
def serve_spa(path: str = ""):
    return HTMLResponse(content=STATIC_FILES['index.html'])

@app.function(image=image, scaledown_window=300)
@modal.asgi_app(custom_domains=["twoby.ike.rs"])
def frontend():
    return frontend_app