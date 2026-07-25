import { renderNavbar, bindNavbarEvents } from './components/Navbar.js';
import { renderLandingPage, initLandingPage } from './pages/LandingPage.js';
import { renderLoginPage, initLoginPage } from './pages/LoginPage.js';
import { renderRegisterPage, initRegisterPage } from './pages/RegisterPage.js';
import { renderDashboard, initDashboard } from './pages/Dashboard.js';
import { renderHistoryPage, initHistoryPage } from './pages/HistoryPage.js';
import { renderSecurityPage, initSecurityPage } from './pages/SecurityPage.js';
import { renderRealtimeLogsPage, initRealtimeLogsPage } from './pages/RealtimeLogsPage.js';
import { initSocket } from './utils/socket.js';
import { checkAuthStatus } from './utils/api.js';

let currentRoute = 'landing';
let activePageCleanup = null;

const PROTECTED_ROUTES = ['dashboard', 'history', 'security', 'logs'];

async function navigate(route) {
  // Check Authentication & Authorization Guard for protected pages
  if (PROTECTED_ROUTES.includes(route)) {
    const authenticatedUser = await checkAuthStatus();
    if (!authenticatedUser) {
      console.warn(`[Auth Guard] Access denied to route '${route}'. Redirecting to login.`);
      currentRoute = 'login';
      renderPage('login', 'Please log in first to access the server telemetry dashboard.');
      return;
    }
  }

  currentRoute = route;
  renderPage(route);
}

function renderPage(route, authNoticeMessage = null) {
  // Cleanup active page subscriptions (socket listeners, timers)
  if (activePageCleanup && typeof activePageCleanup === 'function') {
    activePageCleanup();
    activePageCleanup = null;
  }

  const appEl = document.getElementById('app');
  let pageHTML = '';

  switch (route) {
    case 'landing':
      pageHTML = renderLandingPage(navigate);
      break;
    case 'login':
      pageHTML = renderLoginPage(navigate);
      break;
    case 'register':
      pageHTML = renderRegisterPage(navigate);
      break;
    case 'dashboard':
      pageHTML = renderDashboard();
      break;
    case 'history':
      pageHTML = renderHistoryPage();
      break;
    case 'security':
      pageHTML = renderSecurityPage();
      break;
    case 'logs':
      pageHTML = renderRealtimeLogsPage();
      break;
    default:
      pageHTML = renderLandingPage(navigate);
      break;
  }

  appEl.innerHTML = `
    ${renderNavbar(currentRoute, navigate)}
    <main class="page-content">
      ${
        authNoticeMessage
          ? `<div class="container" style="max-width: 600px; margin-bottom: 1.5rem;">
              <div style="padding: 0.75rem 1rem; border-radius: var(--radius-md); background-color: #451a03; color: #fdba74; border: 1px solid #9a3412; font-size: 0.9rem;">
                ⚠️ ${authNoticeMessage}
              </div>
            </div>`
          : ''
      }
      ${pageHTML}
    </main>
  `;

  bindNavbarEvents(navigate);

  // Initialize active page logic
  switch (route) {
    case 'landing':
      initLandingPage(navigate);
      break;
    case 'login':
      initLoginPage(navigate);
      break;
    case 'register':
      initRegisterPage(navigate);
      break;
    case 'dashboard':
      activePageCleanup = initDashboard();
      break;
    case 'history':
      initHistoryPage(navigate);
      break;
    case 'security':
      activePageCleanup = initSecurityPage(navigate);
      break;
    case 'logs':
      activePageCleanup = initRealtimeLogsPage();
      break;
  }
}

// Initialize Socket.io Connection & Status Indicator Dot
initSocket((isConnected) => {
  const dot = document.getElementById('live-status-dot');
  const text = document.getElementById('live-status-text');

  if (dot) {
    if (isConnected) {
      dot.className = 'status-dot';
      if (text) text.textContent = 'LIVE';
    } else {
      dot.className = 'status-dot offline';
      if (text) text.textContent = 'RECONNECTING';
    }
  }
});

// App Startup
document.addEventListener('DOMContentLoaded', async () => {
  await checkAuthStatus();
  navigate('landing');
});
