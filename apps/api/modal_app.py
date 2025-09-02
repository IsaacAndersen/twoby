import modal

# API-only deployment
app = modal.App(
    "twoby-api",
)

image = (
    modal.Image.debian_slim(python_version="3.12")
    .pip_install(
        "fastapi[standard]==0.115.0",
        "argon2-cffi==23.1.0",
        "orjson==3.10.7"
    )
)

volume = modal.Volume.from_name("twoby-sqlite", create_if_missing=True)

@app.function(
    image=image,
    volumes={"/db": volume},
    scaledown_window=300,
    max_containers=1,  # Single container to protect SQLite
    secrets=[modal.Secret.from_name("twoby-env")],
    mounts=[modal.mount.from_local_dir(".", remote_path="/root")],
)
@modal.concurrent(max_inputs=64)  # Handle concurrent requests in single container
@modal.fastapi_endpoint(custom_domains=["twobyapi.ike.rs"])
def fastapi_app():
    import sys
    sys.path.append("/root")
    
    from app import app as _app
    
    # Commit volume changes periodically
    def commit_volume():
        volume.commit()
    
    # Add a hook to commit after writes
    import atexit
    atexit.register(commit_volume)
    
    return _app