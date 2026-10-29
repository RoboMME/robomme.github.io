"""Serve the static website locally, including byte ranges for video seeking."""

import argparse
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import re
from urllib.parse import unquote, urlsplit


class PreviewHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Accept-Ranges", "bytes")
        super().end_headers()

    def send_head(self):
        self.byte_range = None
        requested = self.headers.get("Range")
        path = Path(self.translate_path(self.path))
        if not requested or not path.is_file():
            return super().send_head()
        size = path.stat().st_size
        match = re.fullmatch(r"bytes=(\d*)-(\d*)", requested)
        if not match or not any(match.groups()):
            self.send_error(400, "Invalid byte range")
            return None
        first, last = match.groups()
        start = int(first) if first else max(0, size - int(last))
        end = min(int(last), size - 1) if first and last else size - 1
        if start > end or start >= size:
            self.send_response(416)
            self.send_header("Content-Range", f"bytes */{size}")
            self.send_header("Content-Length", "0")
            self.end_headers()
            return None
        stream = path.open("rb")
        stream.seek(start)
        self.byte_range = (start, end)
        self.send_response(206)
        self.send_header("Content-Type", self.guess_type(str(path)))
        self.send_header("Content-Range", f"bytes {start}-{end}/{size}")
        self.send_header("Content-Length", str(end - start + 1))
        self.send_header("Last-Modified", self.date_time_string(path.stat().st_mtime))
        self.end_headers()
        return stream

    def copyfile(self, source, outputfile):
        try:
            if self.byte_range is None:
                return super().copyfile(source, outputfile)
            remaining = self.byte_range[1] - self.byte_range[0] + 1
            while remaining:
                block = source.read(min(64 * 1024, remaining))
                if not block:
                    break
                outputfile.write(block)
                remaining -= len(block)
        except (BrokenPipeError, ConnectionResetError):
            pass  # Browsers cancel pending downloads when a sample changes.


class PublicPlusHandler(PreviewHandler):
    """Expose website assets, without repository files or directory listings."""

    def send_head(self):
        requested = unquote(urlsplit(self.path).path)
        if requested == "/":
            self.path = "/plus.html"
            requested = self.path
        parts = Path(requested).parts[1:]
        pages = {"index.html", "plus.html", "ood.html", "leaderboard.html", "challenge.html",
                 "main.css", "plus.css", "plus.js", "leaderboard.css"}
        asset_dirs = {"data", "docs", "image", "video"}
        allowed = (len(parts) == 1 and parts[0] in pages
                   or len(parts) > 1 and parts[0] in asset_dirs)
        path = Path(self.translate_path(self.path)).resolve()
        if (not allowed or any(part.startswith(".") for part in parts)
                or not path.is_relative_to(Path(self.directory).resolve())
                or not path.is_file()):
            self.send_error(404, "Not found")
            return None
        return super().send_head()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=8851)
    parser.add_argument("--bind", default="0.0.0.0")
    parser.add_argument("--public-plus", "--public-ood", dest="public_plus", action="store_true",
                        help="Open on RoboMME-Plus and serve only public website files")
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[1]
    handler = PublicPlusHandler if args.public_plus else PreviewHandler
    server = ThreadingHTTPServer((args.bind, args.port), partial(handler, directory=str(root)))
    print(f"Preview: http://localhost:{args.port}/plus.html", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
