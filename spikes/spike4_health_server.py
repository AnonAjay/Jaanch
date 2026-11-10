#!/usr/bin/env python3
"""
Spike 4: Lightweight Standalone Health & CORS Server
Uses Python standard library to provide the /health and /budget endpoints for testing.
"""

import json
from http.server import HTTPServer, BaseHTTPRequestHandler
import sys

PORT = 8000


class ProxyHealthHandler(BaseHTTPRequestHandler):
    def _send_cors_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, X-API-Key-ID")

    def do_OPTIONS(self):
        self.send_response(204)
        self._send_cors_headers()
        self.end_headers()

    def do_GET(self):
        if self.path == "/health":
            payload = {
                "ok": True,
                "service": "jaanch-proxy",
                "mode": "sample",
                "version": "0.1.0"
            }
            body = json.dumps(payload).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self._send_cors_headers()
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        elif self.path == "/budget":
            payload = {
                "used": 0.0,
                "cap": 4500.0,
                "mode": "sample",
                "remaining": 4500.0
            }
            body = json.dumps(payload).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self._send_cors_headers()
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        else:
            self.send_response(404)
            self.end_headers()

    def log_message(self, format, *args):
        # Clean logging
        sys.stdout.write(f"[Proxy Spike Server] {args[0]} - {args[1]}\n")
        sys.stdout.flush()


def run(port=PORT):
    server_address = ("127.0.0.1", port)
    httpd = HTTPServer(server_address, ProxyHealthHandler)
    print(f"[Proxy Spike Server] Running on http://127.0.0.1:{port}/health ...", flush=True)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        httpd.server_close()


if __name__ == "__main__":
    p = int(sys.argv[1]) if len(sys.argv) > 1 else PORT
    run(p)
