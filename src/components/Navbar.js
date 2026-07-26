import { getCurrentUser, logoutUser } from '../utils/api.js';

export function renderNavbar(activeRoute, navigate) {
  const currentUser = getCurrentUser();

  const isPerformanceActive = activeRoute === 'dashboard' || activeRoute === 'history';
  const isSecurityActive = activeRoute === 'security' || activeRoute === 'logs';

  return `
    <nav class="navbar">
      <div class="container navbar-container">
        <div class="navbar-brand" id="brand-link">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="2" y="2" width="20" height="8" rx="2" ry="2"></rect>
            <rect x="2" y="14" width="20" height="8" rx="2" ry="2"></rect>
            <line x1="6" y1="6" x2="6.01" y2="6"></line>
            <line x1="6" y1="18" x2="6.01" y2="18"></line>
          </svg>
          <span>Ubuntu Sentinel</span>
          <span class="brand-badge">v1.0</span>
        </div>

        <ul class="navbar-menu">
          <li>
            <a class="nav-link ${activeRoute === 'landing' ? 'active' : ''}" data-route="landing">Overview</a>
          </li>

          <!-- Performance Dropdown -->
          <li class="nav-dropdown">
            <a class="nav-link ${isPerformanceActive ? 'active' : ''}">
              Performance ▾
            </a>
            <div class="dropdown-menu">
              <a class="dropdown-item ${activeRoute === 'dashboard' ? 'active' : ''}" data-route="dashboard">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline></svg>
                Realtime Live Gauges
              </a>
              <a class="dropdown-item ${activeRoute === 'history' ? 'active' : ''}" data-route="history">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="20" x2="18" y2="10"></line><line x1="12" y1="20" x2="12" y2="4"></line><line x1="6" y1="20" x2="6" y2="14"></line></svg>
                Analytics History (30d)
              </a>
            </div>
          </li>

          <!-- Security & Logs Dropdown -->
          <li class="nav-dropdown">
            <a class="nav-link ${isSecurityActive ? 'active' : ''}">
              Security & Logs ▾
            </a>
            <div class="dropdown-menu">
              <a class="dropdown-item ${activeRoute === 'security' ? 'active' : ''}" data-route="security">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>
                Threats & Anomaly Alerts
              </a>
              <a class="dropdown-item ${activeRoute === 'logs' ? 'active' : ''}" data-route="logs">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="4 17 10 11 4 5"></polyline><line x1="12" y1="19" x2="20" y2="19"></line></svg>
                Live HTTP Log Stream
              </a>
            </div>
          </li>
        </ul>

        <div class="navbar-right">
          <div class="status-indicator">
            <div id="live-status-dot" class="status-dot"></div>
            <span id="live-status-text">LIVE</span>
          </div>

          ${
            currentUser
              ? `
            <span class="mono" style="font-size: 0.85rem; color: var(--text-muted); cursor: pointer;" data-route="settings" title="Account Settings">${currentUser.username}</span>
            <button class="btn btn-secondary btn-sm ${activeRoute === 'settings' ? 'active' : ''}" data-route="settings" id="settings-btn">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="3"></circle>
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
              </svg>
              Settings
            </button>
            <button class="btn btn-secondary btn-sm" id="logout-btn">Logout</button>
          `
              : `
            <button class="btn btn-secondary btn-sm" data-route="login">Login</button>
            <button class="btn btn-primary btn-sm" data-route="register">Register</button>
          `
          }
        </div>
      </div>
    </nav>
  `;
}

export function bindNavbarEvents(navigate) {
  document.querySelectorAll('[data-route]').forEach((el) => {
    el.addEventListener('click', (e) => {
      e.preventDefault();
      const route = el.getAttribute('data-route');
      navigate(route);
    });
  });

  const brandLink = document.getElementById('brand-link');
  if (brandLink) {
    brandLink.addEventListener('click', () => navigate('landing'));
  }

  const logoutBtn = document.getElementById('logout-btn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      await logoutUser();
      navigate('login');
    });
  }
}
