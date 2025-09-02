import modal

app = modal.App("twoby-frontend")

# Create image with Node.js and build the frontend
image = (
    modal.Image.debian_slim()
    .apt_install("curl")
    .run_commands(
        "curl -fsSL https://deb.nodesource.com/setup_20.x | bash -",
        "apt-get install -y nodejs"
    )
    .pip_install("fastapi[standard]")
    .copy_local_dir(".", "/app")
    .workdir("/app")
    .env({"VITE_API_URL": "https://twobyapi.ike.rs"})
    .run_commands("npm install", "npm run build")
)

@app.function(
    image=image,
    scaledown_window=300,
)
@modal.fastapi_endpoint(custom_domains=["twoby.ike.rs"])
def frontend():
    from fastapi import FastAPI
    from fastapi.staticfiles import StaticFiles
    from fastapi.responses import FileResponse
    import os
    
    app = FastAPI(title="twoby Frontend")
    
    # Mount static assets
    if os.path.exists("/app/dist/assets"):
        app.mount("/assets", StaticFiles(directory="/app/dist/assets"), name="assets")
    
    # SPA routing - serve index.html for all routes
    @app.get("/{path:path}")
    def serve_spa(path: str = ""):
        return FileResponse("/app/dist/index.html")
    
    return app