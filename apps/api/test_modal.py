import modal
from fastapi import FastAPI

# Define FastAPI app at module level
web_app = FastAPI()

@web_app.get("/")
def root():
    return {"message": "Hello World"}

@web_app.get("/health") 
def health():
    return {"status": "ok"}

# Modal setup
app = modal.App("test-api")
image = modal.Image.debian_slim(python_version="3.12").pip_install("fastapi[standard]")

@app.function(image=image)
@modal.asgi_app()
def asgi():
    return web_app