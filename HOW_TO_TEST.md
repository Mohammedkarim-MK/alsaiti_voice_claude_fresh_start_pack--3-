# Alsaiti Voice — how to test on your phone

You now have the Alsaiti Voice product built as a testable app in **two** forms. Both show the same
screens (dashboard, leads, lead detail, conversations, analytics, billing, settings) using the exact
brand colours from your spec. Nothing about the product's logic was invented — it follows
`01_MASTER_PRODUCT_SPEC.md` (lead statuses, sources, dashboard questions, pricing).

---

## Option A — fastest (works on any phone, tablet, desktop, no install)

Folder: **`alsaiti-voice-app/`** → open **`index.html`**.

1. On a **computer**: just double-click `index.html`. It opens in any browser and is fully responsive —
   resize the window to see phone, tablet and desktop layouts.
2. On your **phone**: put the `alsaiti-voice-app` folder on the phone (AirDrop / email / cloud) and open
   `index.html`, **or** publish the folder free with Netlify Drop (drag the folder onto
   https://app.netlify.com/drop) and open the link on your phone.
3. It's a PWA — on the phone browser choose **"Add to Home Screen"** and it launches full-screen like a
   native app, with the Alsaiti Voice icon.

This is the quickest way to "test it out" on every device today. No QR code or dev server needed.

---

## Option B — real Expo Go app + QR code

Folder: **`alsaiti-voice-expo/`**

Important: an Expo Go QR only works while a dev server runs on **your** computer and your phone is on the
**same Wi-Fi**. I can't host that server for your phone from here, so you run one command and Expo prints
the QR for you. It takes about 2 minutes.

### One-time setup on your computer
1. Install Node.js (LTS) from https://nodejs.org if you don't have it.
2. Install the **Expo Go** app on your phone (App Store / Google Play).

### Run it
Open a terminal in the `alsaiti-voice-expo` folder and run:

```bash
npm install
npx expo start
```

A **QR code appears in your terminal** (and in the browser Dev Tools that opens).

- **iPhone:** open the Camera app, point it at the QR → tap the banner → it opens in Expo Go.
- **Android:** open **Expo Go** → "Scan QR code" → point at the QR.

The app loads live on your phone. Edit `App.js` and it hot-reloads instantly.

> If your phone and computer are on different networks, run `npx expo start --tunnel` instead
> (it routes through Expo's servers so the QR works anywhere).

---

## Which should I use?
- Just want to see and click through it now, on any device → **Option A**.
- Want it running as a true native app in Expo Go with the scannable QR → **Option B**.

## Note on the original files
The 15 files in `alsaiti_voice_claude_fresh_start/` are the planning/spec pack for building the full
production Next.js SaaS (real auth, Supabase, Stripe, voice). Those are untouched. The two app folders
above are a faithful, testable front-end of that product so you can try the experience on your devices.
