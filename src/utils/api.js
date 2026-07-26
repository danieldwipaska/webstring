const API_BASE = '/api';

export function getAuthToken() {
  return localStorage.getItem('token');
}

export function setAuthToken(token) {
  if (token) {
    localStorage.setItem('token', token);
  } else {
    localStorage.removeItem('token');
  }
}

export function getCurrentUser() {
  const user = localStorage.getItem('user');
  return user ? JSON.parse(user) : null;
}

export function setCurrentUser(user) {
  if (user) {
    localStorage.setItem('user', JSON.stringify(user));
  } else {
    localStorage.removeItem('user');
  }
}

export async function fetchApi(endpoint, options = {}) {
  const token = getAuthToken();
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  try {
    const response = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers,
      credentials: 'include', // Automatically send and receive HttpOnly Cookies with requests
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.message || 'An API error occurred');
    }
    return data;
  } catch (err) {
    console.error(`[API Error] ${endpoint}:`, err.message);
    throw err;
  }
}

export async function checkAuthStatus() {
  try {
    const res = await fetchApi('/auth/me');
    if (res.success && res.user) {
      setCurrentUser(res.user);
      return res.user;
    }
    return null;
  } catch (err) {
    setCurrentUser(null);
    setAuthToken(null);
    return null;
  }
}

export async function logoutUser() {
  try {
    await fetchApi('/auth/logout', { method: 'POST' });
  } catch (err) {
    console.warn('Logout request error:', err.message);
  } finally {
    setAuthToken(null);
    setCurrentUser(null);
  }
}

export async function getRegisterStatus() {
  try {
    const res = await fetchApi('/auth/register-status');
    return res;
  } catch (err) {
    console.warn('Could not check register status:', err.message);
    return { success: false, canRegister: false };
  }
}

export async function updateAccountSettings(data) {
  const res = await fetchApi('/auth/settings', {
    method: 'PUT',
    body: JSON.stringify(data),
  });
  if (res.success && res.user) {
    setCurrentUser(res.user);
    if (res.token) setAuthToken(res.token);
  }
  return res;
}

