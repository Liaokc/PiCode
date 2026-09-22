#!/usr/bin/env python3
"""Ticket 135 dual-evidence pixel comparison (PIL + numpy).

The SAME measurement primitives run against both frames:
  - card_edges(img, y): the card's border-box left/right (border pixels are
    darker than both 3px-away neighbors) at a given row
  - junction(img, q_bot, c_top): rows between the queue card's bottom and
    the composer's top at the shared column -> gap + the stacked-border line
  - corner_radius(img, card_top, card_left): rows until the rounded corner
    reaches the straight edge
PiCode frame: the visual-harness 5-approval-queue capture (1440x900 @1x,
two queue rows in the ticket-135 position above the composer).
ZCode frame: z19-zcode-queue-above-composer.png (2422x670 @2x; numbers
reported in css px = device / 2).
"""
import numpy as np
from PIL import Image

PICODE = '.scratch/visual/5-approval-queue.png'
# The z19 reference frame: repo-relative first (ticket 137 landed it at
# .scratch/picode-1-8/reference/ on main), falling back to the root
# worktree copy that the archived run actually read.
import os
ZCODE = (
    '.scratch/picode-1-8/reference/z19-zcode-queue-above-composer.png'
    if os.path.exists('.scratch/picode-1-8/reference/z19-zcode-queue-above-composer.png')
    else '/Users/liaokechen/PiCode/.scratch/picode-1-8/reference/z19-zcode-queue-above-composer.png'
)


def card_edges(img, y):
    w = img.shape[1]
    row = img[y]
    cx = w // 2
    left = right = None
    for x in range(2, cx):
        if (int(row[x][0]) < int(row[x - 3][0]) - 8) and (int(row[x][0]) < int(row[x + 3][0]) - 8):
            left = x
    for x in range(w - 3, cx, -1):
        if (int(row[x][0]) < int(row[x - 3][0]) - 8) and (int(row[x][0]) < int(row[x + 3][0]) - 8):
            right = x
    return left, right


def corner_radius(img, top, left):
    """Rows from the card top until the corner curve reaches the straight edge."""
    bg = img[top - 6, left - 10]
    for dy in range(0, 40):
        y = top + dy
        row = img[y]
        for x in range(max(0, left - 26), left + 2):
            if (abs(int(row[x][0]) - int(bg[0])) > 6) or (abs(int(row[x][1]) - int(bg[1])) > 6):
                if x >= left - 1:
                    return dy
                break
    return None


def report(name, img, scale, q_top, q_bot, c_top, c_bot, tint_xy):
    q_mid = (q_top + q_bot) // 2
    c_mid = (c_top + c_bot) // 2
    ql, qr = card_edges(img, q_mid)
    cl, cr = card_edges(img, c_mid)
    tint = tuple(int(v) for v in img[tint_xy[1], tint_xy[0]])
    r = corner_radius(img, q_top, ql)
    gap = c_top - q_bot
    # the junction's darkest row (the stacked borders) sampled mid-column
    jband = img[q_bot - 2: c_top + 2, ql + 60: qr - 60]
    jdark = int(jband.sum(axis=2).min()) // 3 if jband.size else None
    out = {
        'frame': f'{img.shape[1]}x{img.shape[0]} @1/{scale}x',
        'queue_card_y_css': (q_top / scale, q_bot / scale),
        'queue_card_x_css': (ql / scale, qr / scale),
        'composer_card_y_css': (c_top / scale, c_bot / scale),
        'composer_card_x_css': (cl / scale, cr / scale),
        'column_delta_css': (abs(ql - cl) / scale, abs(qr - cr) / scale),
        'junction_gap_css': gap / scale,
        'junction_darkest_rgb_avg': jdark,
        'queue_tint_rgb': tint,
        'queue_corner_radius_css': (r / scale) if r is not None else None,
    }
    print(f'== {name} ==')
    for k, v in out.items():
        print(f'  {k}: {v}')
    return out


p = np.asarray(Image.open(PICODE).convert('RGB')).astype(int)
# PiCode @1x: queue card rows 661..744 (top border .. bottom border+1),
# composer 744..883; tint sampled in the card's top padding band.
picode = report('PiCode ticket-135 position (visual 5-approval-queue)', p, 1, 661, 744, 744, 883, (520, 668))

z = np.asarray(Image.open(ZCODE).convert('RGB')).astype(int)
# ZCode @2x: queue band 258..418 device rows, composer 419..629; tint
# sampled clear of row text in the band's left area.
zcode = report('ZCode reference (z19)', z, 2, 258, 418, 419, 629, (130, 270))

print('== structural verdict (PiCode vs ZCode) ==')
print('  column alignment :', picode['column_delta_css'], 'vs', zcode['column_delta_css'])
print('  junction gap     :', picode['junction_gap_css'], 'vs', zcode['junction_gap_css'])
print('  tint             :', picode['queue_tint_rgb'], 'vs', zcode['queue_tint_rgb'])
print('  corner radius    :', picode['queue_corner_radius_css'], 'vs', zcode['queue_corner_radius_css'])
