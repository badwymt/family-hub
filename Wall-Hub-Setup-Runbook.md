# Family Hub Wall Screen — Setup Runbook

**Your hardware:** Dell ST2220TC 22" touch monitor (1920×1080, optical/IR touch over USB) + Dell Wyse 5070 thin client (Celeron J4105, 4GB DDR4, 16GB SSD) + Dell 240W LA240PM160 adapter.

---

## 0. Read this first — three gotchas with this exact combo

**1. The Wyse 5070 has no HDMI.** The Celeron model has **two DisplayPort 1.2a outputs only** (VGA is a Pentium-model option). Your ST2220TC has HDMI / DVI-D / VGA. You need a **DisplayPort → HDMI cable** (~$8–12, passive is fine — the Intel GPU is dual-mode DP++). Buy it now or the screen stays black.

**2. The ST2220TC has no VESA holes.** Dell confirmed on their own forums that rear mounting "was never part of the design specifications." Your options:
- Universal non-VESA monitor adapter bracket (clamps the monitor into a VESA plate) — ~$25
- Put it on a slim floating shelf on its factory stand — zero cost, and the stand's fixed wedge angle actually aims well from a counter
- Swap the monitor later; the Wyse doesn't care

**3. The 240W brick fits and works.** The Wyse 5070 uses a **7.4mm barrel at 19.5V**, stock adapters are 65W/90W. Your LA240PM160 is 19.5V / 7.4mm — correct voltage, correct tip, far more headroom than needed. Genuine Dell adapters are ID-recognized, so no CPU clock throttling (that only happens with non-Dell/unrecognized bricks). It's just physically enormous; a 65W Dell 7.4mm brick would be tidier if you find one cheap.

**Also check on arrival:**
- `lspci | grep -i network` — WiFi is an *option* on the 5070. If there's no Intel card, run ethernet or add a USB WiFi dongle.
- `lsblk` — 16GB is tight but fine for a minimal Debian. If it's an M.2 SATA (not soldered eMMC), a 128GB M.2 2280 is ~$15 and worth it.
- TN panel: vertical viewing angles are poor. Mount at roughly eye level for where people actually stand, and tilt matters more than usual.

---

## 1. Deploy the app (do this first — nothing else works without a URL)

The repo is already at `github.com/badwymt/family-hub`. Follow `DEPLOY.md` § 2 Option A:

1. dash.cloudflare.com → **Workers & Pages** → **Create** → **Pages** → **Connect to Git** → pick `family-hub`
2. Framework preset **None**, build command **empty**, output directory **`web`**
3. Deploy → you get `https://<name>.pages.dev`

Open it on your phone, log in with the shared account, confirm the calendar loads. **Write the URL down — it goes into the kiosk config below.**

---

## 2. Prepare a Debian USB stick (on the Mac)

Debian 13 (trixie) netinst, ~700MB. Don't use ChromeOS Flex — its 16GB minimum is exactly your disk size, and it will fight you.

```bash
# download debian-13.x.0-amd64-netinst.iso from debian.org, then:
diskutil list                         # find your USB, e.g. /dev/disk4
diskutil unmountDisk /dev/disk4
sudo dd if=~/Downloads/debian-13.*-amd64-netinst.iso of=/dev/rdisk4 bs=4m status=progress
diskutil eject /dev/disk4
```

---

## 3. BIOS on the Wyse

