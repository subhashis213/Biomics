# Biomics Hub (MERN)

Biomics Hub is a role-based biology learning platform with:
- Admin workflow for course-wise lecture publishing
- Student dashboard restricted to the student's registered course
- Video + PDF notes support with progress-friendly material access

## UI Changelog

### 16 Mar 2026

- Replaced the old theme toggle with a modern multi-theme dropdown.
- Added theme chip badges and animations for quick visual theme identity.
- Added two additional themes (Ocean Blue, Sunset Amber) and one futuristic theme (Neo Glass).
- Added Neo Glass styling with frosted surfaces (cards, topbar, buttons, modals, panels).
- Added animated futuristic background layers (subtle grid drift + ambient glow) for Neo Glass theme.
- Improved admin UX around destructive actions:
  - 5-second undo popup with circular timer
  - Single pending destructive action guard
  - Top success banner auto-dismiss after 3 seconds

## Tech Stack

- MongoDB
- Express + Node.js
- React + Vite
- JWT-based authentication and role-protected APIs

## Key Features

- Student registration and login
- Admin login
- Course categories for content publishing:
  - 11th
  - 12th
  - NEET
  - IIT-JAM
  - CSIR-NET Life Science
  - GATE
- Admin dashboard:
  - Add lecture video by course
  - Upload and remove PDF notes (max 20MB)
  - Delete lectures
  - View and remove registered learners
  - View student feedback
  - Modern in-app confirmation modals for delete/remove actions
  - 5-second undo popup with circular countdown after delete/remove actions
  - Single pending destructive action at a time (prevents overlapping delete/remove races)
  - Sticky top success message that auto-hides after 3 seconds
- Student dashboard:
  - Shows only lectures from the student's registered course
  - Download study materials
  - Submit feedback
- Multi-theme dropdown with modern animated icon chip
- Available themes:
  - Forest Dark
  - Sage Light
  - Ocean Blue
  - Sunset Amber
  - Neo Glass (futuristic)
- Neo Glass theme includes:
  - Frosted glass cards/topbar/buttons
  - Animated futuristic grid + ambient glow background
  - Theme-specific `FX` chip badge in selector
- Front page (Auth hero) includes animated Biomics Hub name reveal for a cinematic first impression

## Project Structure

```text
BiomicsHubwebapp/
├── backend/
│   ├── createAdmin.js
│   ├── server.js
│   ├── middleware/
│   ├── models/
│   ├── routes/
│   └── uploads/
├── frontend/
│   ├── index.html
│   ├── vite.config.js
│   └── src/
├── package.json
└── README.md
```

## Prerequisites

- Node.js 18+
- npm 9+
- MongoDB running locally (or an accessible MongoDB URI)

## Environment Setup

Create `backend/.env`:

```env
MONGO_URI=mongodb://localhost:27017/biomicshub
PORT=5002
JWT_SECRET=replace_with_a_long_random_secret
ADMIN_USERNAME=admin
ADMIN_PASSWORD=replace_with_a_strong_admin_password
OTP_EXPIRY_MINUTES=5
OTP_COOLDOWN_SECONDS=45
OTP_MAX_ATTEMPTS=5
OTP_SECRET=replace_with_another_long_random_secret
SMS_PROVIDER=none
SMS_DRY_RUN=true
SMS_COUNTRY_CODE=+91
TWILIO_ACCOUNT_SID=your_twilio_account_sid
TWILIO_AUTH_TOKEN=your_twilio_auth_token
TWILIO_FROM_NUMBER=+1xxxxxxxxxx
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret
```

## Installation

From project root:

```bash
npm --prefix backend install
npm --prefix frontend install
```

## Start MongoDB (macOS/Homebrew)

```bash
brew services start mongodb-community
```

If using another MongoDB setup, ensure `MONGO_URI` is valid and reachable.

## Seed Admin (One-Time)

```bash
npm --prefix backend run seed:admin
```

The seed script uses `ADMIN_USERNAME` and `ADMIN_PASSWORD` from `backend/.env` when present.
If those variables are not set, it falls back to:
- Username: `admin`
- Password: `Admin@1234`

In production, the backend also auto-creates the admin account on startup when `ADMIN_USERNAME` and `ADMIN_PASSWORD` are set in the hosting environment.

## Migrate Existing Avatars to Cloudinary (One-Time)

After configuring `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, and `CLOUDINARY_API_SECRET`, run:

```bash
npm --prefix backend run migrate:avatars
```

Optional: remove local files after successful upload by setting:

```env
AVATAR_MIGRATION_DELETE_LOCAL=true
```

## Run in Development (Recommended)

Use two terminals from project root:

Terminal 1:

```bash
npm run dev:backend
```

Terminal 2:

```bash
npm run dev:frontend
```

URLs:
- Frontend: `http://localhost:5173`
- Backend API: `http://localhost:5002`

## Known Ports and URLs

