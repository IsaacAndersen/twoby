import modal
from pathlib import Path
import subprocess
import os
import tempfile
import shutil

# Create Modal app
app = modal.App("resident-survey-frontend")

# Build the React app locally first, then serve it
def build_react_app():
    """Build React app locally and return the built files as a dictionary"""
    current_dir = Path(__file__).parent
    
    # Create production environment
    env_content = "VITE_API_BASE=https://surveyapi.ike.rs\n"
    env_file = current_dir / ".env.production"
    with open(env_file, "w") as f:
        f.write(env_content)
    
    print("🏗️ Building React app...")
    
    # Run the build process
    result = subprocess.run(["npm", "run", "build"], 
                          cwd=current_dir, 
                          capture_output=True, 
                          text=True)
    
    if result.returncode != 0:
        print("❌ Build failed:")
        print(result.stderr)
        raise Exception("Build failed")
    
    print("✅ Build successful!")
    
    # Read all built files
    dist_dir = current_dir / "dist"
    built_files = {}
    
    for file_path in dist_dir.rglob("*"):
        if file_path.is_file():
            relative_path = file_path.relative_to(dist_dir)
            with open(file_path, "rb") as f:
                built_files[str(relative_path)] = f.read()
    
    print(f"📦 Packaged {len(built_files)} files")
    return built_files

# Build files at module level (this runs when the module is imported)
print("🚀 Preparing frontend deployment...")
try:
    BUILT_FILES = build_react_app()
    print(f"✅ Frontend ready with {len(BUILT_FILES)} files")
except Exception as e:
    print(f"⚠️ Build failed: {e}")
    BUILT_FILES = {}

# Static file server
@app.function(
    image=modal.Image.debian_slim().pip_install("fastapi"),
    min_containers=1,
    container_idle_timeout=300,
)
@modal.asgi_app(custom_domains=["survey.ike.rs"])  
def serve_static():
    from fastapi import FastAPI, Response
    from fastapi.responses import HTMLResponse
    import mimetypes
    
    web_app = FastAPI(title="Resident Survey Frontend")
    
    @web_app.get("/{path:path}")
    async def serve_file(path: str = ""):
        # Handle empty path or directory paths
        if not path or path.endswith("/"):
            path = "index.html"
        
        # Serve the requested file if it exists
        if path in BUILT_FILES:
            content = BUILT_FILES[path]
            content_type, _ = mimetypes.guess_type(path)
            
            return Response(
                content=content,
                media_type=content_type or "application/octet-stream"
            )
        
        # For SPA routing, serve index.html for unknown paths
        if "index.html" in BUILT_FILES:
            content = BUILT_FILES["index.html"]
            return HTMLResponse(content=content)
        
        # Fallback if no files are available
        fallback_html = """
        <!DOCTYPE html>
        <html>
        <head>
            <title>Resident AI Survey</title>
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <style>
                body { 
                    font-family: system-ui; 
                    display: flex; 
                    justify-content: center; 
                    align-items: center; 
                    height: 100vh; 
                    margin: 0; 
                    background: #f3f4f6;
                }
                .container { 
                    text-align: center; 
                    padding: 2rem;
                    background: white;
                    border-radius: 8px;
                    box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);
                }
            </style>
        </head>
        <body>
            <div class="container">
                <h1>🏥 Resident AI Survey</h1>
                <p>Frontend is being deployed...</p>
                <p><a href="https://surveyapi.ike.rs/health">Check API Status</a></p>
            </div>
        </body>
        </html>
        """
        return HTMLResponse(content=fallback_html)
    
    return web_app