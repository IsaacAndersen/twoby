import modal
import subprocess
from pathlib import Path

# Create Modal image with Node.js and build tools
image = modal.Image.debian_slim(python_version="3.12").apt_install(
    "curl", "ca-certificates"
).run_commands(
    "curl -fsSL https://deb.nodesource.com/setup_20.x | bash -",
    "apt-get install -y nodejs",
    "npm install -g npm@latest"
).pip_install("python-dotenv")

# Create Modal app for frontend
app = modal.App("resident-ai-survey-frontend")

# Mount the current directory
mount = modal.Mount.from_local_dir(
    Path(__file__).parent,
    remote_path="/app"
)

@app.function(
    image=image,
    mounts=[mount],
    min_containers=1,  # Keep warm
    container_idle_timeout=300,  # Keep alive for 5 minutes
)
@modal.web_endpoint(
    method="GET",
    custom_domains=["survey.ike.rs"]
)
def serve_frontend(request):
    import os
    from pathlib import Path
    from modal import web_endpoint
    
    # Build the app if needed
    app_dir = Path("/app")
    dist_dir = app_dir / "dist"
    
    if not dist_dir.exists() or not any(dist_dir.iterdir()):
        print("Building frontend...")
        os.chdir(app_dir)
        
        # Set environment variable for production API
        with open(".env", "w") as f:
            f.write("VITE_API_BASE=https://surveyapi.ike.rs\n")
        
        # Install dependencies and build
        subprocess.run(["npm", "install"], check=True)
        subprocess.run(["npm", "run", "build"], check=True)
    
    # Serve static files
    from fastapi import FastAPI
    from fastapi.staticfiles import StaticFiles
    from fastapi.responses import FileResponse
    import mimetypes
    
    web_app = FastAPI()
    
    # Mount static files
    web_app.mount("/assets", StaticFiles(directory="/app/dist/assets"), name="assets")
    
    @web_app.get("/{path:path}")
    def serve_spa(path: str = ""):
        if not path or path.endswith("/"):
            return FileResponse("/app/dist/index.html")
        
        file_path = Path(f"/app/dist/{path}")
        if file_path.exists() and file_path.is_file():
            # Set correct content type
            content_type, _ = mimetypes.guess_type(str(file_path))
            return FileResponse(str(file_path), media_type=content_type)
        
        # For SPA routing, return index.html for unknown paths
        return FileResponse("/app/dist/index.html")
    
    return web_app

# Alternative simpler static hosting approach
@app.function(
    image=image,
    mounts=[mount],
    min_containers=1,
)
def build_and_upload():
    """Build the frontend and prepare for static hosting"""
    import os
    import shutil
    from pathlib import Path
    
    app_dir = Path("/app")
    os.chdir(app_dir)
    
    # Set production environment
    with open(".env", "w") as f:
        f.write("VITE_API_BASE=https://surveyapi.ike.rs\n")
    
    # Clean and build
    if Path("dist").exists():
        shutil.rmtree("dist")
    
    subprocess.run(["npm", "install"], check=True)
    subprocess.run(["npm", "run", "build"], check=True)
    
    print("✅ Frontend built successfully!")
    print("📁 Files are in /app/dist/")
    
    return "Build complete"