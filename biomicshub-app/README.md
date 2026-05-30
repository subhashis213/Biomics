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

## Rebuild the APK

```bash
npm run prebuild:android   # expo prebuild --platform android --clean
npm run build:apk          # gradlew assembleRelease
# APK at android/app/build/outputs/apk/release/app-release.apk
```

---

## Enable push notifications (Firebase / FCM)

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
