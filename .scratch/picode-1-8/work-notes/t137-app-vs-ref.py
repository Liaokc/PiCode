"""Ticket 137 final pixel evidence: app-rendered brain vs ZCode reference.

Both app surfaces (ThinkingRow header icon, composer thinking-chip icon)
are compared against the two ZCode reference crops extracted from the
operator's z19 frames (header zoom + selector zoom). Dual evidence:
numeric (NCC + IoU after ink-bbox alignment + scale normalization) and
visual (side-by-side montage saved next to the frames).

Frames are 1x (1440x900): the app brain renders in a 16px box (ink ~15px);
the ZCode reference crops are 2x-native (ink ~28px for a 14px icon), so the
app crop is upscaled to the reference ink box for the comparison (and the
reference is also downscaled to the app box for a same-scale check).
"""
import numpy as np
from PIL import Image

VIS = '/Users/liaokechen/PiCode/.worktrees/wt-137-brain-icon/.scratch/visual'
NOTES = '/Users/liaokechen/PiCode/.scratch/picode-1-8/work-notes'

APP_TH1 = (447, 255, 469, 275)    # th1 ThinkingRow brain (x0,y0,x1,y1)
APP_MG4 = (1024, 606, 1048, 628)  # mg4 thinking-chip brain (match at 1026,608)


def ink_crop(img_gray, box=None, thresh=245):
    """Crop to the ink bounding box (any pixel below thresh = ink)."""
    g = img_gray if box is None else img_gray[box[1]:box[3], box[0]:box[2]]
    ink = g < thresh
    ys, xs = np.where(ink)
    x0, x1, y0, y1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
    return g[y0:y1, x0:x1]


def ncc(a, b):
    a = a.astype(float) - np.asarray(a, float).mean()
    b = b.astype(float) - np.asarray(b, float).mean()
    return float((a * b).sum() / (np.sqrt((a ** 2).sum() * (b ** 2).sum()) + 1e-12))


def iou(a, b, ta=215, tb=215):
    am, bm = a < ta, b < tb
    return float((am & bm).sum() / ((am | bm).sum() + 1e-12))


def compare(app_crop, ref_crop, label):
    """Scale-align ink boxes both ways; report NCC + IoU."""
    ah, aw = app_crop.shape
    rh, rw = ref_crop.shape
    out = {}
    # app -> ref scale (upscale app ink to ref ink box)
    up = np.array(Image.fromarray(app_crop).resize((rw, rh), Image.BICUBIC))
    out['up_ncc'] = ncc(up, ref_crop)
    out['up_iou'] = iou(up, ref_crop)
    # ref -> app scale (downscale ref ink to app ink box)
    dn = np.array(Image.fromarray(ref_crop).resize((aw, ah), Image.BICUBIC))
    out['dn_ncc'] = ncc(dn, app_crop)
    out['dn_iou'] = iou(dn, app_crop)
    print(f'{label}: app ink {aw}x{ah}, ref ink {rw}x{rh} | '
          f'app->ref NCC {out["up_ncc"]:.4f} IoU {out["up_iou"]:.4f} | '
          f'ref->app NCC {out["dn_ncc"]:.4f} IoU {out["dn_iou"]:.4f}')
    return out


def montage(pairs, out_path, cell=112):
    """Vertical list of [app | ref] rows, ink-normalized, 4x zoom."""
    rows = []
    for app, ref, label in pairs:
        a = 255 - app.astype(float)   # ink-positive
        r = 255 - ref.astype(float)
        def norm(m):
            m = m / (m.max() + 1e-9)
            im = Image.fromarray((m * 255).astype(np.uint8))
            return im.resize((cell, cell), Image.BICUBIC)
        row = Image.new('L', (cell * 2 + 12, cell), 255)
        row.paste(norm(a), (0, 0))
        row.paste(norm(r), (cell + 12, 0))
        rows.append((row, label))
    H = cell * len(rows)
    canvas = Image.new('L', (cell * 2 + 12, H), 255)
    for i, (row, _) in enumerate(rows):
        canvas.paste(row, (0, i * cell))
    canvas.save(out_path)
    print('montage ->', out_path)


def main():
    th1 = np.array(Image.open(f'{VIS}/th1-thinking-collapsed.png').convert('L'))
    mg4 = np.array(Image.open(f'{VIS}/mg4-thinking-brain.png').convert('L'))
    ref_h = np.array(Image.open('/tmp/t137/ref-header-glyph.png').convert('L'))
    ref_s = np.array(Image.open('/tmp/t137/ref-selector-glyph.png').convert('L'))

    app_th1 = ink_crop(th1, APP_TH1)
    app_mg4 = ink_crop(mg4, APP_MG4)
    ref_h_ink = ink_crop(ref_h)
    ref_s_ink = ink_crop(ref_s)

    # app-vs-app sanity: the two app surfaces must be identical glyphs
    print(f'app th1 vs app mg4 (raw, no scale): NCC {ncc(app_th1, app_mg4):.4f}'
          f' (shapes {app_th1.shape} vs {app_mg4.shape})')

    r1 = compare(app_th1, ref_h_ink, 'th1 ThinkingRow brain vs ZCode header ref ')
    r2 = compare(app_mg4, ref_h_ink, 'mg4 chip brain        vs ZCode header ref ')
    r3 = compare(app_th1, ref_s_ink, 'th1 ThinkingRow brain vs ZCode selector ref')
    r4 = compare(app_mg4, ref_s_ink, 'mg4 chip brain        vs ZCode selector ref')

    montage([
        (app_th1, ref_h_ink, 'th1 | header-ref'),
        (app_mg4, ref_s_ink, 'mg4 | selector-ref'),
    ], f'{NOTES}/t137-app-vs-ref-montage.png')
    montage([
        (app_th1, ref_h_ink, 'th1 | header-ref'),
        (app_mg4, ref_s_ink, 'mg4 | selector-ref'),
    ], f'{VIS}/t137-app-vs-ref-montage.png')


if __name__ == '__main__':
    main()
