#!/usr/bin/env python3
"""Deterministic stand-in for the OpenWeather API used by the e2e stack.

Usage: fake-openweather.py <port>

Serves /data/2.5/weather (current conditions) and /geo/1.0/direct (city
search) with fixed, valid payloads, so the backend's gateway, validation and
caching run exactly as in production without a real API key.
"""
import json
import sys
import urllib.parse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def do_GET(self):
        url = urllib.parse.urlparse(self.path)
        query = urllib.parse.parse_qs(url.query)
        if url.path.startswith("/geo/"):
            name = query.get("q", [""])[0].split(",")[0].title()
            body = [{"name": name, "country": "RO", "lat": 44.43, "lon": 26.1}]
        elif url.path.startswith("/data/"):
            body = {
                "name": "Fakeville",
                "sys": {"country": "RO"},
                "main": {"temp": 21.5, "feels_like": 21.0, "pressure": 1012, "humidity": 55},
                "wind": {"speed": 4.2, "deg": 270},
                "weather": [{"id": 800, "description": "clear sky"}],
            }
        else:
            self.send_error(404)
            return
        data = json.dumps(body).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def log_message(self, *args):
        pass


if __name__ == "__main__":
    ThreadingHTTPServer(("127.0.0.1", int(sys.argv[1])), Handler).serve_forever()
