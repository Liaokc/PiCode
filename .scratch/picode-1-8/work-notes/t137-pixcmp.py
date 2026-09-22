"""Ticket 137 pixel comparison: app-rendered brain glyph vs ZCode reference.

Dual evidence (ticket-127 method): numeric (NCC + IoU after ink-bbox
alignment) and visual (side-by-side montage). Usage:

  python3 t137-pixcmp.py <app-frame.png> <zcode-ref-crop.png> <out-prefix>

The app frame is searched for the glyph with a rasterized template of the
new BrainIcon (lucide 9-path form, family stroke 1.7) at the app's render
scale (2x retina, box 16 logical = 32 native px); the best match location
is cropped, ink-bbox aligned to the ZCode reference crop, and compared.
"""
import sys
import numpy as np
import cv2
from PIL import Image
from raster import render, ink_bbox

LUCIDE_BRAIN = [
    "M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z",
    "M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z",
    "M15 13a4.5 4.5 0 0 1-3-4 4.5 4.5 0 0 1-3 4",
    "M17.599 6.5a3 3 0 0 0 .399-1.375",
    "M6.003 5.125A3 3 0 0 0 6.401 6.5",
    "M3.477 10.896a4 4 0 0 1 .585-.396",
    "M19.938 10.5a4 4 0 0 1 .585.396",
    "M6 18a4 4 0 0 1-1.967-.516",
    "M19.967 17.484A4 4 0 0 1 18 18",
]


def ncc(a, b):
    a = a.astype(float)
    b = b.astype(float)
    am, bm = a - a.mean(), b - b.mean()
    return float((am * bm).sum() / (np.sqrt((am ** 2).sum()) * np.sqrt((bm ** 2).sum()) + 1e-12))


def iou(a, b, ta=60, tb=30):
    return float(((a > ta) & (b > tb)).sum() / (((a > ta) | (b > tb)).sum() + 1e-12))


def make_template(box_px, stroke=1.7, ss=4):
    """Rasterize the BrainIcon as rendered by the app: box_px canvas px for
    the 24-unit viewBox, family stroke 1.7, centered."""
    scale = box_px / 24.0
    origin = (0.0, 0.0)
    img = render(LUCIDE_BRAIN, canvas=box_px, scale=scale, stroke=stroke,
                 origin=origin, ss=ss)
    return img


def find_glyph(frame_gray, box_px):
    """Locate the brain glyph in a frame; returns (x, y, score, tpl)."""
    best = None
    for shrink in (1.0,):
        tpl = make_template(box_px)
        # frame ink is dark-on-light or light-on-dark? try both polarities
        for polarity in ('dark', 'light'):
            f = frame_gray if polarity == 'dark' else 255 - frame_gray
            t = tpl if polarity == 'dark' else 255 - tpl
            res = cv2.matchTemplate(f.astype(np.float32), t.astype(np.float32),
                                    cv2.TM_CCOEFF_NORMED)
            _, mx, _, loc = cv2.minMaxLoc(res)
            if best is None or mx > best[0]:
                best = (mx, loc[0], loc[1], polarity, tpl)
    return best


def crop_glyph(frame_gray, x, y, tpl, pad=4):
    h, w = tpl.shape
    x0, y0 = max(0, x - pad), max(0, y - pad)
    x1, y1 = min(frame_gray.shape[1], x + w + pad), min(frame_gray.shape[0], y + h + pad)
    return frame_gray[y0:y1, x0:x1], (x0, y0)


