"""A dependency-free Python server for Diem Thuy's birthday universe."""

from __future__ import annotations

import argparse
import os
import re
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parent
PUBLIC_FILES = {"index.html", "styles.css", "script.js", "planet-renderer.js", "favicon.svg"}
ASSET_TYPES = {".png", ".webp", ".jpg", ".svg", ".json", ".woff2", ".mp3"}


class BirthdayHandler(SimpleHTTPRequestHandler):
    """Serve public files only, never source code or repository metadata."""

    extensions_map = {**SimpleHTTPRequestHandler.extensions_map, ".mp3": "audio/mpeg"}

    def __init__(self, *args, **kwargs):
        self._audio_bytes_remaining = None
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def send_head(self):
        self._audio_bytes_remaining = None
        name = unquote(urlsplit(self.path).path).lstrip("/") or "index.html"
        # Reject Windows separators before validating the same URL path that
        # SimpleHTTPRequestHandler will translate. Never serve directory lists.
        if "\\" in name or name.endswith("/"):
            self.send_error(404, "Not found")
            return None
        target = (ROOT / name).resolve()
        allowed_asset = (
            name.startswith("assets/")
            and target.is_relative_to(ROOT / "assets")
            and target.suffix.lower() in ASSET_TYPES
        )
        if not target.is_relative_to(ROOT) or not (name in PUBLIC_FILES or allowed_asset):
            self.send_error(404, "Not found")
            return None
        if not target.is_file():
            self.send_error(404, "Not found")
            return None
        if target.suffix.lower() == ".mp3":
            return self._send_audio_head(target)
        return super().send_head()

    @staticmethod
    def _byte_range(value: str, size: int) -> tuple[int, int]:
        """Resolve a single byte range, including open-ended and suffix ranges."""
        match = re.fullmatch(r"bytes=(\d*)-(\d*)", value.strip())
        if not match or size == 0:
            raise ValueError("Invalid range")
        first, last = match.groups()
        if not first:
            if not last or int(last) == 0:
                raise ValueError("Invalid suffix range")
            return max(0, size - int(last)), size - 1
        start = int(first)
        end = int(last) if last else size - 1
        if start >= size or end < start:
            raise ValueError("Unsatisfiable range")
        return start, min(end, size - 1)

    def _send_audio_head(self, target: Path):
        """Stream the song with byte ranges for browser playback and seeking."""
        try:
            source = target.open("rb")
        except OSError:
            self.send_error(404, "Not found")
            return None
        stat = os.fstat(source.fileno())
        size = stat.st_size
        modified = self.date_time_string(stat.st_mtime)
        start, end = 0, size - 1
        status = 200
        request_range = self.headers.get("Range", "")
        # An unknown range unit can be ignored. If-Range only uses a range
        # when the client's Last-Modified validator still matches the song.
        if_range = self.headers.get("If-Range")
        if request_range.startswith("bytes=") and (if_range is None or if_range == modified):
            try:
                start, end = self._byte_range(request_range, size)
            except ValueError:
                source.close()
                self.send_response(416)
                self.send_header("Content-Range", f"bytes */{size}")
                self.send_header("Accept-Ranges", "bytes")
                self.send_header("Content-Length", "0")
                self.end_headers()
                return None
            status = 206
        length = max(0, end - start + 1)
        source.seek(start)
        self._audio_bytes_remaining = length
        self.send_response(status)
        self.send_header("Content-Type", "audio/mpeg")
        self.send_header("Content-Length", str(length))
        self.send_header("Accept-Ranges", "bytes")
        self.send_header("Last-Modified", modified)
        if status == 206:
            self.send_header("Content-Range", f"bytes {start}-{end}/{size}")
        self.end_headers()
        return source

    def copyfile(self, source, outputfile):
        if self._audio_bytes_remaining is None:
            return super().copyfile(source, outputfile)
        while self._audio_bytes_remaining:
            block = source.read(min(128 * 1024, self._audio_bytes_remaining))
            if not block:
                break
            outputfile.write(block)
            self._audio_bytes_remaining -= len(block)

    def end_headers(self):
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=8000)
    parser.add_argument("--generate", action="store_true", help="Recalculate the Python galaxy assets before serving")
    args = parser.parse_args()
    if args.generate or not (ROOT / "assets" / "galaxy.png").is_file():
        from generate_universe import main as generate

        generate([])
    if args.generate or not all((ROOT / "assets" / name).is_file() for name in ("planet.png", "orbits.json")):
        from generate_orbits import main as generate_orbits

        generate_orbits([])
    if args.generate or not (ROOT / "assets" / "planet-texture.png").is_file():
        from generate_planet_texture import main as generate_planet_texture

        generate_planet_texture([])
    server = ThreadingHTTPServer(("127.0.0.1", args.port), BirthdayHandler)
    print(f"Birthday universe: http://127.0.0.1:{args.port}", flush=True)
    print("Press Ctrl+C to stop.", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
