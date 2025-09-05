#!/usr/bin/env python3
"""
Generate Modal deployment file with embedded React assets for Resident Survey Frontend
"""

import os
import base64
import json
from pathlib import Path

def read_text_file(file_path):
    """Read a text file and return its content"""
    with open(file_path, 'r', encoding='utf-8') as f:
        return f.read()

def read_binary_file(file_path):
    """Read a binary file and return base64 encoded content"""
    with open(file_path, 'rb') as f:
        return base64.b64encode(f.read()).decode('utf-8')

def generate_asset_dict():
    """Generate a dictionary of all assets from the dist folder"""
    dist_path = Path('./dist')
    if not dist_path.exists():
        raise FileNotFoundError("dist/ folder not found. Run 'npm run build' first.")
    
    assets = {}
    
    # Read index.html
    index_path = dist_path / 'index.html'
    if index_path.exists():
        assets['index.html'] = read_text_file(index_path)
    
    # Read all files in assets/ directory
    assets_dir = dist_path / 'assets'
    if assets_dir.exists():
        for asset_file in assets_dir.iterdir():
            if asset_file.is_file():
                rel_path = f"assets/{asset_file.name}"
                if asset_file.suffix in ['.css', '.js', '.json', '.txt']:
                    # Text files
                    assets[rel_path] = read_text_file(asset_file)
                else:
                    # Binary files (images, fonts, etc.)
                    assets[rel_path] = {
                        'content': read_binary_file(asset_file),
                        'binary': True
                    }
    
    # Read other static files (like vite.svg, favicon, etc.)
    for static_file in dist_path.iterdir():
        if static_file.is_file() and static_file.name != 'index.html':
            if static_file.suffix in ['.svg', '.png', '.jpg', '.ico', '.txt', '.json']:
                if static_file.suffix in ['.txt', '.json']:
                    assets[static_file.name] = read_text_file(static_file)
                else:
                    assets[static_file.name] = {
                        'content': read_binary_file(static_file),
                        'binary': True
                    }
    
    return assets

def generate_modal_file(assets):
    """Generate the Modal deployment Python file"""
    
    # Convert assets to Python code
    assets_code = "ASSETS = {\n"
    for path, content in assets.items():
        if isinstance(content, dict) and content.get('binary'):
            # Binary asset
            assets_code += f'    "{path}": {{"content": "{content["content"]}", "binary": True}},\n'
        else:
            # Text asset - escape quotes and newlines
            escaped_content = content.replace('\\', '\\\\').replace('"', '\\"').replace('\n', '\\n').replace('\r', '\\r')
            assets_code += f'    "{path}": "{escaped_content}",\n'
    assets_code += "}\n"
    
    modal_template = f'''import modal
from fastapi import FastAPI, Response, Request
from fastapi.responses import HTMLResponse
import base64

app = modal.App("resident-survey-frontend")
image = modal.Image.debian_slim(python_version="3.12").pip_install("fastapi[standard]")

# Embedded React Vite assets
{assets_code}

frontend_app = FastAPI(title="Resident AI Survey Frontend")

@frontend_app.get("/assets/{{filename}}")
def serve_asset(filename: str):
    """Serve CSS/JS/other assets"""
    asset_key = f'assets/{{filename}}'
    if asset_key in ASSETS:
        content = ASSETS[asset_key]
        
        # Handle binary assets
        if isinstance(content, dict) and content.get('binary'):
            binary_content = base64.b64decode(content['content'])
            if filename.endswith('.css'):
                return Response(content=binary_content, media_type="text/css")
            elif filename.endswith('.js'):
                return Response(content=binary_content, media_type="application/javascript")
            elif filename.endswith('.png'):
                return Response(content=binary_content, media_type="image/png")
            elif filename.endswith('.svg'):
                return Response(content=binary_content, media_type="image/svg+xml")
            else:
                return Response(content=binary_content)
        else:
            # Text assets
            if filename.endswith('.css'):
                return Response(content=content, media_type="text/css")
            elif filename.endswith('.js'):
                return Response(content=content, media_type="application/javascript")
            else:
                return Response(content=content)
    
    return Response(status_code=404)

@frontend_app.get("/favicon.svg")
@frontend_app.get("/vite.svg")
@frontend_app.get("/_redirects")
def serve_static_file(request: Request):
    """Serve specific static files"""
    path = request.url.path.lstrip('/')
    if path in ASSETS:
        content = ASSETS[path]
        
        if isinstance(content, dict) and content.get('binary'):
            binary_content = base64.b64decode(content['content'])
            if path.endswith('.svg'):
                return Response(content=binary_content, media_type="image/svg+xml")
            elif path.endswith('.ico'):
                return Response(content=binary_content, media_type="image/x-icon")
            elif path.endswith('.png'):
                return Response(content=binary_content, media_type="image/png")
            else:
                return Response(content=binary_content)
        else:
            return Response(content=content)
    
    return Response(status_code=404)

# Catch-all route for SPA - MUST come last
@frontend_app.get("/{{path:path}}")
def serve_spa(path: str):
    """Serve the React SPA for all routes"""
    # Don't intercept specific file requests
    if path.startswith('assets/') or '.' in path.split('/')[-1]:
        return Response(status_code=404)
    
    if 'index.html' in ASSETS:
        return HTMLResponse(content=ASSETS['index.html'])
    else:
        return HTMLResponse(content="<h1>Survey App - Build not found</h1>")

@app.function(
    image=image, 
    min_containers=1,
    scaledown_window=300
)
@modal.asgi_app(custom_domains=["survey.ike.rs"])
def frontend():
    return frontend_app
'''
    
    return modal_template

def main():
    """Main function to generate the Modal deployment"""
    print("🚀 Generating Modal deployment for Resident Survey Frontend...")
    print("📁 Reading React Vite assets from dist/...")
    
    try:
        assets = generate_asset_dict()
    except FileNotFoundError as e:
        print(f"❌ {e}")
        print("💡 Please run 'npm run build' first to create the dist/ folder")
        return
    
    print(f"✅ Found {len(assets)} assets:")
    for path in sorted(assets.keys()):
        if isinstance(assets[path], dict):
            size = len(assets[path]['content'])
            print(f"  📄 {path} ({size} chars, binary)")
        else:
            size = len(assets[path])
            print(f"  📄 {path} ({size} chars)")
    
    print("🔧 Generating Modal deployment file...")
    modal_code = generate_modal_file(assets)
    
    # Write the generated file
    output_path = 'modal_frontend_generated.py'
    with open(output_path, 'w', encoding='utf-8') as f:
        f.write(modal_code)
    
    print(f"✅ Generated {output_path}")
    print(f"📊 File size: {len(modal_code):,} characters")
    print("🚀 Ready to deploy with: modal deploy modal_frontend_generated.py")
    print("🌐 Will be available at: https://survey.ike.rs")

if __name__ == '__main__':
    main()