# -*- coding: utf-8 -*-
"""Generate docs/og-image.png — the 1200x630 card shown when the site is shared.

    python tools/make-og-image.py

This is a PLACEHOLDER built from the brand colour and the wordmark. It exists because the
alternative was worse: no og:image at all means every link shared on WhatsApp, LinkedIn and
Slack previews as a bare text row, and those three are where a B2B link actually travels.

To replace it with real artwork: drop your own 1200x630 PNG at docs/og-image.png and delete
this script's output step — the prerender picks up whatever file is there. Keep the dimensions;
1200x630 is the size every major platform crops to, and anything else gets cropped unpredictably.

Uses Pillow, which was already installed. No new dependency.
"""
import os
from PIL import Image, ImageDraw, ImageFont

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'docs', 'og-image.png')
W, H = 1200, 630
BRAND = (0x12, 0x3A, 0x2C)      # #123A2C — the brand green, matching the theme-color meta tag
IVORY = (0xF2, 0xEB, 0xDC)
GREEN = (0x59, 0xBB, 0x84)
MUTED = (0x9A, 0xB4, 0xA6)


def font(size, bold=False):
    """Prefer a real UI font; fall back rather than crash on a machine that lacks it."""
    for name in (['seguisb.ttf', 'segoeuib.ttf', 'arialbd.ttf'] if bold
                 else ['segoeui.ttf', 'arial.ttf']):
        for base in ('C:/Windows/Fonts/', '/usr/share/fonts/truetype/dejavu/', ''):
            try:
                return ImageFont.truetype(base + name, size)
            except Exception:
                continue
    return ImageFont.load_default()


img = Image.new('RGB', (W, H), BRAND)
d = ImageDraw.Draw(img)

# A single diagonal accent, echoing the faceted monogram, kept subtle so the text stays first.
d.polygon([(W, 0), (W, H), (W - 300, H)], fill=(0x18, 0x47, 0x36))
d.polygon([(W, 0), (W - 190, 0), (W, 250)], fill=(0x16, 0x42, 0x32))

# Rule above the wordmark — the brass/green seam used across the site.
d.rectangle([80, 214, 80 + 92, 214 + 5], fill=GREEN)

d.text((80, 250), 'ALSAITI GROWTH', font=font(70, bold=True), fill=IVORY)
d.text((80, 348), 'AI receptionists that answer every call', font=font(37), fill=IVORY)
d.text((80, 400), 'and turn enquiries into booked clients.', font=font(37), fill=IVORY)

# The differentiator, stated plainly.
#
# Deliberately NOT written in Arabic script. Pillow only shapes complex text when it is built
# with raqm/HarfBuzz, and this install is not:
#     PIL.features.check('raqm') -> False
# Without it, Arabic renders as isolated, unjoined letters in logical rather than visual order —
# legible to nobody who reads Arabic. Shipping that on the very card that advertises Arabic
# support is worse than not naming the language in its own script at all.
#
# To use native names (العربية) instead, this needs `arabic-reshaper` and `python-bidi`, or a
# Pillow built with raqm. Both are small and pure-Python. Not added here because new
# dependencies get asked about first — say the word and it is a five-minute change.
d.text((80, 492), 'English  ·  Español  ·  Arabic', font=font(31), fill=GREEN)
d.text((80, 546), 'alsaitigrowth.com', font=font(26), fill=MUTED)

img.save(OUT, 'PNG', optimize=True)
print('wrote %s  (%dx%d, %d KB)' % (
    os.path.relpath(OUT).replace('\\', '/'), W, H, os.path.getsize(OUT) // 1024))
