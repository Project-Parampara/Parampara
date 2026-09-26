// index.js
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch'); // optional on Node 18+ use global fetch
const session = require('express-session');
const { OAuth2Client } = require('google-auth-library');
const bcrypt = require('bcryptjs');

// NEW: multer + fs/path for multipart uploads
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const pool = require('./db'); // your existing PostgreSQL pool
const app = express();

const PORT = process.env.PORT || 3000;
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '538014316805-cjnta4j1g02ueiarnlsvp2jvr5cangeo.apps.googleusercontent.com';
const SESSION_SECRET = process.env.SESSION_SECRET || 'change_this_in_prod';
const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY || '';

function normalizeLocation(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

// FRONTEND_ORIGINS: comma-separated list of allowed frontend origins
const FRONTEND_ORIGINS = (process.env.FRONTEND_ORIGINS || 'http://127.0.0.1:5500,http://localhost:5500')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

console.log('Allowed frontend origins:', FRONTEND_ORIGINS);
console.log('GOOGLE_MAPS_API_KEY set?', !!GOOGLE_MAPS_API_KEY);

// CORS options
const corsOptions = {
  origin: process.env.NODE_ENV === 'production' ? FRONTEND_ORIGINS : true,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
};

// --- Important: mount CORS BEFORE body parsers so preflight and body-parsing errors include CORS headers
app.use(cors(corsOptions));
app.options(/.*/, cors(corsOptions)); // handle preflight for all routes

// Increase body size limit to accept base64 images up to ~10 MB
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Simple request logger to help debug CORS / payload issues
app.use((req, res, next) => {
  console.log(`[incoming] ${req.method} ${req.path} Origin: ${req.headers.origin || '(none)'} Content-Length: ${req.headers['content-length'] || 'n/a'}`);
  next();
});

// Session configuration
const SESSION_NAME = process.env.SESSION_NAME || 'parampara.sid';
app.use(session({
  name: SESSION_NAME,
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: false,      // set to true when using HTTPS
    httpOnly: true,
    sameSite: 'lax',
    // No maxAge -> session cookie
  }
}));

const googleClient = new OAuth2Client(GOOGLE_CLIENT_ID);

// -------------------------------
// Multer setup for multipart registration (uploads)
// -------------------------------
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.jpg';
    cb(null, `userpic-${Date.now()}${ext}`);
  }
});
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } }); // 5MB

// ✅ Serve uploaded files with proper CORS headers (single mount, before routes)
app.use('/uploads', (req, res, next) => {
  const origin = req.headers.origin;
  if (origin && FRONTEND_ORIGINS.includes(origin)) {
    res.header('Access-Control-Allow-Origin', origin);
    res.header('Access-Control-Allow-Credentials', 'true');
  }
  next();
}, express.static(uploadDir));

app.get('/', (req, res) => {
  res.json({
    service: 'Parampara API',
    status: 'ok',
    endpoints: ['/api/sites', '/api/get-states', '/api/get-quiz']
  });
});

