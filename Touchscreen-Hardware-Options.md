# Family Hub — Wall Touchscreen Hardware Options

Researched July 2026. Goal: run the Family Hub PWA fullscreen on a ~20" wall-mounted touchscreen, cheaply, with no subscription.

## Size reality check

True 20" panels are rare. The cheap, high-volume sizes are **21.5"** and **23.8"** — both bigger than 20" and usually *cheaper* than an odd 20". Target those.

## The baseline you're beating

| Product | Price |
|---|---|
| Skylight Calendar Max 27" | $629.99 (Best Buy) |
| Skylight Plus subscription | $79/year |

So: anything under ~$300 one-time with your own app is a clear win.

---

## Option 1 — Used business touch all-in-one (best value)

Ex-office Windows AIOs with touch panels flood the used market.

- **HP EliteOne 800 G3 23.8" touch** — ~$180–375 on eBay depending on spec (one current listing: i5/8GB/256GB SSD at $374.66 + $62 shipping; barer configs go far lower)
- **Dell OptiPlex 7440 / 7450 AIO 23.8" touch** — similar range
- Older **EliteOne 800 G1/G2 23"** — often $130–200

**Total cost: ~$150–250** if you shop patiently (filter "touch" + "for parts/no OS" is fine — you're reinstalling anyway).

Pros: one power cable, complete unit, capacitive/optical touch, real speakers, VESA-mountable with the adapter kit, trivial kiosk setup.
Cons: has a fan (audible in a quiet kitchen), 25–45W idle, thick and office-looking, webcam/mic you may want to tape.

**OS:** don't run Windows 10 (support ended Oct 2025). Install **ChromeOS Flex** (free, touch-aware, has a real kiosk mode) or Debian/Ubuntu + `chromium --kiosk https://your-app-url`.

---

## Option 2 — Purpose-built Android wall panel (cleanest install)

Commercial 21.5" Android signage tablets — designed for 24/7 wall duty, no battery to swell.

- **Raypodo 21.5" RK3568, Android 11, 2GB/32GB, PoE, VESA 100** — $548.99 (Newegg); similar units on Walmart/Amazon from ~$400
- Tokigns / MWE / Shining equivalents, $350–550

Pros: **PoE** — one ethernet cable delivers power *and* network, so no outlet behind the screen. Slim, appliance-like, fanless, rated for continuous operation, portrait or landscape.
Cons: 2–3× the used-AIO price. Weak SoC and old Android — fine for a vanilla-JS PWA, irrelevant for anything heavier. Google Play presence varies by unit; check before buying if you want Chrome + "Add to Home Screen".

Pair with **Fully Kiosk Browser** (~$10 one-time) for auto-start, screen-off scheduling, motion-wake, and swipe-lock.

---

## Option 3 — Touch monitor + mini PC (most flexible)

- Used **Elo 2201L / 2202L 22" POS touch monitor**: $60–150 on eBay (they're everywhere; retail refresh churn)
- New **ViewSonic TD2223 22" IR touch**: $279.99 (Best Buy)
- **Waveshare 21.5" capacitive, 1080×1920 native portrait**, VESA 100: $325.95 — the portrait-native panel is a genuinely nice fit for a calendar
- Brain: **N100 mini PC** ~$110–160, or **Raspberry Pi 5** ~$80 + PSU

**Total: ~$180 (used monitor + Pi) to ~$430 (new capacitive + mini PC).**

Pros: pick the exact panel you want; mini PC VESA-mounts behind the screen; easy to replace either half.
Cons: two devices, two power bricks, a USB touch cable to hide.

Note on touch tech: cheap POS monitors are usually **IR** — a raised bezel, works with anything, but can false-trigger in direct sunlight and doesn't feel like a tablet. **Capacitive** feels right for a family hub. Worth the delta if the screen sits somewhere sunny.

---

## Recommendation

1. **Cheapest that's actually good:** used 23.8" touch AIO (~$200) + ChromeOS Flex. One cable, works this week.
2. **If you have ethernet in the wall or want it to look like a product:** 21.5" PoE Android panel (~$400–550) + Fully Kiosk Browser.
3. **If you enjoy the build:** used Elo 22" + N100 mini PC (~$200) VESA-sandwiched.

---

## Practical setup notes

- **Deploy first.** The PWA needs a stable HTTPS URL (Cloudflare Pages per DEPLOY.md) before any kiosk can point at it.
- **Power:** plan an outlet behind the mount, or use an in-wall power relocation kit. PoE avoids the problem entirely.
- **Orientation:** decide portrait vs landscape *before* buying — it changes the layout work.
- **Night behavior:** schedule screen-off or a dimmed ambient clock; LCDs won't burn in, but a bright wall panel at 2am is not welcome.
- **Auto-start:** ChromeOS Flex kiosk mode, `chromium --kiosk --noerrdialogs` in an autostart entry, or Fully Kiosk on Android.
- **Lock it down:** disable pull-to-refresh / long-press context menu, and add the PIN gate on destructive actions before kids get hands on it.

## App work still needed (C3 touchscreen mode — not started)

The current CSS has one breakpoint at 560px. For a 21.5"+ wall screen you'd want:

- A landscape (or portrait) layout at ~1920px with persistent side nav instead of the floating home button
- Larger touch targets and an adjustable text-size/density setting — it's viewed from across the room
- An ambient/idle screen: big clock, today's agenda, next chores, auto-returning after N minutes of no touch
- PIN lock on delete/edit and on the family-management screen
- Wake-on-touch behavior + no accidental navigation gestures

Build these to the exact resolution and orientation of whatever you buy — pick the hardware first.
