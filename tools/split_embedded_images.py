#!/usr/bin/env python3
"""Extract inlined WebP images losslessly. Run only on the safe split branch."""
from __future__ import annotations

import base64
import hashlib
import re
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
HTML = ROOT / "index.html"
OUT = ROOT / "assets" / "embedded"
PATTERN = re.compile(rb"data:image/(webp|png|jpeg);base64,([A-Za-z0-9+/=]+)")
original = HTML.read_bytes()
matches = list(PATTERN.finditer(original))
if not matches:
    if b"assets/embedded/" in original:
        print("NO-OP: images already separated")
        raise SystemExit(0)
    raise SystemExit("FAIL: no embedded image data detected")
if len(matches) != 120 or any(m.group(1) != b"webp" for m in matches):
    raise SystemExit(f"FAIL: unexpected input: {len(matches)} embedded images")

images: dict[str, bytes] = {}
def replace(match: re.Match[bytes]) -> bytes:
    raw = base64.b64decode(match.group(2), validate=True)
    if not (raw.startswith(b"RIFF") and raw[8:12] == b"WEBP"):
        raise ValueError("Invalid WebP image data")
    name = "embedded-" + hashlib.sha256(raw).hexdigest()[:24] + ".webp"
    if name in images and images[name] != raw:
        raise ValueError("Hash collision")
    images[name] = raw
    return ("assets/embedded/" + name).encode("ascii")

modified = PATTERN.sub(replace, original)
if len(images) != 118 or PATTERN.search(modified):
    raise SystemExit(f"FAIL: extracted {len(images)} unique files; expected 118")
if b"window.EN_DATA" not in modified:
    raise SystemExit("FAIL: expected recipe dataset missing")

OUT.mkdir(parents=True, exist_ok=True)
for name, raw in images.items():
    path = OUT / name
    if path.exists() and path.read_bytes() != raw:
        raise SystemExit(f"FAIL: existing asset differs: {name}")
    if not path.exists():
        path.write_bytes(raw)
    if path.read_bytes() != raw:
        raise SystemExit(f"FAIL: asset verification failed: {name}")

# Validate exact reversibility of URL substitutions; no other HTML bytes may change.
original_urls = [m.group(0) for m in matches]
idx = iter(original_urls)
reverse_pattern = re.compile(rb"assets/embedded/embedded-[a-f0-9]{24}\.webp")
restored = reverse_pattern.sub(lambda m: next(idx), modified)
if restored != original:
    raise SystemExit("FAIL: unexpected changes outside embedded image URLs")
HTML.write_bytes(modified)
print(f"PASS: {len(matches)} inline WebP references -> {len(images)} lossless image files")
print(f"PASS: original HTML {len(original):,} bytes -> {len(modified):,} bytes")
print(f"PASS: {len(matches)-len(images)} duplicate image occurrences deduplicated")
print("PASS: byte-for-byte HTML reversibility and file contents verified")
