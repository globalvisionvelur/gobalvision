/**
 * Main application controller — SPA router, sidebar navigation, top bar controls.
 */
import { initStore, getUrgentConnections, getAlertTiers } from './store.js';
import { renderLogin, getSession, clearSession, getCurrentUser } from './auth.js';
import { renderDashboard } from './dashboard.js';
import { renderConnections, openModal } from './connections.js';
import { renderLogs } from './logs.js';
import { renderSettings } from './settings.js';
import { getSupabaseConfig, saveSupabaseConfig, isSupabaseConfigured, testSupabaseConnection } from './supabase.js';
import { ICONS, showToast, escapeHtml } from './utils.js';

let currentView = 'dashboard';

export async function initApp() {
  if (!isSupabaseConfigured()) {
    renderConnectScreen();
    return;
  }
  await bootstrapAndShowLogin();
}

async function bootstrapAndShowLogin() {
  const loginScreen = document.getElementById('login-screen');
  loginScreen.classList.remove('hidden');
  document.getElementById('main-app').classList.add('hidden');
  loginScreen.innerHTML = `<div class="auth-card" style="align-items: center; justify-content: center; min-height: 320px;"><p style="color: var(--text-muted); font-size: 13px;">Connecting to Supabase…</p></div>`;

  const result = await initStore();
  if (!result.ok) {
    renderConnectScreen(result.message);
    return;
  }

  const session = getSession();
  if (session) {
    const user = await getCurrentUser();
    if (user) {
      await showMainApp(user);
      return;
    }
  }

  showLoginScreen();
}

function renderConnectScreen(errorMessage = '') {
  const loginScreen = document.getElementById('login-screen');
  document.getElementById('main-app').classList.add('hidden');
  loginScreen.classList.remove('hidden');

  const cfg = getSupabaseConfig();

  loginScreen.innerHTML = `
    <div class="auth-card" style="max-width: 420px;">
      <div class="auth-header">
        <div class="auth-logo-badge">
          <span class="auth-logo-dot"></span>
          <span class="auth-logo-text">GlobalVision</span>
        </div>
        <h1 class="auth-title">Connect to Supabase</h1>
        <p class="auth-subtitle">This app stores everything in Supabase — connect your project to continue.</p>
      </div>

      <div id="connect-error" class="auth-error-msg ${errorMessage ? '' : 'hidden'}" style="text-align: left; margin-bottom: ${errorMessage ? '10px' : '0'};">${errorMessage}</div>

      <form id="connect-form" style="width: 100%;" autocomplete="off">
        <div class="form-group">
          <label for="connect-url">Project URL</label>
          <input type="url" id="connect-url" placeholder="https://your-project.supabase.co" value="${cfg.url || ''}" required />
        </div>
        <div class="form-group">
          <label for="connect-key">Publishable / Anon API Key</label>
          <input type="password" id="connect-key" placeholder="sb_publishable_..." value="${cfg.anonKey || ''}" required />
        </div>
        <button type="submit" class="btn btn-primary btn-full" id="connect-submit-btn">Connect</button>
      </form>
    </div>
  `;

  const errorEl = document.getElementById('connect-error');
  const submitBtn = document.getElementById('connect-submit-btn');

  document.getElementById('connect-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const url = document.getElementById('connect-url').value.trim();
    const anonKey = document.getElementById('connect-key').value.trim();

    submitBtn.disabled = true;
    submitBtn.textContent = 'Connecting…';
    errorEl.classList.add('hidden');

    const test = await testSupabaseConnection(url, anonKey);
    if (!test.success) {
      errorEl.textContent = test.message || 'Could not connect. Check the URL and key.';
      errorEl.classList.remove('hidden');
      submitBtn.disabled = false;
      submitBtn.textContent = 'Connect';
      return;
    }

    saveSupabaseConfig({ url, anonKey, enabled: true });
    await bootstrapAndShowLogin();
  });
}

function showLoginScreen() {
  document.getElementById('login-screen').classList.remove('hidden');
  document.getElementById('main-app').classList.add('hidden');

  renderLogin((user) => {
    showMainApp(user);
  });
}

async function showMainApp(user) {
  document.getElementById('login-screen').classList.add('hidden');
  document.getElementById('main-app').classList.remove('hidden');

  await renderSidebar(user);
  renderMobileNav();
  setupTopBar();
  await navigateTo('dashboard');
}

function setupTopBar() {
  const globalAddBtn = document.getElementById('global-add-btn');
  if (globalAddBtn) {
    // Refresh whatever view we're on — adding from the Dashboard would otherwise
    // leave its counts and queue stale.
    globalAddBtn.onclick = () => openModal(null, () => navigateTo(currentView));
  }

  const alertPill = document.getElementById('quick-alert-pill');
  if (alertPill) {
    alertPill.onclick = async () => {
      await navigateTo('connections');
      // Tier ids are user data, not constants — resolve the most urgent one
      // rather than assuming a tier still has the seeded id 'critical'.
      const tiers = await getAlertTiers();
      const filterUrgency = document.getElementById('filter-urgency');
      if (filterUrgency && tiers.length) {
        filterUrgency.value = tiers[0].id;
        filterUrgency.dispatchEvent(new Event('change'));
      }
    };
  }
}

