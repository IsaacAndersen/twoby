import modal
from fastapi import FastAPI

app = modal.App("twoby-frontend")

# Use pre-built files and serve them via FastAPI
# Since we already have the dist folder, we'll embed the content
image = modal.Image.debian_slim(python_version="3.12").pip_install("fastapi[standard]")

# Read the built files at deployment time (from local)
import os

def load_static_files():
    files = {}
    dist_path = "./dist"
    
    # Load index.html
    with open(os.path.join(dist_path, "index.html"), 'r') as f:
        files['index.html'] = f.read()
    
    # Load assets
    assets_path = os.path.join(dist_path, "assets")
    if os.path.exists(assets_path):
        for filename in os.listdir(assets_path):
            filepath = os.path.join(assets_path, filename)
            if filename.endswith(('.css', '.js')):
                try:
                    with open(filepath, 'r', encoding='utf-8') as f:
                        files[f"assets/{filename}"] = f.read()
                except UnicodeDecodeError:
                    with open(filepath, 'rb') as f:
                        files[f"assets/{filename}"] = f.read()
    
    return files

# Load files at import time (when deploying)
STATIC_FILES = load_static_files()

# Define the frontend FastAPI app at module level
frontend_app = FastAPI(title="twoby Frontend")

@frontend_app.get("/assets/{filename}")
def serve_asset(filename: str):
    asset_key = f"assets/{filename}"
    if asset_key in STATIC_FILES:
        from fastapi import Response
        content = STATIC_FILES[asset_key]
        if filename.endswith('.css'):
            media_type = "text/css"
        elif filename.endswith('.js'):
            media_type = "application/javascript"
        else:
            media_type = "application/octet-stream"
        
        if isinstance(content, bytes):
            return Response(content=content, media_type=media_type)
        else:
            return Response(content=content.encode(), media_type=media_type)
    from fastapi import Response
    return Response(status_code=404)

@frontend_app.get("/{path:path}")
def serve_spa(path: str = ""):
    from fastapi.responses import HTMLResponse
    return HTMLResponse(content=STATIC_FILES['index.html'])

@app.function(
    image=image,
    scaledown_window=300,
)
@modal.asgi_app(custom_domains=["twoby.ike.rs"])
def frontend():
    return frontend_app