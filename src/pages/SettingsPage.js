import { getCurrentUser, updateAccountSettings } from '../utils/api.js';

export function renderSettingsPage() {
  const currentUser = getCurrentUser() || {};

  return `
    <div class="container" style="max-width: 680px; padding-top: 2rem; padding-bottom: 3rem;">
      <div class="page-header" style="margin-bottom: 1.5rem;">
        <h1 class="page-title">Account Settings</h1>
        <p class="page-subtitle">Kelola informasi akun administrator dan kredensial akses server monitor Anda.</p>
      </div>

      <div id="settings-alert" style="display: none; padding: 0.8rem 1rem; margin-bottom: 1.5rem; border-radius: var(--radius-md); font-size: 0.9rem;"></div>

      <!-- Account Info Overview Card -->
      <div class="card" style="margin-bottom: 1.5rem;">
        <div class="card-header">
          <div class="card-title">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
              <circle cx="12" cy="7" r="4"></circle>
            </svg>
            Profil Akun Administrator
          </div>
          <span class="severity-badge severity-low">Aktif</span>
        </div>
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; font-size: 0.9rem;">
          <div>
            <div style="color: var(--text-muted); font-size: 0.8rem; margin-bottom: 0.2rem;">Username Saat Ini</div>
            <div class="mono" style="font-weight: 600;" id="display-current-username">${currentUser.username || '-'}</div>
          </div>
          <div>
            <div style="color: var(--text-muted); font-size: 0.8rem; margin-bottom: 0.2rem;">Email Registered</div>
            <div class="mono" style="font-weight: 600;">${currentUser.email || '-'}</div>
          </div>
          <div>
            <div style="color: var(--text-muted); font-size: 0.8rem; margin-bottom: 0.2rem;">Peran (Role)</div>
            <div class="mono" style="font-weight: 600; text-transform: uppercase; color: var(--color-accent);">${currentUser.role || 'admin'}</div>
          </div>
        </div>
      </div>

      <!-- Edit Username Card -->
      <div class="card" style="margin-bottom: 1.5rem;">
        <div class="card-header">
          <div class="card-title">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
            </svg>
            Ubah Username
          </div>
        </div>
        <form id="update-username-form">
          <div class="form-group">
            <label class="form-label" for="new-username">Username Baru</label>
            <input type="text" id="new-username" class="form-input" value="${currentUser.username || ''}" required placeholder="Masukkan username baru" />
          </div>
          <button type="submit" class="btn btn-primary" id="btn-save-username">Perbarui Username</button>
        </form>
      </div>

      <!-- Edit Password Card -->
      <div class="card">
        <div class="card-header">
          <div class="card-title">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
            </svg>
            Ubah Password
          </div>
        </div>
        <form id="update-password-form">
          <div class="form-group">
            <label class="form-label" for="current-password">Password Saat Ini (Opsional / Konfirmasi)</label>
            <input type="password" id="current-password" class="form-input" placeholder="Masukkan password saat ini" />
          </div>
          <div class="form-group">
            <label class="form-label" for="new-password">Password Baru</label>
            <input type="password" id="new-password" class="form-input" placeholder="Minimal 6 karakter" required minlength="6" />
          </div>
          <div class="form-group">
            <label class="form-label" for="confirm-password">Konfirmasi Password Baru</label>
            <input type="password" id="confirm-password" class="form-input" placeholder="Ketik ulang password baru" required minlength="6" />
          </div>
          <button type="submit" class="btn btn-primary" id="btn-save-password">Perbarui Password</button>
        </form>
      </div>
    </div>
  `;
}

export function initSettingsPage(navigate) {
  const alertEl = document.getElementById('settings-alert');
  const usernameForm = document.getElementById('update-username-form');
  const passwordForm = document.getElementById('update-password-form');

  function showAlert(message, isError = false) {
    if (!alertEl) return;
    alertEl.style.display = 'block';
    if (isError) {
      alertEl.style.backgroundColor = '#450a0a';
      alertEl.style.color = '#fca5a5';
      alertEl.style.border = '1px solid #991b1b';
      alertEl.innerHTML = `⚠️ ${message}`;
    } else {
      alertEl.style.backgroundColor = '#064e3b';
      alertEl.style.color = '#6ee7b7';
      alertEl.style.border = '1px solid #065f46';
      alertEl.innerHTML = `✅ ${message}`;
    }
  }

  function hideAlert() {
    if (alertEl) alertEl.style.display = 'none';
  }

  // Handle Username Submit
  if (usernameForm) {
    usernameForm.onsubmit = async (e) => {
      e.preventDefault();
      hideAlert();
      const newUsername = document.getElementById('new-username').value.trim();
      const submitBtn = document.getElementById('btn-save-username');

      if (!newUsername) {
        showAlert('Username tidak boleh kosong.', true);
        return;
      }

      submitBtn.disabled = true;
      submitBtn.textContent = 'Menyimpan...';

      try {
        const res = await updateAccountSettings({ username: newUsername });
        if (res.success) {
          showAlert(res.message || 'Username berhasil diperbarui.');
          const displayUser = document.getElementById('display-current-username');
          if (displayUser) displayUser.textContent = newUsername;
        } else {
          throw new Error(res.message || 'Gagal memperbarui username.');
        }
      } catch (err) {
        showAlert(err.message || 'Gagal memperbarui username.', true);
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Perbarui Username';
      }
    };
  }

  // Handle Password Submit
  if (passwordForm) {
    passwordForm.onsubmit = async (e) => {
      e.preventDefault();
      hideAlert();
      const currentPassword = document.getElementById('current-password').value;
      const newPassword = document.getElementById('new-password').value;
      const confirmPassword = document.getElementById('confirm-password').value;
      const submitBtn = document.getElementById('btn-save-password');

      if (newPassword !== confirmPassword) {
        showAlert('Konfirmasi password tidak cocok dengan password baru.', true);
        return;
      }

      if (newPassword.length < 6) {
        showAlert('Password baru minimal 6 karakter.', true);
        return;
      }

      submitBtn.disabled = true;
      submitBtn.textContent = 'Menyimpan...';

      try {
        const res = await updateAccountSettings({ currentPassword, newPassword });
        if (res.success) {
          showAlert(res.message || 'Password berhasil diperbarui.');
          document.getElementById('current-password').value = '';
          document.getElementById('new-password').value = '';
          document.getElementById('confirm-password').value = '';
        } else {
          throw new Error(res.message || 'Gagal memperbarui password.');
        }
      } catch (err) {
        showAlert(err.message || 'Gagal memperbarui password.', true);
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Perbarui Password';
      }
    };
  }
}
