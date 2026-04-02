# MERN Web App Learning Module (Biomics Hub)

This guide teaches your full project from absolute beginner level.

You will learn:
- What MERN is
- How your frontend and backend talk
- How login works
- How videos/modules are managed
- How CSS animations work in your code
- How to build a similar app step by step

---

## 1) What is MERN?

MERN = MongoDB + Express + React + Node.js.

- MongoDB: stores data (users, videos, modules, quizzes)
- Express: backend framework that creates API routes
- React: frontend UI (buttons, forms, dashboard screens)
- Node.js: runtime that runs backend JavaScript

In your app:
- Backend folder contains Express + MongoDB logic
- Frontend folder contains React UI

---

## 2) Your project architecture (big picture)

Request flow:
1. User opens frontend in browser
2. React page loads and user clicks something (login/upload/create module)
3. Frontend sends API request to backend
4. Backend validates token and data
5. Backend reads/writes MongoDB
6. Backend returns JSON response
7. Frontend updates state and UI

Static file flow:
- Avatar and uploaded files are saved in backend uploads folder
- Backend serves them using URL like /uploads/filename
- Frontend builds final image URL and shows it

---

## 3) Backend setup from scratch (how to build)

### Step 1: Initialize backend
- Create backend folder
- npm init -y
- Install packages:
  - express
  - mongoose
  - dotenv
  - cors
  - jsonwebtoken
  - bcrypt
  - multer
  - zod

### Step 2: Create server entry
- File: backend/server.js
- Do these:
  - Load .env
  - Connect MongoDB using MONGO_URI
  - Create express app
  - app.use(express.json())
  - Add cors
  - Mount routes (auth, videos, modules, quiz, feedback)
  - Start server on PORT

### Step 3: Create models
- User model: username, phone, class, city, password, avatar
- Video model: title, category, module, links/materials
- Module model: category + module name
- Quiz model and attempts
- Feedback model

Important design rule used in your project:
- Module model has unique index on category + name
- This prevents duplicate module names in same course

### Step 4: Create route files
- backend/routes/authRoutes.js
- backend/routes/videoRoutes.js
- backend/routes/moduleRoutes.js
- backend/routes/quizRoutes.js
- backend/routes/feedbackRoutes.js

Each route file:
- Parse request
- Validate input with zod
- Check auth/role middleware
- Use mongoose to read/write
- Return clear JSON

### Step 5: Add middleware
- authenticateToken(role)
  - Reads Authorization Bearer token
  - Verifies JWT
  - Checks role (admin/user)
- validate(schema)
  - Uses zod schema
  - Returns 400 on invalid input

### Step 6: Authentication logic
- Register route:
  - Validate fields
  - Check duplicate username/phone
  - Save hashed password
- Login route:
  - Compare password using bcrypt.compare
  - Generate JWT token
  - Return token + user
- Profile routes:
  - GET /auth/me
  - PATCH /auth/me
  - POST /auth/me/avatar
  - DELETE /auth/me/avatar

### Step 7: Avatar upload logic
- multer stores image in backend/uploads
- DB stores filename (not full URL)
- helper builds URL as /uploads/filename
- frontend prefixes API base and displays image

Why this is good:
- File path is portable across environments
- Works on relogin and different devices if API base is correct

---

## 4) Frontend setup from scratch (how to build)

### Step 1: Create frontend with Vite + React
- npm create vite@latest frontend -- --template react
- Install dependencies

### Step 2: Folder structure style
- src/pages: full pages (AuthPage, StudentDashboard, AdminDashboard)
- src/components: reusable UI pieces
- src/stores: state store (session/theme)
- src/api.js: all backend API calls

### Step 3: Build API helper
- Define API_BASE logic
- buildUrl(path)
- requestJson(path, options)
  - attach token
  - set content type
  - parse JSON safely
  - throw readable errors

This centralization is important:
- Every page uses same API logic
- Easy to fix base URL once

### Step 4: Auth page
- Login form + register form
- Submit -> call /auth/login or /auth/register
- On success:
  - save token + role + username in store/local storage
  - navigate to dashboard by role

### Step 5: Admin dashboard page
- Fetch videos/modules/feedback/users
- Create module
- Upload video
- Delete module or video
- Schedule live class

### Step 6: Student dashboard page
- Fetch only student course videos
- Show profile modal
- Update profile and avatar
- Submit feedback
- Play videos and download material

### Step 7: State management idea
You use local state + stores:
- session store:
  - token
  - role
  - username
  - login/logout