async function renderSidebar(user) {
  const sidebar = document.getElementById('sidebar');
  const urgentCount = (await getUrgentConnections()).length;

  sidebar.innerHTML = `
    <div class="sidebar-brand-box">
      <div class="brand-icon-box">GV</div>
      <div>
        <div class="brand-name">GlobalVision</div>
        <div class="brand-tag">SUBSCRIBER MANAGER</div>
      </div>
    </div>

    <nav class="sidebar-nav">
      <a href="#" class="nav-link ${currentView === 'dashboard' ? 'active' : ''}" data-view="dashboard">
        <div class="nav-link-left">
          ${ICONS.dashboard}
          <span>Dashboard</span>
        </div>
        ${urgentCount > 0 ? `<span class="nav-badge-count">${urgentCount}</span>` : ''}
      </a>

      <a href="#" class="nav-link ${currentView === 'connections' ? 'active' : ''}" data-view="connections">
        <div class="nav-link-left">
          ${ICONS.connections}
          <span>Subscribers</span>
        </div>
      </a>

      <a href="#" class="nav-link ${currentView === 'logs' ? 'active' : ''}" data-view="logs">
        <div class="nav-link-left">
          ${ICONS.clock}
          <span>Logs</span>
        </div>
      </a>

      <a href="#" class="nav-link ${currentView === 'settings' ? 'active' : ''}" data-view="settings">
        <div class="nav-link-left">
          ${ICONS.settings}
          <span>Settings</span>
        </div>
      </a>
    </nav>

    <div class="sidebar-footer-box">
      <div class="sidebar-user-info">
        <span class="user-avatar-badge">${escapeHtml(user.name.charAt(0).toUpperCase())}</span>
        <span class="user-text-name">${escapeHtml(user.name)}</span>
      </div>
      <button type="button" class="icon-btn icon-btn-danger" id="sidebar-logout-btn" title="Sign Out">
        ${ICONS.logout}
      </button>
    </div>
  `;

  // Attach nav handlers
  sidebar.querySelectorAll('.nav-link').forEach((link) => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      navigateTo(link.dataset.view);
    });
  });

  // Logout
  document.getElementById('sidebar-logout-btn').addEventListener('click', handleLogout);
}

function renderMobileNav() {
  const nav = document.getElementById('mobile-nav');

  nav.innerHTML = `
    <a href="#" class="mobile-tab-btn ${currentView === 'dashboard' ? 'active' : ''}" data-view="dashboard">
      ${ICONS.dashboard}
      <span>Home</span>
    </a>
    <a href="#" class="mobile-tab-btn ${currentView === 'connections' ? 'active' : ''}" data-view="connections">
      ${ICONS.connections}
      <span>Subscribers</span>
    </a>
    <a href="#" class="mobile-tab-btn" id="mobile-add-btn" style="color: var(--accent);">
      ${ICONS.plus}
      <span>Add</span>
    </a>
    <a href="#" class="mobile-tab-btn ${currentView === 'logs' ? 'active' : ''}" data-view="logs">
      ${ICONS.clock}
      <span>Logs</span>
    </a>
    <a href="#" class="mobile-tab-btn ${currentView === 'settings' ? 'active' : ''}" data-view="settings">
      ${ICONS.settings}
      <span>Settings</span>
    </a>
  `;

  nav.querySelectorAll('.mobile-tab-btn[data-view]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      navigateTo(btn.dataset.view);
    });
  });

  document.getElementById('mobile-add-btn').addEventListener('click', (e) => {
    e.preventDefault();
    openModal(null, () => navigateTo(currentView));
  });
}

async function navigateTo(view) {
  currentView = view;

  // Update nav active states
  document.querySelectorAll('.nav-link').forEach((l) => {
    l.classList.toggle('active', l.dataset.view === view);
  });
  document.querySelectorAll('.mobile-tab-btn[data-view]').forEach((b) => {
    b.classList.toggle('active', b.dataset.view === view);
  });

  // Toggle view visibility
  document.querySelectorAll('#content > .view').forEach((v) => {
    v.classList.add('hidden');
  });

  const target = document.getElementById(`${view}-view`);
  if (target) target.classList.remove('hidden');

  // Render view content
  switch (view) {
    case 'dashboard':
      await renderDashboard(
        () => openModal(),
        (targetId) => {
          navigateTo('connections');
        },
        async () => {
          const user = await getCurrentUser();
          if (user) await renderSidebar(user);
        }
      );
      break;
    case 'connections':
      await renderConnections(async () => {
        const user = await getCurrentUser();
        if (user) await renderSidebar(user);
      });
      break;
    case 'logs':
      await renderLogs();
      break;
    case 'settings':
      await renderSettings();
      break;
  }
}

function handleLogout() {
  clearSession();
  showToast('Logged out', 'success');
  showLoginScreen();
}

document.addEventListener('DOMContentLoaded', initApp);
