# MERN Web App Code Walkthrough Workbook (Part 3)

This workbook teaches your project by showing exact code locations.

Each section has:
- File path
- Line numbers
- Code snippet
- Explanation
- Hands-on task

---

## SECTION 1: Backend Setup and Entry Point

### 1.1 Server initialization

File: `backend/server.js`
Lines: 1-50

What happens here:
1. Load environment variables from .env
2. Create Express app
3. Connect to MongoDB
4. Mount route middleware
5. Start listening on PORT

```javascript
// backend/server.js (partial)
require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const app = express();
app.use(express.json());
app.use(cors());

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URI, { useNewUrlParser: true })
  .then(() => console.log('MongoDB connected'))
  .catch(err => console.error('MongoDB error:', err));

// Mount routes
app.use('/auth', require('./routes/authRoutes'));
app.use('/videos', require('./routes/videoRoutes'));
app.use('/modules', require('./routes/moduleRoutes'));

const PORT = process.env.PORT || 5002;
app.listen(PORT, () => console.log(`Server on port ${PORT}`));
```

Key concept:
- require() loads modules (similar to import in frontend)
- middleware runs in order (json parser first, then routes)
- error happens? MongoDB logs it and app waits for manual restart

**Hands-on Task 1:**
1. Open backend/server.js
2. Find the line connecting MongoDB
3. Change MONGO_URI in your .env to 'bad_uri'
4. Restart server and see error message
5. Fix MONGO_URI and restart

---

## SECTION 2: User Authentication

### 2.1 User model schema

File: `backend/models/User.js`
Lines: 1-30

This defines structure of every user document in MongoDB:

```javascript
const userSchema = new mongoose.Schema({
  phone: { type: String, required: true, unique: true },
  username: { type: String, required: true, unique: true },
  class: { type: String, required: true },
  city: { type: String, required: true },
  security: {
    question: { type: String, default: 'What is your birth date?' },
    birthDate: { type: Date }
  },
  avatar: {
    filename: { type: String, default: '' },
    originalName: { type: String, default: '' }
  },
  password: { type: String, required: true },
  favorites: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Video' }],
  completedVideos: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Video' }]
});
```

Each field:
- phone: unique, can't register twice with same phone
- username: unique, for login
- avatar: object with filename stored (not full URL)
- favorites, completedVideos: arrays storing video IDs (references)

**Hands-on Task 2:**
1. Open User.js
2. Add a new field: `bio: { type: String, default: '' }`
3. Save file
4. This alone won't update DB, just schema
5. Next sections show how to use this field

### 2.2 Password hashing before save

File: `backend/models/User.js`
Lines: 23-28

```javascript
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  // Avoid double-hashing when password was already hashed in route handlers.
  if (/^\$2[aby]\$\d{2}\$.{53}$/.test(this.password)) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});
```

What this does:
- `pre('save')` runs BEFORE document is saved to MongoDB
- Checks if password changed
- Hashes it using bcrypt (makes it unreadable)
- Calls next() to continue saving

Why important:
- Passwords must never be stored plain text
- Only hash should be in database
- When user logs in, bcrypt.compare() checks if input matches hash

---

### 2.3 User registration route

File: `backend/routes/authRoutes.js`
Lines: 180-230

```javascript
router.post('/register', validate(registerSchema), async (req, res) => {
  const { phone, username, class: userClass, city, birthDate, password } = req.body;
  
  // Check if user already exists
  const exists = await User.findOne({ 
    $or: [{ phone: normalizedPhone }, { username: normalizedUsername }] 
  }).lean();
  if (exists) return res.status(400).json({ error: 'User already exists' });
  
  // Create new user (password will auto-hash via schema.pre)
  const user = new User({
    phone: normalizedPhone,
    username: normalizedUsername,
    class: normalizedClass,
    city: normalizedCity,
    security: {
      question: 'What is your birth date?',
      birthDate: new Date(`${normalizedBirthDate}T00:00:00.000Z`)
    },
    password: normalizedPassword
  });
  
  await user.save();
  
  res.status(201).json({
    message: 'User registered',
    user: { username: user.username, phone: user.phone }
  });
});
```

Step-by-step:
1. Middleware `validate(registerSchema)` checks input format
2. Normalize phone, username, etc (trim, remove spaces)
3. Query DB to see if user with same phone/username exists
4. If exists, return 400 error early
5. Create new User object (NOT saved yet)
6. Call user.save() which triggers the pre-save hook
7. Pre-save hook hashes password
8. Document saved to MongoDB
9. Return 201 success with user info

