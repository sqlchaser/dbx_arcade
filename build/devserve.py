#!/usr/bin/env python3
"""Local dev server for testing — stdlib only, mirrors the headers server.py
sets in production (COOP/COEP for SharedArrayBuffer + .jsdos mime). Not used in
the deployed app; that runs FastAPI via app.yaml.

Usage: python3 build/devserve.py [port]
"""
import os
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

ROOT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "app", "static")
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8731


class Handler(SimpleHTTPRequestHandler):
    extensions_map = {**SimpleHTTPRequestHandler.extensions_map, ".jsdos": "application/zip"}

    def __init__(self, *a, **k):
        super().__init__(*a, directory=ROOT, **k)

    def end_headers(self):
        self.send_header("Cross-Origin-Opener-Policy", "same-origin")
        self.send_header("Cross-Origin-Embedder-Policy", "credentialless")
        super().end_headers()

    def log_message(self, *a):
        pass


if __name__ == "__main__":
    print(f"DBX Arcade dev server on http://localhost:{PORT}  (root: {ROOT})")
    ThreadingHTTPServer(("0.0.0.0", PORT), Handler).serve_forever()
