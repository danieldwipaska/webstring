import { fetchApi, getRegisterStatus, setAuthToken, setCurrentUser } from '../utils/api.js';

export function renderRegisterPage(navigate) {
  return `
    <div class="container" style="max-width: 460px; padding-top: 4rem;">
      <div class="card">
        <div class="card-header">
          <div class="card-title">Register Administrator Account</div>
        </div>
        
        <!-- Registration Disabled Message Container -->
        <div id="registration-disabled-container" style="display: none; padding: 1rem 0; text-align: center;">
          <div style="padding: 0.8rem 1rem; border-radius: var(--radius-md); background-color: #451a03; color: #fdba74; border: 1px solid #9a3412; font-size: 0.9rem; margin-bottom: 1.5rem; text-align: left;">
            🔒 <strong>Registration Closed:</strong> This system is configured strictly for a <strong>Single Administrator</strong>. An administrator account is already registered in the system.
          </div>
          <p style="font-size: 0.875rem; color: var(--text-muted); margin-bottom: 1.5rem;">
            Please log in using the existing administrator credentials to access the telemetry dashboard.
          </p>
          <button class="btn btn-primary" id="btn-go-login" style="width: 100%;">Go to Login Page</button>
        </div>

        <form id="register-form">
          <div id="register-alert" style="display: none; padding: 0.6rem; margin-bottom: 1rem; border-radius: var(--radius-sm); font-size: 0.85rem; background-color: #450a0a; color: #fca5a5; border: 1px solid #991b1b;"></div>

          <div class="form-group">
            <label class="form-label" for="username">Username</label>
            <input type="text" id="username" class="form-input" placeholder="sysadmin" required />
          </div>

          <div class="form-group">
            <label class="form-label" for="email">Email Address</label>
            <input type="email" id="email" class="form-input" placeholder="admin@example.com" required />
          </div>

          <div class="form-group">
            <label class="form-label" for="password">Password</label>
            <input type="password" id="password" class="form-input" placeholder="At least 6 characters" required minlength="6" />
          </div>

          <button type="submit" class="btn btn-primary" style="width: 100%; margin-top: 0.5rem;" id="register-submit-btn">Create Account</button>
        </form>
        
        <div id="login-link-footer" style="margin-top: 1.25rem; font-size: 0.85rem; color: var(--text-muted); text-align: center;">
          Already have an account? <a href="#" id="link-to-login">Login here</a>
        </div>
      </div>
    </div>
  `;
}

export async function initRegisterPage(navigate) {
  const form = document.getElementById('register-form');
  const alertEl = document.getElementById('register-alert');
  const loginLink = document.getElementById('link-to-login');
  const disabledContainer = document.getElementById('registration-disabled-container');
  const loginLinkFooter = document.getElementById('login-link-footer');
  const btnGoLogin = document.getElementById('btn-go-login');

  if (loginLink) {
    loginLink.onclick = (e) => {
      e.preventDefault();
      navigate('login');
    };
  }

  if (btnGoLogin) {
    btnGoLogin.onclick = () => {
      navigate('login');
    };
  }

  // Check backend single user registration status
  try {
    const status = await getRegisterStatus();
    if (status.success && !status.canRegister) {
      if (form) form.style.display = 'none';
      if (loginLinkFooter) loginLinkFooter.style.display = 'none';
      if (disabledContainer) disabledContainer.style.display = 'block';
      return;
    }
  } catch (err) {
    console.warn('Register status check failed:', err);
  }

  if (form) {
    form.onsubmit = async (e) => {
      e.preventDefault();
      const username = document.getElementById('username').value.trim();
      const email = document.getElementById('email').value.trim();
      const password = document.getElementById('password').value;
      const submitBtn = document.getElementById('register-submit-btn');

      submitBtn.disabled = true;
      submitBtn.textContent = 'Processing...';
      if (alertEl) alertEl.style.display = 'none';

      try {
        const res = await fetchApi('/auth/register', {
          method: 'POST',
          body: JSON.stringify({ username, email, password }),
        });

        if (res.success) {
          setAuthToken(res.token);
          setCurrentUser(res.user);
          navigate('dashboard');
        } else {
          throw new Error(res.message || 'Registration failed');
        }
      } catch (err) {
        if (alertEl) {
          alertEl.textContent = err.message || 'Failed to create account.';
          alertEl.style.display = 'block';
        }
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Create Account';
      }
    };
  }
}

