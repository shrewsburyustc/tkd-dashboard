# D-roster-boards-cut.py - cuts D-roster-boards.png into pages at most 7500 px tall, cutting only through blank white rows
# (never through a picture), the same idea as the earlier pages in pages/. Run: python D-roster-boards-cut.py
from PIL import Image
import os
Image.MAX_IMAGE_PIXELS = None
here = os.path.dirname(os.path.abspath(__file__))
im = Image.open(os.path.join(here, 'D-roster-boards.png')).convert('RGB')
W, H = im.size
LIMIT = 7500
px = im.load()
def blank(y):
    # a row is blank when every 8th pixel is (near) white
    return all(min(px[x, y]) > 250 for x in range(0, W, 8))
def border(y):
    # a section's top line: a thin light-gray rule (E5E5E2) across the whole page width
    return all(abs(px[x, y][0] - 229) < 4 and abs(px[x, y][2] - 226) < 4 for x in (100, 400, W - 400, W - 100))
cuts = [0]
while H - cuts[-1] > LIMIT:
    y = cuts[-1] + LIMIT
    # cut just above the last section line that fits, so a section's heading stays with its pictures
    while y > cuts[-1] + 3000 and not border(y):
        y -= 1
    if y <= cuts[-1] + 3000:
        raise SystemExit('no section line found; cut by hand')
    cuts.append(y - 12)
cuts.append(H)
out = os.path.join(here, 'pages')
os.makedirs(out, exist_ok=True)
for i in range(len(cuts) - 1):
    page = im.crop((0, cuts[i], W, cuts[i + 1]))
    page.save(os.path.join(out, f'D-roster-boards-p{i + 1}.png'))
    print(f'p{i + 1}', page.size)
