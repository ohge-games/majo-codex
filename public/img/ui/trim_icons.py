#!/usr/bin/env python3
"""
Trim transparent padding from UI icons so they sit flush in their frames.

By default it trims only the corner class icons (cclass_*.png), which is the
set that needs to reach the card corner. Pass --all to trim every png in the
folder, or list specific globs.

    python trim_icons.py                 # trims public/img/ui/cclass_*.png
    python trim_icons.py --all           # trims public/img/ui/*.png
    python trim_icons.py "public/img/ui/rarity_*.png"

Requires: pip install Pillow
Safe to re-run (already-tight images are left unchanged).
"""
import glob, sys, os
from PIL import Image

UI = "public/img/ui"

def targets(argv):
    if "--all" in argv:
        return glob.glob(f"{UI}/*.png")
    globs = [a for a in argv if not a.startswith("-")]
    if globs:
        out = []
        for g in globs:
            out += glob.glob(g)
        return out
    return glob.glob(f"{UI}/cclass_*.png")

def main():
    files = targets(sys.argv[1:])
    if not files:
        sys.exit(f"No matching PNGs (looked in {UI}/). Run from your repo root.")
    trimmed = 0
    for p in sorted(files):
        im = Image.open(p).convert("RGBA")
        bbox = im.getchannel("A").getbbox()   # bounds of non-transparent pixels
        if bbox and bbox != (0, 0, im.width, im.height):
            im.crop(bbox).save(p)
            print(f"  trimmed {os.path.basename(p)}  {im.size} -> {(bbox[2]-bbox[0], bbox[3]-bbox[1])}")
            trimmed += 1
        else:
            print(f"  ok      {os.path.basename(p)} (already tight)")
    print(f"\nDone. {trimmed} file(s) trimmed. Commit public/img/ui and push.")

if __name__ == "__main__":
    main()
