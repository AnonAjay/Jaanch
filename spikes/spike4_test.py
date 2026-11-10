#!/usr/bin/env python3
"""
Spike 4 Test: Validates Proxy /health and /budget response contracts, JSON payloads, and CORS headers.
Runs in-process to verify HTTP handler behavior deterministically without socket access issues in sandboxed environments.
"""

import io
import json
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from spike4_health_server import ProxyHealthHandler


class MockSocket:
    def __init__(self, request_bytes):
        self._rfile = io.BytesIO(request_bytes)
        self._wfile = io.BytesIO()

    def makefile(self, mode, *args, **kwargs):
        if "r" in mode:
            return self._rfile
        return self._wfile

    def sendall(self, data):
        self._wfile.write(data)


def simulate_request(method, path, headers=None):
    req_lines = [f"{method} {path} HTTP/1.1", "Host: 127.0.0.1"]
    if headers:
        for k, v in headers.items():
            req_lines.append(f"{k}: {v}")
    req_lines.append("\r\n")
    raw_req = "\r\n".join(req_lines).encode("utf-8")

    sock = MockSocket(raw_req)
    try:
        ProxyHealthHandler(sock, ("127.0.0.1", 12345), None)
    except Exception:
        pass

    raw_resp = sock._wfile.getvalue().decode("utf-8", errors="replace")
    parts = raw_resp.split("\r\n\r\n", 1)
    header_block = parts[0]
    body = parts[1] if len(parts) > 1 else ""

    headers_dict = {}
    lines = header_block.split("\r\n")
    status_line = lines[0]
    for line in lines[1:]:
        if ":" in line:
            k, v = line.split(":", 1)
            headers_dict[k.strip().lower()] = v.strip()

    return status_line, headers_dict, body


def main():
    print("[Spike 4 Evidence] Testing /health endpoint...")
    status, headers, body = simulate_request("GET", "/health")
    print(f" - Status: {status}")
    print(f" - CORS Header: {headers.get('access-control-allow-origin')}")
    print(f" - Body: {body}")

    assert "200" in status, f"Expected 200 OK, got {status}"
    assert headers.get("access-control-allow-origin") == "*", "Missing CORS allow-origin header"
    data = json.loads(body)
    assert data["ok"] is True
    assert data["service"] == "jaanch-proxy"

    print("\n[Spike 4 Evidence] Testing /budget endpoint...")
    status, headers, body = simulate_request("GET", "/budget")
    print(f" - Status: {status}")
    print(f" - Body: {body}")

    assert "200" in status
    budget_data = json.loads(body)
    assert budget_data["cap"] == 4500.0

    print("\n[Spike 4 Evidence] Testing CORS preflight OPTIONS /health...")
    status, headers, _ = simulate_request("OPTIONS", "/health")
    print(f" - Status: {status}")
    print(f" - Allow-Methods: {headers.get('access-control-allow-methods')}")
    assert "204" in status or "200" in status
    assert "GET" in headers.get("access-control-allow-methods", "")

    print("\n[Spike 4 Result]: PASS - Proxy endpoints /health and /budget return expected contracts with CORS enabled.")


if __name__ == "__main__":
    main()