def align_to_ref(crop_ink, ref_ink):
    """Scale/translate crop ink so its ink bbox matches the ref ink bbox."""
    rb = ink_bbox(ref_ink.astype(np.uint8), thresh=30)
    cb = ink_bbox(crop_ink.astype(np.uint8), thresh=30)
    if cb is None or rb is None:
        raise ValueError('empty ink')
    rw, rh = rb[1] - rb[0] + 1, rb[3] - rb[2] + 1
    cw, ch = cb[1] - cb[0] + 1, cb[3] - cb[2] + 1
    # scale crop so its ink height matches ref ink height
    s = rh / ch
    scaled = cv2.resize(crop_ink.astype(np.float32), None, fx=s, fy=s,
                        interpolation=cv2.INTER_CUBIC)
    cb2 = ink_bbox(scaled.astype(np.uint8), thresh=30)
    out = np.zeros_like(ref_ink, dtype=np.uint8)
    # translate: crop ink bbox top-left -> ref ink bbox top-left
    dy = cb2[2] - rb[2]
    dx = cb2[0] - rb[0]
    H, W = ref_ink.shape
    h2, w2 = scaled.shape
    # crop/fit scaled into out with offset (-dx, -dy)
    src_y0 = max(0, dy)
    src_x0 = max(0, dx)
    dst_y0 = max(0, -dy)
    dst_x0 = max(0, -dx)
    hh = min(h2 - src_y0, H - dst_y0)
    ww = min(w2 - src_x0, W - dst_x0)
    if hh > 0 and ww > 0:
        out[dst_y0:dst_y0 + hh, dst_x0:dst_x0 + ww] = scaled[src_y0:src_y0 + hh, src_x0:src_x0 + ww]
    return out


def main():
    frame_path, ref_path, out_prefix = sys.argv[1], sys.argv[2], sys.argv[3]
    frame = np.array(Image.open(frame_path).convert('L'))
    ref = 255 - np.array(Image.open(ref_path).convert('L')).astype(float)  # ink bright

    # find the glyph: try the expected 2x box (32 native px), then 1x (16)
    loc = None
    for box_px in (32, 16):
        score, x, y, polarity, tpl = find_glyph(frame, box_px)
        print(f'template box {box_px}px polarity {polarity}: match NCC {score:.4f} at ({x},{y})')
        if score > 0.5:
            loc = (score, x, y, polarity, tpl, box_px)
            break
    if loc is None:
        raise SystemExit('glyph not found in frame')
    score, x, y, polarity, tpl, box_px = loc
    crop, (cx0, cy0) = crop_glyph(frame, x, y, tpl)
    crop_ink = crop.astype(float)
    if polarity == 'light':
        crop_ink = 255 - crop_ink
    # save the raw crop for the record
    Image.fromarray(crop.astype(np.uint8)).save(out_prefix + '-app-crop.png')

    aligned = align_to_ref(crop_ink, ref)
    n = ncc(ref, aligned)
    io = iou(aligned, ref)
    print(f'ALIGNED NCC {n:.4f} IoU {io:.4f} (app crop {crop.shape}, ref {ref.shape})')

    # montage: app crop (scaled to ref ink size) | ref | overlay diff
    h, w = ref.shape
    app_disp = cv2.resize(crop_ink, (w, h), interpolation=cv2.INTER_CUBIC)
    montage = np.full((h, w * 3 + 8, 3), 255, dtype=np.uint8)
    def to_img(a):
        return np.clip(a, 0, 255).astype(np.uint8)
    montage[:, :w] = np.stack([to_img(app_disp)] * 3, axis=2)
    montage[:, w + 4:2 * w + 4] = np.stack([to_img(ref)] * 3, axis=2)
    # diff channel: red = app-only, blue = ref-only
    A = aligned > 60
    B = ref > 30
    diff = np.full((h, w, 3), 255, dtype=np.uint8)
    diff[A & B] = (128, 128, 128)
    diff[A & ~B] = (255, 0, 0)
    diff[B & ~A] = (0, 0, 255)
    montage[:, 2 * w + 8:] = diff
    Image.fromarray(montage).save(out_prefix + '-montage.png')
    print('saved', out_prefix + '-app-crop.png', 'and', out_prefix + '-montage.png')


if __name__ == '__main__':
    main()
