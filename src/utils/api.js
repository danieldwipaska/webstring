const API_BASE = '/api';

export function getCurrentUser() {
  const raw = localStorage.getItem('user');
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    localStorage.removeItem('user');
    return null;
  }
}

export function setCurrentUser(user) {
  if (user) {
    localStorage.setItem('user', JSON.stringify(user));
  } else {
    localStorage.removeItem('user');
  }
}

export async function fetchApi(endpoint, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };

  try {
    const response = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers,
      credentials: 'include', // Strictly use HttpOnly cookies for auth
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
    setCurrentUser(null);
    return null;
  } catch {
    setCurrentUser(null);
    return null;
  }
}

export async function logoutUser() {
  try {
    await fetchApi('/auth/logout', { method: 'POST' });
  } catch (err) {
    console.warn('Logout request error:', err.message);
  } finally {
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
  }
  return res;
}
