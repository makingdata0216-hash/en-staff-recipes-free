#!/usr/bin/env python3
"""Read-only inspection of embedded images in index.html."""
import base64
import hashlib
import re
from collections import Counter
from pathlib import Path

path = Path(__file__).resolve().parents[1] / "index.html"
html = path.read_bytes()
pattern = rb"data:image/(webp|png|jpeg);base64,([A-Za-z0-9+/=]+)"
hashes = []
total = 0
formats = Counter()
for match in re.finditer(pattern, html):
    decoded = base64.b64decode(match.group(2), validate=True)
    hashes.append(hashlib.sha256(decoded).hexdigest())
    total += len(decoded)
    formats[match.group(1).decode("ascii")] += 1
print(f"HTML: {len(html):,} bytes")
print(f"Embedded images: {len(hashes)}; formats: {dict(formats)}")
print(f"Image data: {total:,} bytes")
print(f"Repeated occurrences: {len(hashes) - len(set(hashes))}")
print(f"window.EN_DATA present: {b'window.EN_DATA' in html}")
if not hashes:
    raise SystemExit("FAIL: No embedded image data found")
print("PASS: read-only image inspection completed")
