#!/usr/bin/env python3
import os
import uvicorn

os.environ["DB_PATH"] = "./twoby_local.db"
os.environ["PEPPER"] = "local-dev-pepper"

if __name__ == "__main__":
    uvicorn.run(
        "app:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_level="info"
    )