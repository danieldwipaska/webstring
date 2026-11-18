import express from 'express';
import jwt from 'jsonwebtoken';
import { User } from '../models/User.js';
import { getDBStatus } from '../config/db.js';
import { getJwtSecret, isCookieSecure } from '../config/security.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

function isRegistrationDisabledByEnv() {
  return (process.env.DISABLE_REGISTRATION || '').toLowerCase() === 'true';
}

function sendTokenResponse(req, res, statusCode, user, message = 'Success') {
  const token = jwt.sign(
    { id: user._id.toString(), username: user.username, role: user.role || 'admin' },
    getJwtSecret(),
    { expiresIn: '7d', algorithm: 'HS256' }
  );

  const cookieOptions = {
    expires: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
    httpOnly: true,
    sameSite: 'lax',
    secure: isCookieSecure(req),
    path: '/',
  };

  return res.status(statusCode).cookie('token', token, cookieOptions).json({
    success: true,
    message,
    user: {
      id: user._id,
      username: user.username,
      email: user.email,
      role: user.role || 'admin',
    },
  });
}

function sanitizeInput(val) {
  if (typeof val !== 'string') return '';
  return val.trim();
}

// GET /api/auth/register-status - Check if registration is open (max 1 user)
router.get('/register-status', async (req, res) => {
  if (isRegistrationDisabledByEnv()) {
    return res.json({
      success: true,
      canRegister: false,
      dbConnected: getDBStatus().isConnected,
    });
  }

  if (!getDBStatus().isConnected) {
    return res.status(503).json({
      success: false,
      canRegister: false,
      dbConnected: false,
      message: 'Database unavailable.',
    });
  }

  try {
    const count = await User.countDocuments();
    return res.json({
      success: true,
      canRegister: count === 0,
      dbConnected: true,
      count,
    });
  } catch (error) {
    console.error('[Auth Register Status Error]', error.message);
    return res.status(500).json({ success: false, canRegister: false, message: 'Internal server error.' });
  }
});

// POST /api/auth/register
router.post('/register', async (req, res) => {
  if (isRegistrationDisabledByEnv()) {
    return res.status(403).json({
      success: false,
      message: 'Registration is disabled by server configuration.',
    });
  }

  if (!getDBStatus().isConnected) {
    return res.status(503).json({
      success: false,
      message: 'Database unavailable. Registration is currently disabled.',
    });
  }

  const username = sanitizeInput(req.body.username);
  const email = sanitizeInput(req.body.email);
  const password = typeof req.body.password === 'string' ? req.body.password : '';

  if (!username || !email || !password) {
    return res.status(400).json({ success: false, message: 'All fields (username, email, password) are required.' });
  }

  if (username.length < 3 || username.length > 50) {
    return res.status(400).json({ success: false, message: 'Username must be between 3 and 50 characters.' });
  }

  if (password.length < 8) {
    return res.status(400).json({ success: false, message: 'Password must be at least 8 characters.' });
  }

  try {
    const userCount = await User.countDocuments();
    if (userCount >= 1) {
      return res.status(400).json({
        success: false,
        message: 'Registration closed. This system enforces a maximum of 1 administrator account.',
      });
    }

    const userExists = await User.findOne({ $or: [{ email: email.toLowerCase() }, { username }] });
    if (userExists) {
      return res.status(400).json({ success: false, message: 'Username or Email is already registered.' });
    }

    const user = await User.create({
      username,
      email: email.toLowerCase(),
      password,
      singletonKey: 'SINGLE_ADMIN',
    });
    return sendTokenResponse(req, res, 201, user, 'Registration successful.');
  } catch (error) {
    if (error && error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'Registration closed. An administrator account already exists.',
      });
    }
    console.error('[Auth Register Error]', error.message);
    return res.status(500).json({ success: false, message: 'Internal server error.' });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  if (!getDBStatus().isConnected) {
    return res.status(503).json({
      success: false,
      message: 'Authentication service unavailable (database disconnected).',
    });
  }

  const emailOrUsername = sanitizeInput(req.body.emailOrUsername);
  const password = typeof req.body.password === 'string' ? req.body.password : '';

  if (!emailOrUsername || !password) {
    return res.status(400).json({ success: false, message: 'Username/Email and password are required.' });
  }

  try {
    const user = await User.findOne({
      $or: [{ email: emailOrUsername.toLowerCase() }, { username: emailOrUsername }],
    });

    if (user && (await user.matchPassword(password))) {
      return sendTokenResponse(req, res, 200, user, 'Login successful.');
    }

    return res.status(401).json({ success: false, message: 'Invalid username/email or password credentials.' });
  } catch (error) {
    console.error('[Auth Login Error]', error.message);
    return res.status(500).json({ success: false, message: 'Internal server error.' });
  }
});

// PUT /api/auth/settings - Update username and/or password for logged-in user
router.put('/settings', protect, async (req, res) => {
  if (!getDBStatus().isConnected) {
    return res.status(503).json({
      success: false,
      message: 'Database unavailable. Cannot update account settings.',
    });
  }

  const username = sanitizeInput(req.body.username);
  const currentPassword = typeof req.body.currentPassword === 'string' ? req.body.currentPassword : '';
  const newPassword = typeof req.body.newPassword === 'string' ? req.body.newPassword : '';

  if (!req.user) {
    return res.status(401).json({ success: false, message: 'Access denied.' });
  }

  try {
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    if (newPassword) {
      if (!currentPassword) {
        return res.status(400).json({
          success: false,
          message: 'Current password is required to set a new password.',
        });
      }

      const isMatch = await user.matchPassword(currentPassword);
      if (!isMatch) {
        return res.status(400).json({ success: false, message: 'Current password entered is incorrect.' });
      }

      if (newPassword.length < 8) {
        return res.status(400).json({ success: false, message: 'New password must be at least 8 characters.' });
      }

      user.password = newPassword; // Will be hashed and set passwordChangedAt in userSchema.pre('save')
    }

    if (username && username !== user.username) {
      if (username.length < 3 || username.length > 50) {
        return res.status(400).json({ success: false, message: 'Username must be between 3 and 50 characters.' });
      }
      const usernameExists = await User.findOne({ username, _id: { $ne: user._id } });
      if (usernameExists) {
        return res.status(400).json({ success: false, message: 'Username is already in use by another account.' });
      }
      user.username = username;
    }

    await user.save();
    return sendTokenResponse(req, res, 200, user, 'Account settings updated successfully.');
  } catch (error) {
    console.error('[Auth Settings Error]', error.message);
    return res.status(500).json({ success: false, message: 'Internal server error.' });
  }
});

// POST /api/auth/logout - Clear JWT Cookie
router.post('/logout', (req, res) => {
  res.clearCookie('token', {
    httpOnly: true,
    sameSite: 'lax',
    secure: isCookieSecure(req),
    path: '/',
  });
  return res.json({ success: true, message: 'Logout successful, session cookie cleared.' });
});

// GET /api/auth/me - Verify current user session via JWT Cookie
router.get('/me', protect, (req, res) => {
  res.json({
    success: true,
    user: req.user,
  });
});

export default router;
