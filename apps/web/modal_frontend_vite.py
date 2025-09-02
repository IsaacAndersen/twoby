import modal
from fastapi import FastAPI, Response
from fastapi.responses import HTMLResponse

app = modal.App("twoby-frontend-vite")
image = modal.Image.debian_slim(python_version="3.12").pip_install("fastapi[standard]")

# Read the actual Vite-built files at deployment time
import os

def read_vite_assets():
    """Read the built Vite assets from the dist directory"""
    base_path = "/Users/isaac/Developer/twoby/apps/web/dist"
    
    assets = {}
    
    # Read index.html
    with open(os.path.join(base_path, "index.html"), 'r', encoding='utf-8') as f:
        assets['index.html'] = f.read()
    
    # Read CSS file
    css_file = "index-Dkyp4eHy.css"
    with open(os.path.join(base_path, "assets", css_file), 'r', encoding='utf-8') as f:
        assets[f'assets/{css_file}'] = f.read()
    
    # Read JS file
    js_file = "index-ByVUEG44.js"
    with open(os.path.join(base_path, "assets", js_file), 'r', encoding='utf-8') as f:
        assets[f'assets/{js_file}'] = f.read()
        
    # Read vite.svg
    with open(os.path.join(base_path, "vite.svg"), 'r', encoding='utf-8') as f:
        assets['vite.svg'] = f.read()
    
    return assets

# Load the real Vite assets at deployment time
VITE_ASSETS = read_vite_assets()

# Update the index.html to use the correct API URL
updated_index = VITE_ASSETS['index.html'].replace(
    'VITE_API_URL=https://twobyapi.ike.rs',
    ''  # The environment variable will be baked into the JS
)

frontend_app = FastAPI(title="twoby - Real Frontend")

@frontend_app.get("/assets/{filename}")
def serve_asset(filename: str):
    asset_key = f'assets/{filename}'
    if asset_key in VITE_ASSETS:
        content = VITE_ASSETS[asset_key]
        if filename.endswith('.css'):
            return Response(content=content, media_type="text/css")
        elif filename.endswith('.js'):
            return Response(content=content, media_type="application/javascript")
    return Response(status_code=404)

@frontend_app.get("/vite.svg")
def serve_vite_svg():
    return Response(content=VITE_ASSETS['vite.svg'], media_type="image/svg+xml")

@frontend_app.get("/")
@frontend_app.get("/{path:path}")
def serve_spa(path: str = ""):
    return HTMLResponse(content=VITE_ASSETS['index.html'])

@app.function(image=image, scaledown_window=300)
@modal.asgi_app(custom_domains=["twoby.ike.rs"])
def frontend():
    return frontend_app