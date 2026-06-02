# BiomicsHub App (React Native · Expo)

A single end-to-end Android app for **students and admins**, backed by the existing
BiomicsHub API (`https://biomicshub-backend.onrender.com`).

- **Student**: courses + admin pricing, in-app lectures, test series (topic tests &
  full mocks), mock/monthly exams, and push notifications.
- **Admin**: dashboard, send push notifications to students, view learners, revenue,
  and manage uploaded lectures.
- **Push notifications**: Firebase Cloud Messaging (FCM) — works even when the app
  is closed once Firebase is configured (steps below).

The login screen has a **Student / Admin** toggle. The app routes to the correct
dashboard automatically based on the logged-in role.

---

## Release APK

`releases/BiomicsHub-1.0.0.apk` (~66 MB)

```bash
adb install -r releases/BiomicsHub-1.0.0.apk
```

> This build is **FCM-ready** but does not yet contain Firebase credentials, so
> remote pushes are inactive until you complete the Firebase setup and rebuild.
> Everything else (login, courses, tests, exams, admin dashboard, in-app
> announcements) works out of the box.

---

## Project structure

```
app/
  _layout.tsx              Root: AuthProvider + role-based redirect
  login.tsx                Student / Admin login toggle
  (student)/               Student tabs: Home, Learn, Test Series, Exams, Alerts
  (admin)/                 Admin tabs: Dashboard, Notify, Learners, Revenue, Content
  course/[courseName].tsx  Course detail + admin pricing
  learn/[courseName]/...   Modules -> lectures (in-app video player)
  test/topic/[testId].tsx  Topic test runner
  test/mock/[mockId].tsx   Full mock runner
  exam/[examId].tsx        Mock/monthly exam runner
src/
  api/                     client, auth, courses, testSeries, learning, exams, admin, notifications
  context/AuthContext.tsx  Role-aware session + push registration
  components/              ui, VideoPlayer, TestExamRunner
  utils/                   format, video, push (FCM token)
```

---

## Develop

```bash
npm install
npx expo start        # Expo dev (remote push needs a dev build, not Expo Go)
```

## Google Play Store

Full step-by-step guide: **[PLAYSTORE.md](./PLAYSTORE.md)**

```bash
npm run build:playstore   # signed .aab → releases/BiomicsHub-<version>.aab
```

Upload the `.aab` file to [Google Play Console](https://play.google.com/console) → Release → Production.

---

## Rebuild the APK

```bash
npm run prebuild:android   # expo prebuild --platform android --clean
npm run build:apk          # gradlew assembleRelease
# APK at android/app/build/outputs/apk/release/app-release.apk
```

## Enable Google Sign-In (same OAuth as web)

The app uses the **same backend endpoints** as the website:

- `POST /auth/google-login` — exchange Google ID token for session
- `POST /auth/google-complete-profile` — phone + DOB for new Google users

### 1. Use the existing Web OAuth client ID

Copy the same value you already use for:

- Web: `VITE_GOOGLE_CLIENT_ID`
- Backend: `GOOGLE_CLIENT_ID`

Create `biomicshub-app/.env`:

```bash
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=YOUR_WEB_CLIENT_ID.apps.googleusercontent.com
```

### 2. Register the Android app in Google Cloud / Firebase

Google Sign-In **will not work** until SHA-1 fingerprints are added in Firebase.

Run locally to verify:

```bash
npm run check:google-oauth
```

1. [Firebase Console](https://console.firebase.google.com) → **biomicshub-91820** → Project settings → Android app
2. **Add fingerprint** (add both):
   - Debug: `5E:8F:16:06:2E:A3:CD:2C:4A:0D:54:78:76:BA:A6:F3:8C:AB:F6:25`
   - Upload/Play: `9C:65:BB:01:A6:A6:E6:C7:44:1C:2C:8B:C4:1C:99:AB:3D:22:0B:D0`
3. After first Play Store upload, also add **Play App Signing** SHA-1 from Play Console → Setup → App signing
4. Download fresh **`google-services.json`** → `biomicshub-app/google-services.json`
5. Rebuild the app

Also in [Google Cloud Console](https://console.cloud.google.com) → Credentials, ensure an **Android OAuth client** exists for `com.biomicshub.app`.

**Do not** add `com.biomicshub.app:/oauthredirect` to the **Web** client — that causes “Custom scheme URIs are not allowed for WEB client type”.

### Alternative: backend browser OAuth (works without Firebase SHA-1)

If Firebase SHA-1 setup is not done yet, the app falls back to opening Google Sign-In in the browser via the backend:

1. Deploy the latest **backend** code to Render
2. In [Google Cloud Console](https://console.cloud.google.com) → Credentials → your **Web** OAuth client:
   - Copy the **Client secret**
   - Under **Authorized redirect URIs**, add:
     `https://biomicshub-backend.onrender.com/auth/google-mobile/callback`
3. On Render, set environment variables:
   - `GOOGLE_CLIENT_ID` — same Web client ID as above
   - `GOOGLE_CLIENT_SECRET` — from step 2
4. Rebuild and install the app (`npm run build:apk`)

Native one-tap Google Sign-In still needs Firebase SHA-1 (steps above). The browser fallback works immediately after backend env is set.

### 3. Rebuild the APK

Google Sign-In uses a native module — rebuild after setting the env var:

```bash
npm run prebuild:android
npm run build:apk
```

---


Pushes that arrive while the phone is locked/app-closed require FCM. Two pieces:
the **app** needs `google-services.json`, the **backend** needs a service account.

### 1. Create a Firebase project
1. Go to <https://console.firebase.google.com> → **Add project**.
2. In the project, **Add app → Android**.
3. Set the package name to **`com.biomicshub.app`** (must match `app.json`).
4. Download **`google-services.json`**.

### 2. Wire the app
1. Put `google-services.json` in the app root: `biomicshub-app/google-services.json`.
2. In `app.json`, add it under `android`:
   ```json
   "android": {
     "package": "com.biomicshub.app",
     "googleServicesFile": "./google-services.json",
     ...
   }
   ```
3. Rebuild: `npm run prebuild:android && npm run build:apk`.

### 3. Wire the backend
1. Firebase Console → **Project settings → Service accounts → Generate new private key**.
   This downloads a service-account JSON.
2. On the backend host (Render → Environment), set **one** of:
   - `FIREBASE_SERVICE_ACCOUNT` = the full JSON contents (as a single string), **or**
   - `FIREBASE_SERVICE_ACCOUNT_PATH` = path to the JSON file on the server.
3. Install the new dependency and redeploy:
   ```bash
   cd backend && npm install   # pulls in firebase-admin
   ```

When configured, the admin **Notify** tab reports “LIVE (FCM)”, and every send
delivers a real push + saves an in-app announcement. Until then, sends still save
the announcement (visible in the student **Alerts** tab) and report that push is
not configured yet.

---

## Backend endpoints added for this app

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| POST | `/notifications/register` | any | Save a device's FCM token |
| POST | `/notifications/unregister` | any | Remove a device token (logout) |
| GET  | `/notifications` | any | List in-app notifications |
| POST | `/notifications/admin/send` | admin | Send push + save announcement |
| GET  | `/notifications/admin/status` | admin | Push config + device counts |

All other data uses existing endpoints (`/auth`, `/payments`, `/test-series`,
`/mock-exams`, `/videos`, `/modules`).