**Hands-on Task 3:**
1. Find this route in authRoutes.js
2. Add console.log before and after user.save()
3. Register a new student
4. Check terminal output - you'll see password hashed before save

### 2.4 User login route

File: `backend/routes/authRoutes.js`
Lines: 240-280

```javascript
router.post('/auth/login', validate(loginSchema), async (req, res) => {
  try {
    const normalizedUsername = String(req.body.username).trim();
    const user = await User.findOne({ 
      username: new RegExp(`^${escapeRegex(normalizedUsername)}$`, 'i') 
    });
    
    if (!user) return res.status(404).json({ error: 'User not found' });
    
    // Compare password using bcrypt
    const passwordMatch = await bcrypt.compare(req.body.password, user.password);
    if (!passwordMatch) return res.status(401).json({ error: 'Invalid password' });
    
    // Generate JWT token
    const token = jwt.sign(
      { username: user.username, role: 'user' },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );
    
    res.json({
      token,
      user: {
        username: user.username,
        phone: user.phone,
        class: user.class,
        city: user.city,
        avatarUrl: buildAvatarUrl(user)
      }
    });
  } catch (err) {
    res.status(500).json({ error: 'Login failed' });
  }
});
```

Flow:
1. Find user by username (case-insensitive)
2. If not found, return 404
3. Compare input password with stored hash using bcrypt
4. If password doesn't match, return 401 unauthorized
5. If password matches, generate JWT token containing username and role
6. Token expires in 7 days (security)
7. Return token + user info

Why bcrypt.compare is needed:
- You can't reverse hash
- So you hash the input password and compare both hashes
- If they match, password is correct

---

## SECTION 3: JWT and Authentication Middleware

### 3.1 Auth middleware

File: `backend/middleware/auth.js`
Lines: 1-40

```javascript
function authenticateToken(allowedRoles = []) {
  return (req, res, next) => {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1]; // "Bearer TOKEN"
    
    if (!token) {
      return res.status(401).json({ error: 'Authorization required' });
    }
    
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      req.user = decoded; // { username, role }
      
      // Check if user role matches allowed roles
      if (allowedRoles.length > 0 && !allowedRoles.includes(req.user.role)) {
        return res.status(403).json({ error: 'Forbidden' });
      }
      
      next(); // Continue to route handler
    } catch (err) {
      res.status(401).json({ error: 'Invalid token' });
    }
  };
}

module.exports = authenticateToken;
```

How it works:
1. Extract token from Authorization header (format: "Bearer TOKEN")
2. If no token, return 401 unauthorized
3. Try to verify token using JWT_SECRET
4. If verification passes, decode contains { username, role }
5. Attach decoded to req.user for route handler to use
6. If role check fails, return 403 forbidden
7. Call next() to continue to actual route handler

### 3.2 Using middleware on a protected route

File: `backend/routes/authRoutes.js`
Lines: 275-310

```javascript
// Example: Only admin can get all users
router.get('/users', authenticateToken(['admin']), async (req, res) => {
  try {
    const users = await User.find({}, { username: 1, class: 1, phone: 1, city: 1 })
      .sort({ username: 1 })
      .lean();
    
    res.json({ total: users.length, users });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});
```

What happens:
1. Request comes with Authorization header
2. authenticateToken(['admin']) middleware runs
3. Middleware verifies token and checks role === 'admin'
4. If not admin, middleware returns 403 and stops
5. If admin, middleware calls next() and route handler runs
6. Route handler fetches all users from DB
7. Returns user list

**Hands-on Task 4:**
1. Open authRoutes.js and find /users route
2. Look at the authenticateToken(['admin']) call
3. If you change ['admin'] to ['user'], the route becomes student-accessible
4. Test by logging in as student and hitting that endpoint

---

## SECTION 4: Avatar Upload and File Handling

### 4.1 Multer storage configuration

File: `backend/routes/authRoutes.js`
Lines: 26-40

```javascript
const avatarStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    const safeBase = path.basename(file.originalname || 'avatar', ext)
      .replace(/[^a-zA-Z0-9_-]/g, '_');
    cb(null, `avatar-${Date.now()}-${safeBase}${ext || '.jpg'}`);
  }
});

const avatarUpload = multer({
  storage: avatarStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if ((file.mimetype || '').startsWith('image/')) return cb(null, true);
    return cb(new Error('Only image files allowed'));
  }
});
```

