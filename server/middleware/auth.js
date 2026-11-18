import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { User } from '../models/User.js';
import { getDBStatus } from '../config/db.js';
import { getJwtSecret } from '../config/security.js';

/**
 * Verifies a JWT and loads the corresponding User from MongoDB.
 * Fails closed if the database is disconnected, the token is invalid,
 * the user no longer exists, or the password was changed after token issuance.
 */
export async function verifyUserToken(token) {
  if (!token || typeof token !== 'string') {
    const err = new Error('Access denied. Authentication token missing.');
    err.statusCode = 401;
    throw err;
  }

  let decoded;
  try {
    decoded = jwt.verify(token, getJwtSecret(), { algorithms: ['HS256'] });
  } catch {
    const err = new Error('Authentication session expired or invalid. Please log in again.');
    err.statusCode = 401;
    throw err;
  }

  if (!decoded?.id || !mongoose.isValidObjectId(decoded.id)) {
    const err = new Error('Authentication session invalid. Please log in again.');
    err.statusCode = 401;
    throw err;
  }

  if (!getDBStatus().isConnected) {
    const err = new Error('Authentication service unavailable (database disconnected).');
    err.statusCode = 503;
    throw err;
  }

  const user = await User.findById(decoded.id).select('-password');
  if (!user) {
    const err = new Error('User account no longer exists. Please log in again.');
    err.statusCode = 401;
    throw err;
  }

  if (user.passwordChangedAt && decoded.iat) {
    const changedTimestamp = Math.floor(user.passwordChangedAt.getTime() / 1000);
    if (decoded.iat < changedTimestamp) {
      const err = new Error('Password was recently changed. Please log in again.');
      err.statusCode = 401;
      throw err;
    }
  }

  return user;
}

export async function protect(req, res, next) {
  let token;

  // 1. Check HTTP-Only Cookie
  if (req.cookies && req.cookies.token) {
    token = req.cookies.token;
  }
  // 2. Fallback to Authorization Header
  else if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) {
    return res.status(401).json({
      success: false,
      message: 'Access denied. Please log in first to access this page.',
    });
  }

  try {
    req.user = await verifyUserToken(token);
    return next();
  } catch (error) {
    const status = error.statusCode || 401;
    return res.status(status).json({
      success: false,
      message: error.message || 'Authentication session expired or invalid. Please log in again.',
    });
  }
}
