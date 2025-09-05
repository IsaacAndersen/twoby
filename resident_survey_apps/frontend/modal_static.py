import modal
from pathlib import Path
import os
import mimetypes
import subprocess
import zipfile
import tempfile

# Create Modal app for frontend
app = modal.App("resident-survey-frontend")

# Create the build image with Node.js
build_image = modal.Image.debian_slim(python_version="3.12").apt_install(
    "curl", "ca-certificates", "zip"
).run_commands(
    "curl -fsSL https://deb.nodesource.com/setup_20.x | bash -",
    "apt-get install -y nodejs",
    "npm install -g npm@latest"
)

# Volume to store built files
built_assets = modal.Volume.from_name("resident-survey-assets", create_if_missing=True)

# Build function that uploads source and builds
@app.function(
    image=build_image,
    volumes={"/assets": built_assets},
    timeout=600,  # 10 minutes for build
)
def build_and_store():
    """Build the React app locally and store in volume"""
    
    # Create a zip file with the source code
    source_dir = Path(__file__).parent
    
    print("📦 Preparing source files...")
    
    # Copy essential files to temp directory
    import tempfile
    import shutil
    
    with tempfile.TemporaryDirectory() as temp_dir:
        temp_path = Path(temp_dir) / "frontend"
        temp_path.mkdir()
        
        # Copy source files (excluding node_modules, dist, etc.)
        exclude_patterns = {
            'node_modules', 'dist', '.git', '.next', 
            '__pycache__', '.pytest_cache', 'modal_*.py',
            '*.log'
        }
        
        for item in source_dir.iterdir():
            if item.name not in exclude_patterns:
                if item.is_dir():
                    shutil.copytree(item, temp_path / item.name, 
                                  ignore=shutil.ignore_patterns(*exclude_patterns))
                else:
                    shutil.copy2(item, temp_path / item.name)
        
        os.chdir(temp_path)
        
        # Create production environment file
        with open(".env.production", "w") as f:
            f.write("VITE_API_BASE=https://surveyapi.ike.rs\n")
        
        print("📦 Installing dependencies...")
        subprocess.run(["npm", "install"], check=True)
        
        print("🏗️ Building production bundle...")
        subprocess.run(["npm", "run", "build"], check=True)
        
        # Copy built files to volume
        dist_path = temp_path / "dist"
        if not dist_path.exists():
            raise Exception("Build failed - no dist directory created")
        
        print("💾 Storing built files...")
        assets_path = Path("/assets")
        
        # Clear existing files
        if assets_path.exists():
            shutil.rmtree(assets_path, ignore_errors=True)
        assets_path.mkdir(exist_ok=True)
        
        # Copy all built files
        shutil.copytree(dist_path, assets_path / "dist", dirs_exist_ok=True)
        
        print(f"✅ Build complete! Files stored in volume.")
        return "Build successful"

# Static file server
@app.function(
    image=modal.Image.debian_slim().pip_install("fastapi", "python-multipart"),
    volumes={"/assets": built_assets},
    min_containers=1,  # Keep warm
    container_idle_timeout=300,
)
@modal.asgi_app(custom_domains=["survey.ike.rs"])
def serve_static():
    from fastapi import FastAPI, Response
    from fastapi.responses import HTMLResponse, FileResponse
    
    web_app = FastAPI(title="Resident Survey Frontend")
    
    assets_path = Path("/assets/dist")
    
    @web_app.get("/{path:path}")
    async def serve_file(path: str = ""):
        # Build files on first request if they don't exist
        if not assets_path.exists() or not any(assets_path.iterdir()):
            print("🏗️ Building frontend assets...")
            build_and_store.remote()
        
        # Default to index.html for root or directory paths
        if not path or path.endswith("/"):
            path = "index.html"
        
        file_path = assets_path / path
        
        # Serve requested file if it exists
        if file_path.exists() and file_path.is_file():
            # Determine content type
            content_type, _ = mimetypes.guess_type(str(file_path))
            
            with open(file_path, "rb") as f:
                content = f.read()
            
            return Response(content=content, media_type=content_type)
        
        # For SPA routing, serve index.html for unknown paths
        index_path = assets_path / "index.html"
        if index_path.exists():
            with open(index_path, "rb") as f:
                content = f.read()
            return HTMLResponse(content=content)
        
        return Response(content="Frontend not built yet. Please wait...", status_code=503)
    
    return web_app

# Manual build trigger
@app.function(
    image=build_image,
    volumes={"/assets": built_assets}
)
def trigger_build():
    """Manually trigger a frontend build"""
    return build_and_store.local()