What each part does:
- `destination`: where to save file (backend/uploads folder)
- `filename`: how to name the file (avatar-TIMESTAMP-safename.ext)
- `fileSize limit`: max 5MB per file
- `fileFilter`: only accept image mimetypes

Why timestamp in filename:
- Prevents overwriting files with same name
- Makes filenames unique per upload

### 4.2 Avatar upload route

File: `backend/routes/authRoutes.js`
Lines: 350-380

```javascript
router.post('/me/avatar', authenticateToken('user'), avatarUpload.single('avatar'), async (req, res) => {
  try {
    const user = await User.findOne({ username: req.user.username });
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (!req.file) return res.status(400).json({ error: 'File required' });

    // Save old filename to delete later
    const previousFilename = user.avatar?.filename;
    
    // Update user avatar
    user.avatar = {
      filename: req.file.filename,
      originalName: req.file.originalname || req.file.filename
    };
    await user.save();

    // Delete old avatar file if it exists
    if (previousFilename && previousFilename !== req.file.filename) {
      const previousPath = path.join(uploadsDir, path.basename(previousFilename));
      if (fs.existsSync(previousPath)) {
        fs.unlinkSync(previousPath);
      }
    }

    return res.json({
      message: 'Profile photo updated',
      user: {
        username: user.username,
        avatarUrl: buildAvatarUrl(user)
      }
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});
```

Flow:
1. Middleware authenticates user
2. multer.single('avatar') parses form-data and saves file
3. File location is in req.file.filename
4. Find user by username from token
5. Save filename to user.avatar (NOT full path)
6. Delete old avatar file to save space
7. Build URL using buildAvatarUrl helper
8. Return new avatarUrl so frontend can display it

### 4.3 Build avatar URL helper

File: `backend/routes/authRoutes.js`
Lines: 67-69

```javascript
function buildAvatarUrl(user) {
  const filename = user?.avatar?.filename;
  return filename ? `/uploads/${encodeURIComponent(filename)}` : '';
}
```

This returns relative URL like `/uploads/avatar-1234567890-myfile.jpg`

Frontend then prefixes API base:
- Local: http://localhost:5002/uploads/...
- Production: https://yourdomain.com/uploads/...

**Hands-on Task 5:**
1. Open authRoutes.js and find buildAvatarUrl function
2. Add console.log to see what filename looks like
3. Go to student dashboard and upload a photo
4. Check terminal output
5. Check backend/uploads folder to see actual file

---

## SECTION 5: Module Persistence (Database + API)

### 5.1 Module model

File: `backend/models/Module.js`
Lines: 1-15

```javascript
const moduleSchema = new mongoose.Schema({
  category: { type: String, required: true, trim: true },
  name: { type: String, required: true, trim: true },
  createdBy: { type: String, default: '', trim: true }
}, { timestamps: true });

moduleSchema.index({ category: 1, name: 1 }, { unique: true });
module.exports = mongoose.model('Module', moduleSchema);
```

Key point:
- Unique composite index on (category, name)
- Prevents duplicate "11th Physics" and "11th Chemistry" in same course

### 5.2 Module routes

File: `backend/routes/moduleRoutes.js`
Lines: 1-50

```javascript
const express = require('express');
const router = express.Router();
const Module = require('../models/Module');
const { authenticateToken } = require('../middleware/auth');

// GET all modules (admin only)
router.get('/', authenticateToken(['admin']), async (req, res) => {
  try {
    const modules = await Module.find({}).sort({ category: 1, name: 1 }).lean();
    res.json({ modules });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch modules' });
  }
});

// POST create or update module
router.post('/', authenticateToken(['admin']), async (req, res) => {
  const { category, name } = req.body;
  try {
    const module = await Module.findOneAndUpdate(
      { category, name },
      { category, name, createdBy: req.user.username },
      { upsert: true, new: true }
    );
    res.status(201).json({ module });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// DELETE module
router.delete('/', authenticateToken(['admin']), async (req, res) => {
  const { category, name } = req.body;
  try {
    await Module.deleteOne({ category, name });
    res.json({ message: 'Module deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
```

findOneAndUpdate with upsert:
- Searches for { category, name }
- If found: updates createdBy
- If not found: creates new document
- Returns the saved document

---