// -------------------------------
// Helper: Verify place via Google Geocode API (with logging)
// -------------------------------
async function verifyPlaceExistence(placeName, state, district) {
  if (!GOOGLE_MAPS_API_KEY) {
    console.warn('[verifyPlaceExistence] GOOGLE_MAPS_API_KEY not set — skipping external verification (will return true).');
    return true;
  }
  try {
    const addressQuery = encodeURIComponent(`${placeName}, ${district}, ${state}`);
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${addressQuery}&key=${GOOGLE_MAPS_API_KEY}`;
    console.log('[verifyPlaceExistence] calling:', url);
    const response = await fetch(url);
    const data = await response.json();
    console.log('[verifyPlaceExistence] status=', data.status, 'error_message=', data.error_message);
    return data.status === 'OK' && Array.isArray(data.results) && data.results.length > 0;
  } catch (err) {
    console.error('[verifyPlaceExistence] fetch error:', err && (err.message || err));
    throw err;
  }
}

function requireLogin(req, res, next) {
  if (req.session && req.session.user) next();
  else res.status(401).json({ error: 'Not logged in' });
}

// -------------------------------
// Verbose / safe add-site handler
// -------------------------------
app.post('/api/add-site', async (req, res) => {
  console.log('[add-site] incoming body:', req.body, 'Origin:', req.headers.origin);

  try {
    const { siteName, district, state } = req.body || {};

    // Basic validation
    if (!siteName || !String(siteName).trim() ||
        !district || !String(district).trim() ||
        !state || !String(state).trim()) {
      return res.status(400).json({ success: false, error: 'siteName, district, and state are required' });
    }

    // Optional: verify place existence
    let placeVerified = true;
    if (GOOGLE_MAPS_API_KEY) {
      try {
        const exists = await verifyPlaceExistence(siteName.trim(), state.trim(), district.trim());
        placeVerified = !!exists;
        console.log('[add-site] verifyPlaceExistence ->', placeVerified);
        if (!exists) {
          console.warn('[add-site] Google Maps verification failed — continuing insert.');
        }
      } catch (verifyErr) {
        console.warn('[add-site] verifyPlaceExistence error (ignored):', verifyErr.message);
      }
    } else {
      console.log('[add-site] GOOGLE_MAPS_API_KEY not set; skipping geocode verification.');
    }

    // ✅ Insert only the columns that exist in your table
    const insertQuery = `
      INSERT INTO cultural_sites (site_name, district, state)
      VALUES ($1, $2, $3)
      RETURNING site_name
    `;
    const values = [siteName.trim(), district.trim(), state.trim()];

    const insertResult = await pool.query(insertQuery, values);

    console.log('[add-site] insert result:', insertResult.rows);

    return res.json({
      success: true,
      site: insertResult.rows[0],
      verified: placeVerified
    });
  } catch (err) {
    console.error('[add-site] error:', err && (err.stack || err.message || err));
    const payload = { success: false, error: 'Internal server error' };
    if (process.env.NODE_ENV !== 'production') payload.details = err.message || err.stack;
    return res.status(500).json(payload);
  }
});


// synthesize route placeholder
app.post('/synthesize', requireLogin, async (req, res) => {
  // Your gTTS logic here
  res.status(501).json({ message: 'Not implemented' });
});

app.get('/session', (req, res) => {
  if (req.session && req.session.user) res.json({ loggedIn: true, user: req.session.user });
  else res.json({ loggedIn: false });
});

// -------------------------------
// ROUTES
// -------------------------------
app.get('/api/sites', async (req, res) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');

  const state = normalizeLocation(req.query.state);
  const district = normalizeLocation(req.query.district);
  if (!state || !district) {
    return res.status(400).json({ error: "Missing or invalid state/district" });
  }

  try {
    const result = await pool.query(
      `SELECT site_name, district, state
       FROM cultural_sites
       WHERE LOWER(REGEXP_REPLACE(TRIM(state), '\\s+', ' ', 'g')) = LOWER($1)
         AND LOWER(REGEXP_REPLACE(TRIM(district), '\\s+', ' ', 'g')) = LOWER($2)`,
      [state, district]
    );
    res.status(200).json(result.rows);
  } catch (err) {
    console.error("Error fetching sites:", err && (err.stack || err.message || err));
    res.status(500).json({ error: "Internal Server Error" });
  }
});

app.get('/api/get-quiz', async (req, res) => {
  const { state } = req.query;
  if (!state || typeof state !== 'string' || !state.trim()) {
    return res.status(400).json({ success: false, error: 'Please provide a valid state parameter' });
  }

  try {
    const result = await pool.query(
      `SELECT state, question, options, answer, explanation
       FROM quiz_questions
       WHERE LOWER(state) = LOWER($1)
       ORDER BY id`,
      [state.trim()]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: `Quiz questions not found for state: ${state}.`
      });
    }
    return res.json({
      success: true,
      state: state.trim(),
      questions: result.rows,
      totalQuestions: result.rows.length
    });
  } catch (err) {
    console.error('Error fetching quiz questions:', err);
    return res.status(500).json({ success: false, error: 'Internal Server Error' });
  }
});

app.get('/api/get-states', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT DISTINCT state FROM quiz_questions ORDER BY state'
    );
    return res.json({ success: true, states: result.rows.map(row => row.state), totalStates: result.rows.length });
  } catch (err) {
    console.error('Error fetching quiz states:', err);
    return res.status(500).json({ success: false, error: 'Internal Server Error' });
  }
});

app.post('/login', async (req, res) => {
  const { email, password } = req.body;
  // (Your existing password validation logic)
  
  // Example placeholder - replace with real validation:
  const isValidUser = false;
  if (isValidUser) {
    req.session.user = { email }; // store minimal user info
    res.json({ success: true });
  } else {
    res.status(401).json({ success: false, message: 'Invalid credentials' });
  }
});

// -------------------------------
// AUTH (register/login/google-login/logout/profile)
// -------------------------------

// NEW: multipart register route (multer)
app.post('/api/register-multipart', upload.single('picture'), async (req, res) => {
  try {
    console.log('[register-multipart] body keys:', Object.keys(req.body));
    console.log('[register-multipart] file:', req.file && req.file.filename);

    const { username, password, email } = req.body;
    if (!username || !password) return res.status(400).json({ message: 'Username and password required' });

    // check if user already exists
    const existing = await pool.query('SELECT id FROM users WHERE username = $1 LIMIT 1', [username.trim()]);
    if (existing.rows.length > 0) return res.status(400).json({ message: 'User already exists' });

    // hash password
    const salt = await bcrypt.genSalt(10);
    const hashed = await bcrypt.hash(password.trim(), salt);

    // picture path saved in DB as uploads path or null
    const picturePath = req.file ? `/uploads/${req.file.filename}` : null;

    const insertRes = await pool.query(
      `INSERT INTO users (username, password, email, picture) VALUES ($1, $2, $3, $4) RETURNING id, username, email, picture`,
      [username.trim(), hashed, email || null, picturePath]
    );

    // create server session
    req.session.user = { id: insertRes.rows[0].id, username: insertRes.rows[0].username, email: insertRes.rows[0].email, picture: insertRes.rows[0].picture };

    return res.json({ message: 'Registered successfully', user: req.session.user });
  } catch (err) {
    console.error('[register-multipart] error:', err && (err.stack || err.message || err));
    return res.status(500).json({ message: 'Server error', details: err && err.message });
  }
});

// existing JSON register kept for compatibility
app.post('/api/register', async (req, res) => {
  try {
    const { username, password, email, picture } = req.body;
    if (!username || !password || !username.trim() || !password.trim()) {
      return res.status(400).json({ message: "Username and password required" });
    }

    const existing = await pool.query('SELECT id FROM users WHERE username = $1 LIMIT 1', [username.trim()]);
    if (existing.rows.length > 0) {
      return res.status(400).json({ message: 'User already exists' });
    }

    const salt = await bcrypt.genSalt(10);
    const hashed = await bcrypt.hash(password.trim(), salt);

    await pool.query(
      `INSERT INTO users (username, password, email, picture) VALUES ($1, $2, $3, $4)`,
      [username.trim(), hashed, (email || null), (picture || null)]
    );

    return res.json({ message: 'Registered successfully' });
  } catch (err) {
    console.error('Register error:', err && (err.stack || err.message || err));
    return res.status(500).json({ message: 'Server error' });
  }
});

app.post('/api/login', async (req, res) => {
  try {
    const { identifier, password, username } = req.body;
    const loginId = identifier || username;
    if (!loginId || !password || !String(loginId).trim() || !String(password).trim()) {
      return res.status(400).json({ message: "Username/email and password required" });
    }

    let result = await pool.query('SELECT id, username, password, email, picture FROM users WHERE username = $1 LIMIT 1', [loginId.trim()]);
    if (result.rows.length === 0) {
      result = await pool.query('SELECT id, username, password, email, picture FROM users WHERE email = $1 LIMIT 1', [loginId.trim()]);
      if (result.rows.length === 0) return res.status(401).json({ message: 'Invalid username or password' });
    }

    const user = result.rows[0];
    if (!user.password) return res.status(401).json({ message: 'This account does not support password login. Use Google Sign-In.' });

    const match = await bcrypt.compare(password.trim(), user.password);
    if (!match) return res.status(401).json({ message: 'Invalid username or password' });

    req.session.user = { id: user.id, username: user.username, email: user.email, picture: user.picture };
    return res.json({ message: 'Login successful', user: req.session.user });

  } catch (err) {
    console.error('Login error:', err && (err.stack || err.message || err));
    return res.status(500).json({ message: 'Server error' });
  }
});

app.post('/api/google-login', async (req, res) => {
  try {
    const { credential } = req.body;
    if (!credential) return res.status(400).json({ message: 'Missing credential' });

    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: GOOGLE_CLIENT_ID
    });

    const payload = ticket.getPayload();
    const email = payload.email;
    const picture = payload.picture;

    const userRes = await pool.query('SELECT id, username, email, picture FROM users WHERE email = $1 LIMIT 1', [email]);
    let user;
    if (userRes.rows.length > 0) {
      user = userRes.rows[0];
      await pool.query('UPDATE users SET picture = $1 WHERE id = $2', [picture, user.id]);
    } else {
      const insertRes = await pool.query(
        `INSERT INTO users (username, password, email, picture) VALUES ($1, $2, $3, $4) RETURNING id, username, email, picture`,
        [email, null, email, picture]
      );
      user = insertRes.rows[0];
    }

    req.session.user = { id: user.id, username: user.username, email: user.email, picture: user.picture };
    return res.json({ message: 'Google login verified', user: req.session.user });
  } catch (err) {
    console.error('Google login verify failed:', err && (err.stack || err.message || err));
    return res.status(401).json({ message: 'Invalid Google token' });
  }
});

app.post('/api/logout', (req, res) => {
  req.session.destroy(err => {
    if (err) console.error('Session destroy err', err && (err.stack || err.message || err));
    // clear cookie using same name as session config
    res.clearCookie(SESSION_NAME);
    return res.json({ message: 'Logged out' });
  });
});

app.get('/api/profile', (req, res) => {
  if (!req.session.user) return res.status(401).json({ message: 'Not authenticated' });
  return res.json({ user: req.session.user });
});

// -------------------------------
// Error handler: ensure CORS headers on body-parser errors like Payload Too Large
// -------------------------------

app.use((err, req, res, next) => {
  const origin = req.headers.origin;
  if (origin && FRONTEND_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }

  // body-parser too large
  if (err && (err.type === 'entity.too.large' || err.status === 413)) {
    console.warn('⚠️ Payload too large for request:', req.path);
    return res.status(413).json({
      message: 'Payload too large. Please upload a smaller image or reduce file size.'
    });
  }

  // file not found on server
  if (err && err.code === 'ENOENT') {
    console.warn('🖼️ File not found:', req.path);
    return res.status(404).json({
      message: 'Requested file not found on server.'
    });
  }

  // fallback
  console.error('🚨 Unhandled server error:', err && (err.stack || err.message || err));
  res.status(500).json({
    message: 'Internal server error. Please try again later.'
  });
});

// Start server
// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on 0.0.0.0:${PORT}`);
});
