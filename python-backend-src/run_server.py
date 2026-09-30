import os
import uvicorn

if __name__ == "__main__":
    port = int(os.environ.get("PYTHON_SERVER_PORT", "8000"))
    uvicorn.run(
        "server_api:app",
        host="127.0.0.1",
        port=port,
        log_level="info",
        access_log=False,
    )
