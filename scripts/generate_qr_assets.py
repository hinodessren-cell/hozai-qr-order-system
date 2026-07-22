import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "work" / "legacy-source"))

import qrcode
import qrcode.image.svg

items = json.loads((ROOT / "work" / "legacy-source" / "items.json").read_text(encoding="utf-8"))
output = ROOT / "public" / "qr"
output.mkdir(parents=True, exist_ok=True)

for item in items:
    item_id = str(item.get("qr_key") or item.get("id"))
    image = qrcode.make(
        item_id,
        image_factory=qrcode.image.svg.SvgPathImage,
        box_size=8,
        border=2,
    )
    image.save(output / f"{item_id}.svg")

print(f"Generated {len(items)} QR assets in {output}")
