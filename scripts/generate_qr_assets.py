import os
import sys
from pathlib import Path
from urllib.parse import quote

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT.parent / "qr-tools"))

import qrcode
import qrcode.image.svg

output = ROOT / "public" / "qr"
output.mkdir(parents=True, exist_ok=True)
item_ids = sorted(path.stem for path in output.glob("HZ-*.svg"))
base_url = os.environ.get(
    "QR_BASE_URL",
    "https://hozai-qr-order.renbou12040.chatgpt.site",
).rstrip("/")

for item_id in item_ids:
    order_url = f"{base_url}/?item={quote(item_id, safe='')}"
    image = qrcode.make(
        order_url,
        image_factory=qrcode.image.svg.SvgPathImage,
        box_size=8,
        border=2,
    )
    image.save(output / f"{item_id}.svg")

print(f"Generated {len(item_ids)} QR assets in {output}")