- theme store:
  - light/dark mode

When session changes:
- protected routes allow/block pages

---

## 5) How module persistence works (important real-world lesson)

Old issue:
- Modules were only in frontend memory
- Refresh page -> modules disappear

New solution:
1. Create Module collection in MongoDB
2. Create routes:
   - GET /modules
   - POST /modules
   - DELETE /modules
3. On video upload, also upsert module in DB
4. On dashboard refresh, fetch modules from backend and rebuild UI map

Result:
- Modules survive refresh, relogin, and device changes

---

## 6) Frontend-backend contract examples

### Example A: Create module
Frontend sends:
- POST /modules
- body: { category, name }

Backend does:
- auth admin check
- validate body
- find/create module
- return saved object

Frontend does:
- refresh module list
- show success message

### Example B: Update profile photo
Frontend sends:
- POST /auth/me/avatar
- FormData with avatar file

Backend does:
- save file via multer
- update user.avatar.filename
- return avatarUrl

Frontend does:
- setProfile(response.user)
- render image from full URL

---

## 7) CSS architecture and animation explanation

Your CSS has theme variables and component classes.

### 7.1 Theme variables
You use CSS variables like:
- --bg-base
- --line
- --text-main
- --accent

Benefits:
- Easy dark/light switching
- Consistent colors

### 7.2 Layout rules
- app-shell has max width and centered layout
- media queries for responsive design
- mobile bottom-sheet style profile modal for small screens

### 7.3 Animation patterns in your project
You use keyframes + transitions.

Examples:
- page-enter animation for smooth dashboard load
- profile-sheet-up for mobile profile modal slide-up
- button hover transitions for premium feel

How it works:
- keyframes define start and end states
- animation property applies those frames
- cubic-bezier controls motion feel

Simple example concept:
- from: transform translateY(100%), opacity 0.6
- to: transform translateY(0), opacity 1

That creates a sheet coming from bottom on mobile.

### 7.4 Why your logout icon issue happened on Android
- Unicode symbol was not supported by some fonts
- Fixed by SVG icon
- SVG renders consistently on all devices

---

## 8) Security checklist you should always follow

- Store JWT secret in env only
- Never commit .env
- Hash passwords using bcrypt
- Validate every input with zod
- Use role middleware on admin routes
- Limit upload type and size in multer
- Sanitize/normalize user input

---

## 9) End-to-end build process for a new MERN app

Use this as your full roadmap:

1. Plan features and data models
2. Create backend API skeleton
3. Create Mongo models + indexes
4. Add auth + role middleware
5. Add CRUD routes (modules/videos/quizzes)
6. Test routes using Postman or curl
7. Create React frontend pages
8. Build API helper and session store
9. Connect forms to API
10. Add loading/error/success UX states
11. Add responsive CSS and animations
12. Deploy frontend and backend
13. Configure production env vars
14. Smoke-test login, upload, delete, profile flows

---

## 10) Suggested learning order for you

Week 1:
- JavaScript basics
- Node + Express routing

Week 2:
- MongoDB + Mongoose schemas
- Auth with JWT + bcrypt

Week 3:
- React components, hooks, state
- API integration with fetch

Week 4:
- Full CRUD project
- Responsive CSS + transitions
- Deployment basics

---

## 11) Mini glossary

- API: backend endpoint the frontend calls
- JWT: token proving who is logged in
- Middleware: function that runs before route handler
- Schema: structure of MongoDB documents
- State: frontend data that controls UI
- Upsert: update if exists, else insert
- Responsive: layout adapts by screen size

---

## 12) Your exact project map (quick reference)

Backend:
- server startup and route mounting: backend/server.js
- auth and avatar logic: backend/routes/authRoutes.js
- video logic: backend/routes/videoRoutes.js
- modules persistence: backend/models/Module.js, backend/routes/moduleRoutes.js

Frontend:
- API base and request helper: frontend/src/api.js
- reusable shell with topbar/logout/theme: frontend/src/components/AppShell.jsx
- sign-in/up page: frontend/src/pages/AuthPage.jsx
- admin logic: frontend/src/pages/AdminDashboard.jsx
- student logic + profile modal: frontend/src/pages/StudentDashboard.jsx
- global styling + animations: frontend/src/App.css

---

## 13) Final advice

Do not try to memorize everything at once.

Use this cycle:
1. Read one section
2. Open related file
3. Trace one real request from UI click to DB save
4. Change one small thing
5. Re-test

This project is already a strong real-world MERN example. If you understand this code flow, you can build many commercial apps.
