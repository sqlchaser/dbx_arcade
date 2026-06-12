"""DBX Arcade — minimal static server for a Databricks App.

Serves the arcade frontend and the .jsdos game bundles. No database, no auth
logic beyond what the Databricks Apps platform already enforces in front of us.
"""
import os
import mimetypes

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from starlette.middleware.base import BaseHTTPMiddleware

# .jsdos bundles are zip archives; make sure they're served as binary.
mimetypes.add_type("application/zip", ".jsdos")

STATIC_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "static")

app = FastAPI(title="DBX Arcade")


class ArcadeHeaders(BaseHTTPMiddleware):
    """Two jobs:

    1. Cross-origin isolation. js-dos runs DOSBox in a Web Worker backed by a
       SharedArrayBuffer, which the browser only exposes when the document is
       cross-origin isolated. COOP:same-origin + COEP:credentialless turns that
       on. We use `credentialless` (not `require-corp`) so cross-origin
       subresources without CORP headers — Google Fonts, the js-dos CDN — still
       load. Without this, DOSBox falls back to the main thread and games lag.

    2. Long-cache the (immutable) game bundles; let HTML revalidate.
    """

    async def dispatch(self, request, call_next):
        response = await call_next(request)
        response.headers["Cross-Origin-Opener-Policy"] = "same-origin"
        response.headers["Cross-Origin-Embedder-Policy"] = "credentialless"
        path = request.url.path
        if path.endswith(".jsdos") or path.startswith("/games/"):
            response.headers["Cache-Control"] = "public, max-age=31536000, immutable"
        elif path.endswith(".html") or path == "/":
            response.headers["Cache-Control"] = "no-cache"
        return response


app.add_middleware(ArcadeHeaders)

# Mount the whole static tree at root (index.html served for "/").
app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="static")


if __name__ == "__main__":
    import uvicorn

    port = int(os.environ.get("DATABRICKS_APP_PORT", os.environ.get("PORT", "8000")))
    uvicorn.run(app, host="0.0.0.0", port=port)