## SECTION 6: Frontend Setup and API Connection

### 6.1 API helper

File: `frontend/src/api.js`
Lines: 1-60

```javascript
import { getToken } from './session';

const isLocalhostClient = typeof window !== 'undefined'
  && ['localhost', '127.0.0.1'].includes(window.location.hostname);

const API_BASE = isLocalhostClient
  ? `${window.location.protocol}//${window.location.hostname}:5002`
  : (import.meta.env.VITE_API_URL || '');

function buildUrl(path) {
  return `${API_BASE}${path}`;
}

async function requestJson(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  
  // Set JSON content type if sending JSON body
  const isJsonBody = options.body && !(options.body instanceof FormData);
  if (isJsonBody && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }
  
  // Attach JWT token from session
  const token = getToken();
  if (token && !headers['Authorization']) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  let response;
  try {
    response = await fetch(buildUrl(path), {
      ...options,
      headers
    });
  } catch {
    throw new Error(`Cannot reach API at ${buildUrl(path)}`);
  }
  
  return parseJsonResponse(response);
}

export function getApiBase() {
  return API_BASE;
}
```

Why this matters:
1. API_BASE detects if on localhost or production
2. requestJson automatically adds token to every request
3. All pages use same requestJson - easy to fix bugs in one place
4. getApiBase() exported so avatar URL can use correct base

**Hands-on Task 6:**
1. Open frontend/src/api.js
2. Add console.log to show API_BASE value
3. Open browser console
4. Login and see the logged API_BASE
5. Understand how it changes between local and production

### 6.2 Session store (state management)

File: `frontend/src/stores/sessionStore.js`
Lines: 1-50

```javascript
import { create } from 'zustand';

export const useSessionStore = create((set) => ({
  session: {
    token: localStorage.getItem('token') || '',
    role: localStorage.getItem('role') || '',
    username: localStorage.getItem('username') || ''
  },
  
  login: (token, role, username) => {
    localStorage.setItem('token', token);
    localStorage.setItem('role', role);
    localStorage.setItem('username', username);
    set({ session: { token, role, username } });
  },
  
  logout: () => {
    localStorage.clear();
    set({ session: { token: '', role: '', username: '' } });
  }
}));
```

How it works:
1. Zustand is state library (like Redux but simpler)
2. Session data stored in localStorage (survives refresh)
3. login() saves to localStorage and updates state
4. logout() clears both
5. Any component can call useSessionStore() to get session

Why localStorage:
- When page refreshes, token stays available
- When closing browser and reopening, user still "logged in"
- XSS attack risk: tokens can be stolen from localStorage
- Production apps sometimes use httpOnly cookies instead

---

## SECTION 7: Frontend Login Page

### 7.1 Auth page component structure

File: `frontend/src/pages/AuthPage.jsx`
Lines: 1-50

```javascript
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { requestJson } from '../api';
import { useSessionStore } from '../stores/sessionStore';

