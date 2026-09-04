#!/usr/bin/env python3
"""Static dev server that refuses to be cached.

`python3 -m http.server` sends no cache directives, so browsers apply their own
heuristic caching and happily keep serving a stale .js after you have edited it
— even through a normal reload. For a game that is nothing but static JS, that
shows up as "I fixed it and nothing changed", which is a miserable way to lose
an hour. This sends no-store on everything instead.

    python3 serve.py [port] [directory]
"""
import http.server
import os
import socketserver
import sys

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 4791
DIRECTORY = sys.argv[2] if len(sys.argv) > 2 else "."


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    # SimpleHTTPRequestHandler answers If-Modified-Since with a 304; with
    # no-store that should not happen, but make certain of it.
    def send_response(self, code, message=None):
        super().send_response(200 if code == 304 else code, message)


socketserver.TCPServer.allow_reuse_address = True
with socketserver.TCPServer(("", PORT), NoCacheHandler) as httpd:
    print(f"serving {os.path.abspath(DIRECTORY)} on http://localhost:{PORT} (no-store)", flush=True)
    httpd.serve_forever()