| Service | Local URL | Port | Notes |
| --- | --- | --- | --- |
| Frontend (Vite dev) | `http://localhost:5173` | `5173` | Used during `npm run dev:frontend` |
| Backend API (Express) | `http://localhost:5002` | `5002` | Used during `npm run dev:backend` |
| Production app (single-server mode) | `http://localhost:5002` | `5002` | Backend serves built frontend + API |
| MongoDB (default local) | `mongodb://localhost:27017` | `27017` | Database host; app DB name is `biomicshub` |

## Health Check Commands

Run these from project root to quickly verify local setup.

One-command health check:

```bash
npm run check:health
```

Backend route module load check:

```bash
cd backend && node -e "require('./routes/videoRoutes'); console.log('video-routes-ok')"
```

Backend process listening check:

```bash
lsof -nP -iTCP:5002 -sTCP:LISTEN
```

MongoDB connectivity check:

```bash
mongosh --quiet "mongodb://localhost:27017/biomicshub" --eval "db.getCollectionNames()"
```

Frontend production build check:

```bash
npm run build
```

Quick API ping (example):

```bash
curl -i http://localhost:5002/videos
```

## Run in Production Mode (Single Server)

```bash
npm run build
npm start
```

In this mode, backend serves the built frontend from `frontend/dist` on port `5002`.

## Root Scripts

- `npm run dev:backend` -> runs backend with nodemon
- `npm run dev:frontend` -> runs Vite dev server
- `npm run build` -> builds frontend
- `npm start` -> runs backend server
- `npm run check:routes` -> verifies backend video routes module can load
- `npm run check:mongo` -> verifies MongoDB connectivity using backend Mongoose config
- `npm run check:port` -> checks backend listener on port 5002
- `npm run check:api` -> pings `GET /videos`
- `npm run check:health` -> runs all checks above in sequence

## API Overview

### Auth

- `POST /auth/register`
- `POST /auth/login`
- `POST /auth/send-otp` (student mobile OTP request)
- `POST /auth/verify-otp` (student OTP verification login)
- `POST /auth/admin-login`
- `GET /auth/users` (admin)
- `DELETE /auth/users/:username` (admin)

### Videos

- `GET /videos`
- `GET /videos?category=<course>`
- `GET /videos/my-course` (student)
- `POST /videos` (admin)
- `DELETE /videos/:id` (admin)
- `POST /videos/:id/materials` (admin, PDF only)
- `DELETE /videos/:id/materials/:filename` (admin)

### Feedback

- `POST /feedback` (student)
- `GET /feedback` (admin)

### Static Files

- `GET /uploads/:filename`

## Notes

- PDF upload limit: 20MB
- Uploaded files are saved in `backend/uploads`
- Removing a student account revokes login until re-registration
- Admin delete/remove flow is two-step: confirm first, then undo is available for 5 seconds
- If token/session appears stale after changes, log out and log in again
- Theme selection is saved in local storage key `biomics_theme`
- Theme chip badges currently map as: `DK`, `LG`, `OC`, `SS`, `FX`

## Troubleshooting

### Backend starts but requests fail

- Verify MongoDB is running
- Verify `MONGO_URI`, `PORT`, and `JWT_SECRET` in `backend/.env`
- Ensure backend is listening on `5002`

### Frontend cannot reach API

- Ensure backend is running
- Check browser Network tab for actual error response

### Frontend shows old UI after recent changes

If you still see old behavior (for example, missing undo popup), clear stale dev processes and restart both servers fresh:

```bash
pkill -f "node server.js" || true
pkill -f "vite" || true
npm run dev:backend
npm run dev:frontend
```

Then do a hard refresh in browser (Cmd+Shift+R on macOS).

### Route mismatch after recent edits

Restart backend process:

```bash
pkill -f "node server.js" || true
npm --prefix backend run start
```

## Developer Workflow

### Recommended startup order (daily)

1. Start MongoDB

```bash
brew services start mongodb-community
```

2. Start backend

```bash
npm run dev:backend
```

3. Start frontend

```bash
npm run dev:frontend
```

4. Open app

- Frontend: `http://localhost:5173`
- Backend: `http://localhost:5002`

### Fast local restart

If ports or old processes are stuck:

```bash
pkill -f "node server.js" || true
npm run dev:backend
```

### One-time reset flow for a clean environment

Use this when you want to reset local data and start fresh.

1. Stop backend process

```bash
pkill -f "node server.js" || true
```

2. Drop local database (`biomicshub`)

```bash
mongosh "mongodb://localhost:27017/biomicshub" --eval "db.dropDatabase()"
```

3. Re-seed admin

```bash
npm --prefix backend run seed:admin
```

4. Start backend + frontend again

```bash
npm run dev:backend
npm run dev:frontend
```

### Quick checks before committing

```bash
npm run build
```

This validates the frontend production build and catches most UI/runtime import issues early.
