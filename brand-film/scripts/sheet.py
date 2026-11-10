# Contact sheet of rendered stills: python3 scripts/sheet.py out.png 10 45 ...
import sys
from PIL import Image, ImageDraw
out, ns = sys.argv[1], [int(x) for x in sys.argv[2:]]
ims = [Image.open(f'output/stills/frame_{n:04d}.png').convert('RGB') for n in ns]
w, h = ims[0].size
cols = 3
rows = (len(ims) + cols - 1) // cols
sheet = Image.new('RGB', (w * cols, h * rows))
for i, (n, im) in enumerate(zip(ns, ims)):
    d = ImageDraw.Draw(im)
    d.text((8, 6), f'{n}  {n/30:.2f}s', fill=(255, 210, 0))
    sheet.paste(im, ((i % cols) * w, (i // cols) * h))
sheet.save(out)
