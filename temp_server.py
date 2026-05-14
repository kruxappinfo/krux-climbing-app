import http.server
import socketserver
import os
import sys

PORT = 8000
DIRECTORY = "/Users/jaimelillo/Downloads/APP/00_APP1"

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

print(f"🚀 Iniciando servidor local en http://localhost:{PORT}")
print(f"📁 Directorio: {DIRECTORY}")

try:
    with socketserver.TCPServer(("", PORT), Handler) as httpd:
        httpd.serve_forever()
except Exception as e:
    print(f"Error: {e}")
    sys.exit(1)
