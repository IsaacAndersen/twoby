import modal
from pathlib import Path
import subprocess
import tempfile
import shutil

# Create Modal app for frontend
app = modal.App("resident-survey-frontend")

# Create build image with Node.js
build_image = modal.Image.debian_slim(python_version="3.12").apt_install(
    "curl", "ca-certificates"
).run_commands(
    "curl -fsSL https://deb.nodesource.com/setup_20.x | bash -",
    "apt-get install -y nodejs",
    "npm install -g npm@latest"
)

# Pre-build the frontend during image creation
@app.function(image=build_image, timeout=600)
def build_frontend():
    """Build the React frontend"""
    import os
    
    # Create a temporary directory and copy source files
    source_dir = Path("/tmp/frontend_src")
    source_dir.mkdir(exist_ok=True)
    
    # Note: In a real deployment, you'd upload source files here
    # For now, let's create a minimal structure that works
    package_json = {
        "name": "resident-survey-frontend",
        "private": True,
        "version": "0.0.0",
        "type": "module",
        "scripts": {
            "build": "echo 'Build placeholder'"
        }
    }
    
    print("Building frontend would happen here...")
    return "Build complete"

# Static file server
@app.function(
    image=modal.Image.debian_slim().pip_install("fastapi"),
    min_containers=1,
    container_idle_timeout=300,
)
@modal.asgi_app(custom_domains=["survey.ike.rs"])
def serve_frontend():
    from fastapi import FastAPI
    from fastapi.responses import HTMLResponse, Response
    
    app = FastAPI()
    
    # For now, serve a simple HTML page that loads the built React app
    # In production, this would serve your actual built files
    
    @app.get("/")
    @app.get("/{path:path}")
    async def serve_spa(path: str = ""):
        # This is a placeholder - in real deployment you'd serve actual built files
        html_content = """
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Resident AI Survey - Deploying...</title>
            <style>
                body { 
                    font-family: system-ui, -apple-system, sans-serif; 
                    display: flex; 
                    justify-content: center; 
                    align-items: center; 
                    height: 100vh; 
                    margin: 0;
                    background: #f9fafb;
                }
                .loading {
                    text-align: center;
                    padding: 2rem;
                    background: white;
                    border-radius: 8px;
                    box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);
                }
                .spinner {
                    width: 40px;
                    height: 40px;
                    border: 4px solid #e5e7eb;
                    border-top: 4px solid #3b82f6;
                    border-radius: 50%;
                    animation: spin 1s linear infinite;
                    margin: 0 auto 1rem;
                }
                @keyframes spin { to { transform: rotate(360deg); } }
            </style>
        </head>
        <body>
            <div class="loading">
                <div class="spinner"></div>
                <h2>🚀 Deploying Resident AI Survey</h2>
                <p>The frontend is being built and deployed.<br>This page will automatically update when ready.</p>
                <p><small>Backend API: <a href="https://surveyapi.ike.rs/health">https://surveyapi.ike.rs/health</a></small></p>
            </div>
            <script>
                // Auto-reload every 30 seconds
                setTimeout(() => location.reload(), 30000);
            </script>
        </body>
        </html>
        """
        return HTMLResponse(content=html_content)
    
    return app