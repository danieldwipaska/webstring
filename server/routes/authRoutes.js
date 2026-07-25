import express from 'express';
import jwt from 'jsonwebtoken';
import { User } from '../models/User.js';
import { getDBStatus } from '../config/db.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

function sendTokenResponse(res, statusCode, user, message = 'Success') {
  const token = jwt.sign(
    { id: user.id || user._id, username: user.username, role: user.role || 'admin' },
    process.env.JWT_SECRET || 'super_secret_ubuntu_monitor_key_2026',
    { expiresIn: '7d' }
  );

  const cookieOptions = {
    expires: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
  };

  return res.status(statusCode).cookie('token', token, cookieOptions).json({
    success: true,
    message,
    user: {
      id: user.id || user._id,
      username: user.username,
      email: user.email,
      role: user.role || 'admin',
    },
    token, // Send token in body as well for client convenience if needed
  });
}

// POST /api/auth/register
router.post('/register', async (req, res) => {
  const { username, email, password } = req.body;

  if (!username || !email || !password) {
    return res.status(400).json({ success: false, message: 'Semua field (username, email, password) wajib diisi.' });
  }

  if (getDBStatus().isConnected) {
    try {
      const userExists = await User.findOne({ $or: [{ email }, { username }] });
      if (userExists) {
        return res.status(400).json({ success: false, message: 'Username atau Email sudah terdaftar.' });
      }

      const user = await User.create({ username, email, password });
      return sendTokenResponse(res, 201, user, 'Registrasi berhasil.');
    } catch (error) {
      return res.status(500).json({ success: false, message: error.message });
    }
  } else {
    // In-memory demo mode fallback
    const demoUser = { id: 'demo-id', username, email, role: 'admin' };
    return sendTokenResponse(res, 201, demoUser, 'Registrasi berhasil (Demo Mode).');
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { emailOrUsername, password } = req.body;

  if (!emailOrUsername || !password) {
    return res.status(400).json({ success: false, message: 'Username/Email dan password wajib diisi.' });
  }

  if (getDBStatus().isConnected) {
    try {
      const user = await User.findOne({
        $or: [{ email: emailOrUsername.toLowerCase() }, { username: emailOrUsername }],
      });

      if (user && (await user.matchPassword(password))) {
        return sendTokenResponse(res, 200, user, 'Login berhasil.');
      }

      return res.status(401).json({ success: false, message: 'Kredensial username/email atau password salah.' });
    } catch (error) {
      return res.status(500).json({ success: false, message: error.message });
    }
  } else {
    // In-memory demo login fallback
    if (password === 'admin123' || password.length >= 6) {
      const demoUser = { id: 'demo-id', username: emailOrUsername || 'admin', email: 'admin@ubuntu-server.local', role: 'admin' };
      return sendTokenResponse(res, 200, demoUser, 'Login berhasil (Demo Mode).');
    }
    return res.status(401).json({ success: false, message: 'Password salah.' });
  }
});

// POST /api/auth/logout - Clear JWT Cookie
router.post('/logout', (req, res) => {
  res.cookie('token', '', {
    httpOnly: true,
    expires: new Date(0),
  });
  return res.json({ success: true, message: 'Logout berhasil, cookie JWT telah dihapus.' });
});

// GET /api/auth/me - Verify current user session via JWT Cookie
router.get('/me', protect, (req, res) => {
  res.json({
    success: true,
    user: req.user,
  });
});

export default router;
