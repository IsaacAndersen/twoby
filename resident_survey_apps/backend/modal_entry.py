import modal

# Create Modal image with dependencies
image = modal.Image.debian_slim(python_version="3.12").pip_install(
    "fastapi[standard]==0.115.0",
    "pydantic==2.5.0",
    "uvicorn==0.24.0"
).copy_local_file("../residents.txt", "/root/residents.txt")

# Create Modal volume for persistent SQLite database
vol = modal.Volume.from_name("resident-ai-survey-db", create_if_missing=True)

# Create Modal app
app = modal.App("resident-ai-survey-api")

@app.function(
    image=image,
    volumes={"/vol": vol},
    secrets=[modal.Secret.from_name("resident-survey-secrets")],
    min_containers=1,  # Keep warm to avoid cold starts
    max_containers=10,  # Scale up as needed
    scaledown_window=300,  # Keep containers alive for 5 minutes
)
@modal.asgi_app(custom_domains=["surveyapi.ike.rs"])
def fastapi():
    # Import the FastAPI app inside the function to avoid import issues
    from modal_all import app as fastapi_app
    return fastapi_app