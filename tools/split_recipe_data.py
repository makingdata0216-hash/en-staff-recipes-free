#!/usr/bin/env python3
"""Split EN_DATA into JSON without changing any recipe values."""
import json
import re
from pathlib import Path

root = Path(__file__).resolve().parents[1]
html_file = root / "index.html"
json_file = root / "data" / "recipes.json"
source = html_file.read_text(encoding="utf-8")
if json_file.exists() and 'window.EN_DATA_READY' in source:
    print("NO-OP: recipe data already separated")
    raise SystemExit(0)

blocks = list(re.finditer(r'<script>(.*?)</script>', source, re.S))
if len(blocks) != 2:
    raise SystemExit(f"FAIL: expected two inline script blocks; found {len(blocks)}")
first, app = blocks
data_match = re.search(r'window\.EN_DATA\s*=\s*', first.group(1))
if data_match is None:
    raise SystemExit("FAIL: original EN_DATA assignment missing")
candidate = first.group(1)[data_match.end():]
decoder = json.JSONDecoder()
dataset, used = decoder.raw_decode(candidate.lstrip())
raw_json = candidate.lstrip()[:used]
if not isinstance(dataset, dict) or not isinstance(dataset.get("recipes"), list) or not isinstance(dataset.get("manuals"), list):
    raise SystemExit("FAIL: EN_DATA format unexpected")
if not re.fullmatch(r'\s*;?\s*', candidate.lstrip()[used:]):
    raise SystemExit("FAIL: unexpected JavaScript after EN_DATA assignment")
if 'window.EN_DATA' not in app.group(1) or 'const baseData = window.EN_DATA;' not in app.group(1):
    raise SystemExit("FAIL: app data reference missing")
if not re.search(r"^\s*/\*[\s\S]*?\*/\s*\(\(\) => \{\s*\x27use strict\x27;", app.group(1)):
    raise SystemExit("FAIL: unexpected app entrypoint")

loader = '''<script>
  // Static JSON on this site; no external API or usage-based service.
  window.EN_DATA_READY = fetch('./data/recipes.json')
    .then(response => {
      if (!response.ok) throw new Error('Recipe JSON HTTP ' + response.status);
      return response.json();
    })
    .then(data => { window.EN_DATA = data; })
    .catch(error => { console.error('Recipe data loading failed:', error); });
</script>'''

app_text = app.group(0)
app_text = app_text.replace("(() => {\n  'use strict';", "(async () => {\n  'use strict';\n  await window.EN_DATA_READY;", 1)
if "await window.EN_DATA_READY;" not in app_text:
    raise SystemExit("FAIL: async loader injection failed")
app_text = app_text.replace('data.js を確認してください。', 'data/recipes.json を確認してください。', 1)
updated = source[:first.start()] + loader + source[first.end():app.start()] + app_text + source[app.end():]
if "window.EN_DATA = {\"brand\"" in updated:
    raise SystemExit("FAIL: inline dataset still present")

# Verify JSON value-for-value and JS structure: only data loader/startup change.
if json.loads(raw_json) != dataset:
    raise SystemExit("FAIL: JSON values changed")
json_file.parent.mkdir(parents=True, exist_ok=True)
json_file.write_text(raw_json + "\n", encoding="utf-8")
html_file.write_text(updated, encoding="utf-8")
assert json.loads(json_file.read_text(encoding="utf-8")) == dataset
# Browser paths remain relative to index.html, not the JSON file's directory.
for recipe in dataset["recipes"]:
    for field in ("image", "imageThumb", "imageFull", "thumbnail", "thumb"):
        value = recipe.get(field)
        if isinstance(value, str) and value.startswith("assets/") and not (root / value).is_file():
            raise SystemExit(f"FAIL: missing asset {value}")
print(f"PASS: split {len(dataset['recipes'])} recipes + {len(dataset['manuals'])} manuals into data/recipes.json")
print(f"PASS: JSON values preserved and relative image paths verified")
print(f"PASS: index.html {len(source.encode('utf-8')):,} -> {len(updated.encode('utf-8')):,} bytes")