1. Plug in keyboard + the USB stick, power on, tap **F2** repeatedly.
2. BIOS password: **`Fireport`** (Dell's factory default on Wyse units).
3. Set:
   - **USB Boot Support: Enabled**
   - **Secure Boot: Disabled** (simplest path)
   - **AC Recovery / After Power Loss: Power On** ← important, it's a wall appliance; a power blip shouldn't leave a black screen
   - Boot sequence: USB first
4. Save & exit. (**F12** at boot gives you a one-time boot menu if you'd rather not reorder.)

---

## 4. Install Debian — minimal

Run the standard installer, with these choices:

- Hostname: `familyhub`
- User: `hub` (remember the password)
- Partitioning: guided, entire disk, all files in one partition
- **Software selection: UNCHECK everything except "SSH server" and "standard system utilities."** No desktop environment — you're building your own 200MB one. This is what keeps you inside 16GB.

Reboot, pull the USB, log in as `hub`. Note the IP (`ip a`) so you can SSH in from the Mac and do the rest with copy-paste.

---

## 5. Install the kiosk stack

```bash
sudo apt update
sudo apt install -y --no-install-recommends \
  xserver-xorg xinit x11-xserver-utils openbox unclutter chromium

# confirm the touchscreen is seen (should list a NextWindow / Dell touch device)
sudo apt install -y xinput evtest
lsusb
```

The ST2220TC's optical touch is a standard USB HID multitouch device — modern kernels drive it with `hid-multitouch` with no drivers or configuration. It's **2-point** touch, so taps and drags work; don't expect reliable pinch.

---

## 6. Autologin + auto-start Chromium

**Autologin on tty1:**

```bash
sudo mkdir -p /etc/systemd/system/getty@tty1.service.d
sudo tee /etc/systemd/system/getty@tty1.service.d/override.conf >/dev/null <<'EOF'
[Service]
ExecStart=
ExecStart=-/sbin/agetty --autologin hub --noclear %I $TERM
EOF
sudo systemctl daemon-reload
```

**Start X on login** — `~/.bash_profile`:

```bash
cat >> ~/.bash_profile <<'EOF'
if [ -z "$DISPLAY" ] && [ "$XDG_VTNR" = 1 ]; then
  exec startx -- -nocursor
fi
EOF
```

**The kiosk itself** — `~/.xinitrc` (replace the URL):

```bash
cat > ~/.xinitrc <<'EOF'
#!/bin/sh
KIOSK_URL="https://YOUR-APP.pages.dev"

# no automatic blanking, but keep DPMS available so cron can force the screen off at night
xset s off
xset s noblank
xset +dpms
xset dpms 0 0 0

unclutter -idle 0.1 -root &
openbox &

while true; do
  rm -f ~/.config/chromium/Singleton*
  chromium \
    --kiosk \
    --no-first-run \
    --noerrdialogs \
    --disable-infobars \
    --disable-session-crashed-bubble \
    --disable-features=TranslateUI \
    --overscroll-history-navigation=0 \
    --disable-pinch \
    --touch-events=enabled \
    --check-for-update-interval=31536000 \
    --password-store=basic \
    --force-device-scale-factor=1.5 \
    "$KIOSK_URL"
  sleep 5
done
EOF
chmod +x ~/.xinitrc
```

Two flags worth understanding:

- **`--force-device-scale-factor=1.5`** — this is the cheap win. It makes the 1920×1080 panel render as 1280×720 CSS pixels, so every button, date cell and tap target is 50% bigger with **zero code changes**. Tune between `1.25` and `2.0` once it's on the wall and you can see it from where you stand. This substitutes for the touchscreen layout work until C3 is built.
- **`--overscroll-history-navigation=0`** — stops a kid's stray horizontal swipe from navigating back out of the app.

Not incognito, deliberately: the app needs `localStorage` for the selected member and the Supabase session, plus the service worker cache for offline.

Reboot. It should land on the calendar, fullscreen, logged in after you sign in once.

---

## 7. Night schedule + daily refresh

```bash
crontab -e
```

```cron
# screen off at 10:30pm, on at 6:30am — any touch also wakes it
30 22 * * * DISPLAY=:0 XAUTHORITY=/home/hub/.Xauthority xset dpms force off
30 6  * * * DISPLAY=:0 XAUTHORITY=/home/hub/.Xauthority xset dpms force on

# 4am: kill chromium so the while-loop relaunches it and picks up any new deploy
0 4 * * * pkill -f chromium
```

The service worker will normally pick up a new version on its own, but the 4am bounce guarantees it — useful when you push app changes from the Mac and want the wall screen current by breakfast.

---

## 8. Managing it afterwards

From the Mac: `ssh hub@familyhub.local` (or the IP). Everything is one file — edit `~/.xinitrc`, then `sudo systemctl restart getty@tty1` to apply.

Handy checks:

```bash
xinput list                                   # is the touchscreen detected
journalctl -b | grep -i -e touch -e hid       # touch driver messages
df -h /                                       # watch the 16GB
```

If touch lands offset from where you press, correct it with a transformation matrix rather than the long-dead `xinput_calibrator`:

```bash
xinput list                                    # get the device id
xinput set-prop <id> "Coordinate Transformation Matrix" 1 0 0 0 1 0 0 0 1
```

---

## 9. App-side work now that the target is known

Target is **1920×1080 landscape**, viewed from ~1–2 m, touched by kids. C3 (touchscreen mode) is still unbuilt — the only breakpoint in `styles.css` is `@media(min-width:560px)`. With `--force-device-scale-factor=1.5` the effective viewport is **1280×720**, so build to that:

- A `@media (min-width: 1100px)` landscape layout: persistent left side-nav replacing the floating 🏠 button, calendar taking the remaining width
- Bigger hit targets (44px minimum, ideally 60px+ for the kids' chore checkboxes) and a text-size/density setting
- Ambient/idle screen: after ~3 minutes of no touch, swap to a big clock + today's agenda + outstanding chores; any touch returns to the app
- PIN gate on delete/edit and on the family-management screen
- Suppress long-press context menus and text selection (`user-select: none`, `-webkit-touch-callout: none`) so kids can't drag text around

Say the word and I'll build these against the 1280×720 effective viewport.
