#!/usr/bin/env python3
"""Split inline CSS and JS verbatim; never modify recipe content."""
import re
from pathlib import Path

root = Path(__file__).resolve().parents[1]
index = root / "index.html"
css_file = root / "assets" / "css" / "style.css"
loader_file = root / "assets" / "js" / "data-loader.js"
app_file = root / "assets" / "js" / "app.js"
original = index.read_text(encoding="utf-8")
if all(p.is_file() for p in (css_file, loader_file, app_file)):
    if '<link rel="stylesheet" href="./assets/css/style.css">' in original:
        print("NO-OP: CSS and JS already separated")
        raise SystemExit(0)
styles = list(re.finditer(r"<style>([\s\S]*?)</style>", original))
scripts = list(re.finditer(r"<script>([\s\S]*?)</script>", original))
if len(styles) != 1 or len(scripts) != 2:
    raise SystemExit(f"FAIL: unexpected CSS / JS count: {len(styles)} / {len(scripts)}")
style, loader, app = styles[0], scripts[0], scripts[1]
css, loader_js, app_js = style.group(1), loader.group(1), app.group(1)
if "window.EN_DATA_READY = fetch('./data/recipes.json')" not in loader_js:
    raise SystemExit("FAIL: data loader differs")
if "await window.EN_DATA_READY;" not in app_js or "refresh();" not in app_js:
    raise SystemExit("FAIL: application entrypoint differs")
if re.search(r"@import|url\s*\(", css, re.I):
    raise SystemExit("FAIL: CSS contains relative URLs; requires manual review")
if "document.currentScript" in loader_js + app_js:
    raise SystemExit("FAIL: JS contains currentScript dependency")
substitutions = (
    (style, '<link rel="stylesheet" href="./assets/css/style.css">'),
    (loader, '<script src="./assets/js/data-loader.js"></script>'),
    (app, '<script src="./assets/js/app.js"></script>'),
)
updated = original
for match, target in sorted(substitutions, key=lambda pair: pair[0].start(), reverse=True):
    updated = updated[:match.start()] + target + updated[match.end():]
restored = updated
for match, target in substitutions:
    if restored.count(target) != 1:
        raise SystemExit("FAIL: missing/duplicate replacement tag")
    restored = restored.replace(target, match.group(0), 1)
if restored != original:
    raise SystemExit("FAIL: HTML roundtrip is not byte-for-byte identical")
for path, payload in ((css_file, css), (loader_file, loader_js), (app_file, app_js)):
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists() and path.read_text(encoding="utf-8") != payload:
        raise SystemExit(f"FAIL: conflicting file {path.relative_to(root)}")
    path.write_text(payload, encoding="utf-8")
index.write_text(updated, encoding="utf-8")
for path, payload in ((css_file, css), (loader_file, loader_js), (app_file, app_js)):
    if path.read_text(encoding="utf-8") != payload:
        raise SystemExit(f"FAIL: extracted file mismatch: {path}")
print("PASS: CSS + 2 JavaScript blocks extracted without modifications")
print(f"PASS: HTML roundtrip verified, {len(original.encode('utf-8')):,} -> {len(updated.encode('utf-8')):,} bytes")
print("PASS: script ordering maintained; JSON loading preserved")
