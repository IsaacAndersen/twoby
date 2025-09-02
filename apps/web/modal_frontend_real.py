import modal
import subprocess
import os

app = modal.App("twoby-frontend-real")

# Create image that builds the Vite frontend
image = (
    modal.Image.debian_slim()
    .apt_install("curl")
    .run_commands(
        "curl -fsSL https://deb.nodesource.com/setup_20.x | bash -",
        "apt-get install -y nodejs"
    )
    .pip_install("fastapi[standard]")
)

@app.function(
    image=image,
    scaledown_window=300,
    timeout=300,
)
@modal.web_endpoint(custom_domains=["twoby.ike.rs"])
def frontend():
    # Build the frontend on container startup
    import subprocess
    import tempfile
    import shutil
    import os
    
    # Copy source files to temporary directory
    with tempfile.TemporaryDirectory() as tmpdir:
        # We'll need to somehow get the source files into the container
        # For now, let's serve the pre-built assets we know work
        pass
    
    from fastapi import FastAPI
    from fastapi.responses import HTMLResponse, Response
    
    app = FastAPI()
    
    # Serve the real index.html content (embedded)
    index_content = """<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/vite.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>twoby</title>
    <script type="module" crossorigin src="/assets/index-ByVUEG44.js"></script>
    <link rel="stylesheet" crossorigin href="/assets/index-Dkyp4eHy.css">
  </head>
  <body>
    <div id="root"></div>
  </body>
</html>"""

    # We'll need to embed the actual CSS and JS content
    # Let me read the actual built files and embed them
    
    @app.get("/")
    @app.get("/{path:path}")
    def serve_app(path: str = ""):
        return HTMLResponse(content=index_content)
        
    @app.get("/assets/{filename}")
    def serve_assets(filename: str):
        # For now return 404, we need to embed the actual assets
        return Response(status_code=404)
    
    return app