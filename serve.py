#!/usr/bin/env python3
"""Static dev server that refuses to be cached.

`python3 -m http.server` sends no cache directives, so browsers apply their own
heuristic caching and happily keep serving a stale .js after you have edited it
— even through a normal reload. For a game that is nothing but static JS, that
shows up as "I fixed it and nothing changed", which is a miserable way to lose
an hour.

Two defences, because no-store alone only helps loads that happen after it:
  1. Every response is sent no-store.
  2. index.html is rewritten on the fly to stamp each local script/stylesheet
     URL with that file's mtime (src/game.js?v=1757001234). When a file
     changes its URL changes, so the browser cannot serve an old copy even if
     it already has one cached under the bare URL.

    python3 serve.py [port] [directory]
"""
import http.server
import os
import re
import socketserver
import sys

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 4791
DIRECTORY = sys.argv[2] if len(sys.argv) > 2 else "."

ASSET_RE = re.compile(r'(src|href)="((?:src|vendor)/[^"?]+)"')


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    # Never answer with "not modified" — that is the stale path we are avoiding.
    def send_response(self, code, message=None):
        super().send_response(200 if code == 304 else code, message)

    def _stamped_index(self):
        with open(os.path.join(DIRECTORY, "index.html"), encoding="utf-8") as fh:
            html = fh.read()

        def stamp(match):
            attr, rel = match.group(1), match.group(2)
            try:
                version = int(os.path.getmtime(os.path.join(DIRECTORY, rel)))
            except OSError:
                return match.group(0)
            return f'{attr}="{rel}?v={version}"'

        return ASSET_RE.sub(stamp, html).encode("utf-8")

    def do_GET(self):
        if self.path.split("?")[0] in ("/", "/index.html"):
            try:
                body = self._stamped_index()
            except OSError:
                return super().do_GET()
            self.send_response(200)
            self.send_header("Content-type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        super().do_GET()


socketserver.TCPServer.allow_reuse_address = True
with socketserver.TCPServer(("", PORT), NoCacheHandler) as httpd:
    print(f"serving {os.path.abspath(DIRECTORY)} on http://localhost:{PORT} (no-store + mtime stamps)", flush=True)
    httpd.serve_forever()
