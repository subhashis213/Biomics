# Publish BiomicsHub on Google Play Store

This guide takes you from the current project to a live Play Store listing.

**Package name:** `com.biomicshub.app`  
**Backend:** `https://biomicshub-backend.onrender.com`

---

## Before you start

You need:

1. A [Google Play Console](https://play.google.com/console) account (**$25 one-time** developer fee)
2. App icon (512×512 PNG) — use `assets/images/icon.png` scaled up
3. Feature graphic (1024×500 PNG) — create in Canva/Figma
4. Phone screenshots (min **2**, recommended 4–8)
5. **Privacy policy URL** — required (host on `biomicshub.com/privacy` or similar)
6. Short + full app description

---

## Step 1 — Create the upload keystore (one time)

Play Store **does not accept debug-signed builds**. Generate your upload key:

```bash
cd biomicshub-app
chmod +x scripts/create-playstore-keystore.sh
npm run playstore:keystore
```

This creates:

- `credentials/biomicshub-upload.keystore` — **back this up permanently**
- `android/keystore.properties` — local signing config (gitignored)

Copy the **SHA-1** printed at the end and add it in:

- [Google Cloud Console](https://console.cloud.google.com) → Credentials → Android OAuth client  
  Package: `com.biomicshub.app`
- [Firebase Console](https://console.firebase.google.com) → Project settings → Your Android app → Add fingerprint

Then re-download `google-services.json` into `biomicshub-app/`.

---

## Step 2 — Build the Play Store bundle (AAB)

Google Play requires **AAB**, not APK.

```bash
cd biomicshub-app
npm run build:playstore
```

Output:

```
releases/BiomicsHub-1.0.24.aab
```

Upload this file to Play Console.

To bump version before each release, edit `app.json`:

```json
"version": "1.0.25",
"android": { "versionCode": 23 }
```

`versionCode` must increase every upload (integer only).

---

## Step 3 — Create the app in Play Console

1. Open [Play Console](https://play.google.com/console) → **Create app**
2. App name: **BiomicsHub**
3. Default language: English (India) or your choice
4. App / Game: **App**
5. Free or paid: **Free** (unless you sell the app itself; in-app purchases are separate)

---

## Step 4 — Complete required Play Console sections

### App content (left sidebar)

| Section | What to declare |
|--------|------------------|
| **Privacy policy** | URL to your privacy policy page |
| **App access** | If login required → provide test username/password for reviewers |
| **Ads** | No (unless you show ads) |
| **Content rating** | Complete IARC questionnaire (education app) |
| **Target audience** | 13+ or appropriate age |
| **News app** | No |
| **COVID-19** | No |
| **Data safety** | Declare: name, email, phone, course progress, device ID (FCM token) |
| **Government apps** | No |
| **Financial features** | Yes if you process payments in-app (Razorpay checkout) |

### Store listing

- **App name:** BiomicsHub
- **Short description:** (80 chars) e.g. `NEET & life-science courses, tests, live classes & study library.`
- **Full description:** Features — courses, batches, test series, mock exams, live classes, push alerts, free library
- **App icon:** 512×512 PNG
- **Feature graphic:** 1024×500 PNG
- **Screenshots:** Home, Learn, Tests, Login (min 2)

### Test credentials for reviewers

Create a student test account on your backend and add in **App access**:

```
Username: playstore_review
Password: (your test password)
```

Also mention admin login is optional or provide separate admin creds if needed.

---

## Step 5 — Upload the AAB

1. Play Console → **Release** → **Production** (or **Internal testing** first — recommended)
2. **Create new release**
3. Upload `releases/BiomicsHub-*.aab`
4. Release name: `1.0.24`
5. Release notes: What's new for users
6. **Review release** → **Start rollout**

**Tip:** Start with **Internal testing** (up to 100 testers) to verify install, login, Google Sign-In, push notifications, and payments before production.

---

## Step 6 — After approval

- Share the Play Store link with students
- Keep the upload keystore backed up — required for every update
- For each update: bump `versionCode`, run `npm run build:playstore`, upload new AAB

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| Upload rejected — debug certificate | Run `npm run playstore:keystore` and rebuild with `build:playstore` |
| Google Sign-In fails on Play build | Add **upload keystore SHA-1** to Google Cloud (not debug SHA-1) |
| Version code already used | Increase `versionCode` in `app.json` and rebuild |
| Push notifications not working | Ensure `google-services.json` matches production package + Firebase service account on Render |

---

## Quick command reference

```bash
npm run playstore:keystore    # one-time upload key
npm run build:playstore       # AAB for Play Store upload
npm run build:apk             # APK for direct sideload (not for Play Store)
```
