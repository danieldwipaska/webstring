import { fetchApi, setAuthToken, setCurrentUser } from '../utils/api.js';

export function renderLoginPage(navigate) {
  return `
    <div class="container" style="max-width: 440px; padding-top: 4rem;">
      <div class="card">
        <div class="card-header">
          <div class="card-title">Login to Ubuntu Sentinel</div>
        </div>
        <form id="login-form">
          <div id="login-alert" style="display: none; padding: 0.6rem; margin-bottom: 1rem; border-radius: var(--radius-sm); font-size: 0.85rem; background-color: #450a0a; color: #fca5a5; border: 1px solid #991b1b;"></div>

          <div class="form-group">
            <label class="form-label" for="emailOrUsername">Username or Email</label>
            <input type="text" id="emailOrUsername" class="form-input" placeholder="admin" required />
          </div>

          <div class="form-group">
            <label class="form-label" for="password">Password</label>
            <input type="password" id="password" class="form-input" placeholder="••••••••" required />
          </div>

          <button type="submit" class="btn btn-primary" style="width: 100%; margin-top: 0.5rem;" id="login-submit-btn">Login</button>
        </form>
        <div style="margin-top: 1.25rem; font-size: 0.85rem; color: var(--text-muted); text-align: center;">
          Don't have an admin account? <a href="#" id="link-to-register">Register here</a>
        </div>
      </div>
    </div>
  `;
}

export function initLoginPage(navigate) {
  const form = document.getElementById('login-form');
  const alertEl = document.getElementById('login-alert');
  const registerLink = document.getElementById('link-to-register');

  if (registerLink) {
    registerLink.onclick = (e) => {
      e.preventDefault();
      navigate('register');
    };
  }

  if (form) {
    form.onsubmit = async (e) => {
      e.preventDefault();
      const emailOrUsername = document.getElementById('emailOrUsername').value.trim();
      const password = document.getElementById('password').value;
      const submitBtn = document.getElementById('login-submit-btn');

      if (!emailOrUsername || !password) return;

      submitBtn.disabled = true;
      submitBtn.textContent = 'Verifying...';
      if (alertEl) alertEl.style.display = 'none';

      try {
        const res = await fetchApi('/auth/login', {
          method: 'POST',
          body: JSON.stringify({ emailOrUsername, password }),
        });

        if (res.success) {
          setAuthToken(res.token);
          setCurrentUser(res.user);
          navigate('dashboard');
        } else {
          throw new Error(res.message || 'Login failed');
        }
      } catch (err) {
        if (alertEl) {
          alertEl.textContent = err.message || 'Invalid login credentials.';
          alertEl.style.display = 'block';
        }
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Login';
      }
    };
  }
}