export default function AuthPage() {
  const navigate = useNavigate();
  const { login } = useSessionStore();
  
  const [registerOpen, setRegisterOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  
  const [loginForm, setLoginForm] = useState({ username: '', password: '' });
  const [registerForm, setRegisterForm] = useState({ /* fields */ });
```

State managed here:
- registerOpen: is register form visible?
- loading: is request in progress?
- loginForm, registerForm: form field values

### 7.2 Handle login

File: `frontend/src/pages/AuthPage.jsx`
Lines: 120-160

```javascript
async function handleLogin(event) {
  event.preventDefault();
  setLoading(true);
  
  try {
    const response = await requestJson('/auth/login', {
      method: 'POST',
      body: JSON.stringify(loginForm)
    });
    
    // Save token and navigate
    login(response.token, response.user.role, response.user.username);
    
    if (response.user.role === 'admin') {
      navigate('/admin');
    } else {
      navigate('/student');
    }
  } catch (error) {
    setError(error.message);
  } finally {
    setLoading(false);
  }
}
```

Flow:
1. User clicks login button (form onSubmit)
2. event.preventDefault() stops page reload
3. Call requestJson which sends POST /auth/login
4. If successful, response has token and user role
5. save to session store (which saves to localStorage)
6. Navigate to dashboard by role
7. If error, show error message and keep form open

---

## SECTION 8: Frontend Dashboard (Student)

### 8.1 Student dashboard setup

File: `frontend/src/pages/StudentDashboard.jsx`
Lines: 1-100

```javascript
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { requestJson } from '../api';
import { useSessionStore } from '../stores/sessionStore';

export default function StudentDashboard() {
  const navigate = useNavigate();
  const { session, logout } = useSessionStore();
  
  const [course, setCourse] = useState(null);
  const [videos, setVideos] = useState([]);
  const [loading, setLoading] = useState(false);
  const [profile, setProfile] = useState(null);
```

On component mount:
1. Check if logged in
2. If not, redirect to login
3. Fetch profile
4. Fetch student's course videos

### 8.2 Load student profile

File: `frontend/src/pages/StudentDashboard.jsx`
Lines: 150-200

```javascript
async function loadProfile() {
  try {
    const response = await requestJson('/auth/me');
    setProfile(response.user);
    setCourse(response.user.class); // class is the course name
  } catch (error) {
    console.error('Failed to load profile:', error);
  }
}
```

This fetches current logged-in user's profile from backend.

### 8.3 Avatar display with correct URL

File: `frontend/src/pages/StudentDashboard.jsx`
Lines: 490-495

```javascript
import { getApiBase } from '../api';

const profileAvatarUrl = profile?.avatarUrl
  ? `${getApiBase()}${profile.avatarUrl}`
  : '';
```

Note:
- Backend returns relative URL: /uploads/avatar-1234.jpg
- Frontend adds API base: http://localhost:5002/uploads/avatar-1234.jpg
- This works on any device because base adapts to current location

**Hands-on Task 7:**
1. Login as student and go to profile modal
2. Upload avatar
3. Open browser DevTools -> Network tab
4. See the POST /auth/me/avatar request
5. See response contains avatarUrl
6. Check image preview shows correct URL

### 8.4 Fetch videos for student course

File: `frontend/src/pages/StudentDashboard.jsx`
Lines: 210-240

```javascript
async function loadVideos() {
  setLoading(true);
  try {
    // Backend filters videos by student's course
    const response = await requestJson('/videos/my-course');
    setVideos(response.videos || []);
  } catch (error) {
    console.error('Failed to load videos:', error);
  } finally {
    setLoading(false);
  }
}
```

Backend route:

File: `backend/routes/videoRoutes.js`
Lines: 80-95

```javascript
router.get('/my-course', authenticateToken('user'), async (req, res) => {
  try {
    // Get user's class from token username
    const user = await User.findOne({ username: req.user.username });
    if (!user) return res.status(404).json({ error: 'User not found' });
    
    // Fetch videos for that class/course
    const videos = await Video.find({ category: user.class })
      .sort({ createdAt: -1 })
      .lean();
    
    res.json({ videos });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch videos' });
  }
});
```

Key design:
- Student token contains username
- Backend looks up user's class (course)
- Backend filters videos by that class
- Frontend never has to specify course (comes from backend)
- This prevents student from hacking URL to see other courses

---

## SECTION 9: Frontend Dashboard (Admin)

### 9.1 Admin dashboard setup

File: `frontend/src/pages/AdminDashboard.jsx`
Lines: 1-100

Similar to student but:
- Fetches all videos, all users, all feedback
- Can create, edit, delete videos and modules
- Can remove students
- Can view quizzes

### 9.2 Create module

File: `frontend/src/pages/AdminDashboard.jsx`
Lines: 400-450

```javascript
async function handleModuleCreate(moduleName) {
  try {
    // Send to backend
    const response = await requestJson('/modules', {
      method: 'POST',
      body: JSON.stringify({
        category: course,
        name: moduleName
      })
    });
    
    // Refresh modules list
    await refreshData();
    
    setBanner({ type: 'success', text: 'Module created' });
  } catch (error) {
    setError(error.message);
    throw error; // Form stays open
  }
}
```

What happens:
1. Admin clicks "Create Module" in course
2. Modal appears with input
3. Admin types module name and submits
4. Frontend sends POST /modules with category + name
5. Backend upserts module in MongoDB
6. Frontend refreshes module list from DB
7. Success message shown

### 9.3 Upload video

File: `frontend/src/pages/AdminDashboard.jsx`
Lines: 550-610

```javascript
async function handleVideoUpload(file, details) {
  const formData = new FormData();
  formData.append('video', file);
  formData.append('title', details.title);
  formData.append('category', course);
  formData.append('module', details.module);
  
  try {
    const response = await requestJson('/videos', {
      method: 'POST',
      body: formData
    });
    
    // Refresh videos
    await loadAdminQuizzes();
    
    setBanner({ type: 'success', text: 'Video uploaded' });
  } catch (error) {
    setError(error.message);
  }
}
```

Backend side updates module too:

File: `backend/routes/videoRoutes.js`
Lines: 150-190

```javascript
router.post('/videos', authenticateToken('admin'), videoUpload.single('video'), async (req, res) => {
  // Save video to uploads folder
  if (req.file) {
    req.body.videoUrl = `/uploads/${req.file.filename}`;
  }
  
  // Create video document
  const video = new Video({
    title: req.body.title,
    category: req.body.category,
    module: req.body.module,
    videoUrl: req.body.videoUrl
  });
  
  await video.save();
  
  // Also upsert module
  if (req.body.module) {
    await Module.findOneAndUpdate(
      { category: req.body.category, name: req.body.module },
      { createdBy: req.user.username },
      { upsert: true }
    );
  }
  
  res.json({ video });
});
```

This is important:
- Every video upload also ensures module exists in DB
- Keeps module collection in sync with video data

---

## SECTION 10: CSS Animation in-depth

### 10.1 Theme variables setup

File: `frontend/src/App.css`
Lines: 1-180

```css
:root {
  --bg-base: #0f0f14;
  --bg-card: #1a1a24;
  --line: #2d2d40;
  --text-main: #e8eaed;
  --accent: #6366f1;
  --accent-2: #8b5cf6;
  /* ... more variables ... */
}

html[data-theme='light'] {
  --bg-base: #f5f5f7;
  --bg-card: #ffffff;
  --line: #e5e5e7;
  --text-main: #1d1d1f;
  /* ... etc ... */
}
```

How switching themes works:
1. JavaScript changes html[data-theme] attribute
2. CSS matches new selector
3. All --variables redefine with light colors
4. All components using var(--bg-card) etc auto-update

## 10.2 Animation: page entrance

File: `frontend/src/App.css`
Lines: 1220-1235

```css
.app-shell {
  animation: page-enter 0.42s cubic-bezier(0.22, 0.9, 0.2, 1) both;
}

@keyframes page-enter {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
```

How it works:
1. @keyframes defines start (from) and end (to) states
2. animation: applies keyframes over 420ms
3. cubic-bezier controls acceleration curve
4. "both" means start at "from" state

Visual effect:
- Page fades in (opacity 0->1)
- Page slides up from 10px below (translateY 10->0)

### 10.3 Animation: mobile profile sheet

File: `frontend/src/App.css`
Lines: 4693-4703

```css
.profile-modal {
  animation: profile-sheet-up 320ms cubic-bezier(0.32, 0.72, 0.28, 1) both;
}

@keyframes profile-sheet-up {
  from {
    transform: translateY(100%);
    opacity: 0.6;
  }
  to {
    transform: translateY(0);
    opacity: 1;
  }
}
```

Visual effect:
- Modal comes from bottom of screen (translateY 100% -> 0%)
- Fades in while moving (opacity 0.6 -> 1)
- Only applies on mobile (inside @media query)

### 10.4 Transition: button hover

File: `frontend/src/App.css`
Lines: 1262-1269

```css
.topbar-logout-btn {
  transition: background 0.2s ease, color 0.2s ease, border-color 0.2s ease,
              box-shadow 0.2s ease, transform 0.18s ease;
}

.topbar-logout-btn:hover {
  background: linear-gradient(135deg, #ef4444, #dc2626);
  color: #fff;
  border-color: transparent;
  box-shadow: 0 4px 16px rgba(239,68,68,0.35);
  transform: translateY(-1px);
}
```

How transitions work:
1. Normal state: light gradient + red text
2. Hover state: darker gradient + white text + shadow + lifted
3. transition: property animates over duration
4. 0.2s ease means smooth 200ms animation

**Hands-on Task 8:**
1. Open App.css
2. Find .topbar-logout-btn:hover
3. Change transform: translateY(-1px) to translateY(-3px)
4. Test in browser - button lifts more on hover
5. Revert change

---

## SECTION 11: Building a new feature from scratch

Let's add "Student bio" field:

### Step 1: Update schema

File: `backend/models/User.js`

Add this line:
```javascript
bio: { type: String, default: '', maxLength: 500 }
```

### Step 2: Update API

Files: `backend/routes/authRoutes.js`

Find updateProfileSchema and add:
```javascript
bio: z.string().max(500).optional()
```

Find PATCH /me route and add:
```javascript
if (req.body.bio !== undefined) user.bio = req.body.bio;
```

### Step 3: Frontend form

File: `frontend/src/pages/StudentDashboard.jsx`

Find setProfileForm and add:
```javascript
bio: profile?.bio || ''
```

Find profile form in JSX and add:
```jsx
<label>
  Bio
  <textarea
    value={profileForm.bio}
    onChange={(e) => setProfileForm(current => ({ ...current, bio: e.target.value }))}
    placeholder="Tell us about yourself (max 500 chars)"
    maxLength={500}
  />
</label>
```

### Step 4: Test
- Register student
- Go to profile modal
- Type bio
- Click Save
- Refresh page
- Bio should still be there

---

## SECTION 12: Hands-on Exercise Solutions

### Exercise from Part 2: Add search by title

File: `frontend/src/pages/StudentDashboard.jsx`

```javascript
const [searchTerm, setSearchTerm] = useState('');

const filteredVideos = videos.filter(v => 
  v.title.toLowerCase().includes(searchTerm.toLowerCase())
);

// In JSX
<input
  type="text"
  placeholder="Search videos..."
  value={searchTerm}
  onChange={(e) => setSearchTerm(e.target.value)}
/>

{filteredVideos.map(video => (
  <VideoCard key={video._id} video={video} />
))}
```

### Exercise: Add user count to admin dashboard

File: `backend/routes/authRoutes.js` (new endpoint)

```javascript
router.get('/count', authenticateToken('admin'), async (req, res) => {
  const count = await User.countDocuments();
  res.json({ count });
});
```

File: `frontend/src/pages/AdminDashboard.jsx`

```javascript
const [userCount, setUserCount] = useState(0);

async function loadUserCount() {
  try {
    const response = await requestJson('/auth/count');
    setUserCount(response.count);
  } catch (error) {
    console.error('Failed to load user count:', error);
  }
}

// Call in useEffect
useEffect(() => {
  loadUserCount();
}, []);

// Display
<StatCard title="Total Students" value={userCount} />
```

---

## SECTION 13: Quick Reference: File Map

| Feature | Backend File | Frontend File |
|---------|--------------|---------------|
| User/Auth | backend/routes/authRoutes.js | frontend/src/pages/AuthPage.jsx |
| User Schema | backend/models/User.js | frontend/src/stores/sessionStore.js |
| Videos | backend/routes/videoRoutes.js | frontend/src/pages/StudentDashboard.jsx |
| Modules | backend/routes/moduleRoutes.js | frontend/src/pages/AdminDashboard.jsx |
| API Calls | - | frontend/src/api.js |
| Styling | frontend/src/App.css | (same) |
| Theme | (theme variables at top of App.css) | frontend/src/stores/themeStore.js |

---

## SECTION 14: Debug Tips

### Backend not responding?
```bash
lsof -nP -iTCP:5002 -sTCP:LISTEN  # Is server running?
mongosh --quiet "mongodb://localhost:27017/biomicshub" --eval "db.getCollectionNames()"  # Is DB connected?
```

### Frontend API error?
- Open browser DevTools -> Network tab
- Click to make request
- See the full request and response
- Check if token is in headers
- Check status code (4xx = client error, 5xx = server error)

### Avatar not showing?
- Check console for full URL being requested
- Verify file exists in backend/uploads
- Confirm profileAvatarUrl is not empty
- Check CORS if error is CORS-related

---

## SECTION 15: Final Self-Test

Can you answer these?

1. Where is the JWT secret stored? (Answer: .env file)
2. How does the student's dashboard know which videos to show? (Answer: backend filters by student.class)
3. What protects admin routes? (Answer: authenticateToken middleware)
4. Where are avatar files stored? (Answer: backend/uploads folder)
5. How does login form get token? (Answer: POST /auth/login response)
6. What happens when module is created? (Answer: Upserted in Module collection + frontend refreshes)
7. How does page animation work? (Answer: @keyframes + animation property)
8. Where is API base URL detection? (Answer: frontend/src/api.js)

If you can answer all 8, you understand the architecture!

---

## Next Steps

1. Do the hands-on tasks in order
2. Change one small thing and test
3. Read code while actual request is happening
4. Try the practice exercises
5. Build a similar mini-app for practice
