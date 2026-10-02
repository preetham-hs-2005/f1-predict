"""Generate the social preview image with the site's existing colors."""

from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "public" / "og-cover.png"
WIDTH, HEIGHT = 1200, 630

image = Image.new("RGB", (WIDTH, HEIGHT), "#111317")
draw = ImageDraw.Draw(image)
green = "#9cf33b"
white = "#f3f5f7"
muted = "#a5abb2"

font_dir = Path("C:/Windows/Fonts")
bold = font_dir / "arialbd.ttf"
regular = font_dir / "arial.ttf"
title_font = ImageFont.truetype(str(bold), 76)
subtitle_font = ImageFont.truetype(str(regular), 28)
brand_font = ImageFont.truetype(str(bold), 25)
small_font = ImageFont.truetype(str(regular), 22)

draw.rectangle((0, 0, WIDTH, 14), fill=green)
draw.rectangle((66, 74, 140, 148), fill=green)
draw.text((79, 91), "F1", font=brand_font, fill="#111317")
draw.text((160, 82), "F1 PREDICTOR PRO", font=brand_font, fill=white)
draw.text((68, 220), "PREDICT.", font=title_font, fill=white)
draw.text((68, 313), "COMPETE.", font=title_font, fill=green)
draw.text((68, 406), "FOLLOW THE GRID.", font=title_font, fill=white)
draw.text((70, 526), "Race predictions  •  Standings  •  Analysis", font=subtitle_font, fill=muted)
draw.line((68, 594, 1132, 594), fill="#383d43", width=2)
draw.text((70, 603), "f1predict.dev", font=small_font, fill=muted)

OUT.parent.mkdir(parents=True, exist_ok=True)
image.save(OUT, optimize=True)
print(OUT)
