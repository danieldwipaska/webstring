import jwt from 'jsonwebtoken';
import { User } from '../models/User.js';

export async function protect(req, res, next) {
  let token;

  // 1. Check HTTP-Only Cookie
  if (req.cookies && req.cookies.token) {
    token = req.cookies.token;
  } 
  // 2. Fallback to Authorization Header
  else if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) {
    return res.status(401).json({
      success: false,
      message: 'Akses ditolak. Silakan login terlebih dahulu untuk mengakses halaman ini.',
    });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'super_secret_ubuntu_monitor_key_2026');

    // If DB is connected, fetch user; otherwise attach decoded payload
    try {
      req.user = await User.findById(decoded.id).select('-password');
    } catch {
      req.user = { id: decoded.id, username: decoded.username, role: decoded.role || 'admin' };
    }

    if (!req.user) {
      req.user = { id: decoded.id, username: decoded.username, role: decoded.role || 'admin' };
    }

    return next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: 'Sesi autentikasi telah kadaluarsa atau tidak valid. Silakan login kembali.',
    });
  }
}
