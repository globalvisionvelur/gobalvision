import {
  initStore,
  getUrgentConnections,
  getAlertTiers,
  getMonthlyBillingSummary,
  getConnections,
} from './store.js';
import { renderLogin, getSession, clearSession, getCurrentUser } from './auth.js';
import { renderDashboard } from './dashboard.js';
import { renderBillingDashboard, openRecordPaymentModal } from './billing.js';
import {
  renderConnections,
  openModal,
  resetConnectionFilters,
  openCustomerDrawer,
} from './connections.js';
import { renderLogs } from './logs.js';
import { renderSettings } from './settings.js';
import {
  getSupabaseConfig,
  saveSupabaseConfig,
  isSupabaseConfigured,
  testSupabaseConnection,
} from './supabase.js';
import { ICONS, showToast, escapeHtml, currentMonthISO, formatDate } from './utils.js';

let currentView = 'dashboard';

// Theme Controller
function initTheme() {
  const savedTheme = localStorage.getItem('gv_theme') || 'dark';
  setTheme(savedTheme);
}

function setTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('gv_theme', theme);
  const themeBtn = document.getElementById('theme-toggle-btn');
  if (themeBtn) {
    themeBtn.innerHTML = theme === 'dark' ? ICONS.sun : ICONS.moon;
    themeBtn.title = theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode';
  }
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') || 'dark';
  setTheme(current === 'dark' ? 'light' : 'dark');
}

export async function initApp() {
  initTheme();
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
    globalAddBtn.onclick = () => openModal(null, () => navigateTo(currentView));
  }

  const themeBtn = document.getElementById('theme-toggle-btn');
  if (themeBtn) {
    const current = document.documentElement.getAttribute('data-theme') || 'dark';
    themeBtn.innerHTML = current === 'dark' ? ICONS.sun : ICONS.moon;
    themeBtn.title = current === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode';
    themeBtn.onclick = toggleTheme;
  }

  setupGlobalSearch();

  const alertPill = document.getElementById('quick-alert-pill');
  if (alertPill) {
    alertPill.onclick = async () => {
      await navigateTo('connections');
      const tiers = await getAlertTiers();
      const filterUrgency = document.getElementById('filter-urgency');
      if (filterUrgency && tiers.length) {
        filterUrgency.value = tiers[0].id;
        filterUrgency.dispatchEvent(new Event('change'));
      }
    };
  }

  const topbarLogoutBtn = document.getElementById('topbar-logout-btn');
  if (topbarLogoutBtn) {
    topbarLogoutBtn.onclick = handleLogout;
  }
}

async function renderSidebar(user) {
  const sidebar = document.getElementById('sidebar');
  const [urgentConns, billingSummary] = await Promise.all([
    getUrgentConnections(),
    getMonthlyBillingSummary(currentMonthISO()),
  ]);
  const urgentCount = urgentConns.length;
  const pendingBillsCount = billingSummary?.pendingCount || 0;

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

      <a href="#" class="nav-link ${currentView === 'billing' ? 'active' : ''}" data-view="billing">
        <div class="nav-link-left">
          ${ICONS.receipt}
          <span>Billing & Payments</span>
        </div>
        ${pendingBillsCount > 0 ? `<span class="nav-badge-count" style="background: var(--warning); color: #fff;">${pendingBillsCount}</span>` : ''}
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
      if (link.dataset.view === 'connections') resetConnectionFilters();
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
    <a href="#" class="mobile-tab-btn ${currentView === 'billing' ? 'active' : ''}" data-view="billing">
      ${ICONS.receipt}
      <span>Billing</span>
    </a>
    <a href="#" class="mobile-tab-btn ${currentView === 'connections' ? 'active' : ''}" data-view="connections">
      ${ICONS.connections}
      <span>Subscribers</span>
    </a>
    <a href="#" class="mobile-tab-btn" id="mobile-add-btn" style="color: var(--accent);">
      ${ICONS.plus}
      <span>Add</span>
    </a>
    <a href="#" class="mobile-tab-btn ${currentView === 'settings' ? 'active' : ''}" data-view="settings">
      ${ICONS.settings}
      <span>Settings</span>
    </a>
  `;

  nav.querySelectorAll('.mobile-tab-btn[data-view]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      if (btn.dataset.view === 'connections') resetConnectionFilters();
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
    case 'billing':
      await renderBillingDashboard(async () => {
        const user = await getCurrentUser();
        if (user) await renderSidebar(user);
      });
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

// ═════════════════════════════════════════════════════════════
// GLOBAL QUICK SEARCH CONTROLLER (Cmd+K / /)
// ═════════════════════════════════════════════════════════════
function setupGlobalSearch() {
  const searchBtn = document.getElementById('top-search-btn');
  if (searchBtn) {
    searchBtn.onclick = () => openQuickSearchModal();
  }

  window.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault();
      openQuickSearchModal();
    } else if (e.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) {
      e.preventDefault();
      openQuickSearchModal();
    } else if (e.key === 'Escape') {
      closeQuickSearchModal();
    }
  });
}

async function openQuickSearchModal() {
  const modal = document.getElementById('quick-search-modal');
  if (!modal) return;

  modal.innerHTML = `
    <div class="modal-backdrop" id="qs-backdrop"></div>
    <div class="modal-content quick-search-palette" style="max-width: 580px; padding: 0; overflow: hidden; border-radius: var(--radius-lg);">
      <div class="qs-input-wrap" style="display: flex; align-items: center; gap: 10px; padding: 14px 18px; border-bottom: 1px solid var(--border-subtle); background: var(--bg-surface);">
        <span style="color: var(--text-muted);">${ICONS.search}</span>
        <input type="text" id="qs-input" placeholder="Search by name, phone, box no, address, notes..." style="border: none; outline: none; background: transparent; width: 100%; font-size: 15px; color: var(--text-primary); font-family: inherit;" autofocus />
        <kbd class="search-kbd-hint" style="font-size: 11px;">ESC</kbd>
      </div>
      <div id="qs-results" class="qs-results-container" style="max-height: 380px; overflow-y: auto; padding: 8px;">
        <div style="padding: 24px; text-align: center; color: var(--text-muted); font-size: 13px;">Type to search subscribers…</div>
      </div>
    </div>
  `;

  modal.classList.remove('hidden');
  const input = document.getElementById('qs-input');
  if (input) input.focus();

  document.getElementById('qs-backdrop').onclick = closeQuickSearchModal;

  const allConnections = await getConnections();

  input.addEventListener('input', (e) => {
    const q = e.target.value.trim().toLowerCase();
    const resultsEl = document.getElementById('qs-results');
    if (!q) {
      resultsEl.innerHTML = `<div style="padding: 24px; text-align: center; color: var(--text-muted); font-size: 13px;">Type to search subscribers…</div>`;
      return;
    }

    const matches = allConnections
      .filter((c) => {
        const name = (c.customer_name || '').toLowerCase();
        const phone = (c.phone || '').toLowerCase();
        const prov = (c.provider || '').toLowerCase();
        const notes = (c.notes || '').toLowerCase();
        return name.includes(q) || phone.includes(q) || prov.includes(q) || notes.includes(q);
      })
      .slice(0, 8);

    if (matches.length === 0) {
      resultsEl.innerHTML = `<div style="padding: 24px; text-align: center; color: var(--text-muted); font-size: 13px;">No subscribers found matching "${escapeHtml(q)}"</div>`;
      return;
    }

    resultsEl.innerHTML = matches
      .map(
        (c) => `
      <div class="qs-result-item" data-id="${c.id}" style="display: flex; justify-content: space-between; align-items: center; padding: 10px 12px; border-radius: var(--radius-sm); cursor: pointer; transition: background 0.15s; margin-bottom: 4px; border: 1px solid var(--border-subtle);">
        <div>
          <div style="font-weight: 700; color: var(--text-primary); font-size: 14px;">${escapeHtml(c.customer_name)}</div>
          <div style="font-size: 12px; color: var(--text-muted); display: flex; align-items: center; gap: 8px; margin-top: 3px; flex-wrap: wrap;">
            <span>${escapeHtml(c.phone || 'No phone')}</span>
            <span>&bull;</span>
            <span class="provider-tag" style="font-size: 10px; padding: 1px 6px;">${escapeHtml(c.provider)} (${escapeHtml(c.connection_type)})</span>
            <span>&bull;</span>
            <span>Exp: ${formatDate(c.expiry_date)}</span>
          </div>
        </div>
        <div style="display: flex; gap: 6px; align-items: center;">
          <button type="button" class="btn btn-sm btn-ghost qs-view-btn" data-id="${c.id}" title="Customer 360° Drawer">
            360° Profile
          </button>
          <button type="button" class="btn btn-sm btn-primary qs-pay-btn" data-id="${c.id}" data-name="${escapeHtml(c.customer_name)}" data-phone="${escapeHtml(c.phone || '')}" data-provider="${escapeHtml(c.provider)}" data-type="${escapeHtml(c.connection_type)}" title="Record Payment">
            💰 Settle
          </button>
        </div>
      </div>
    `
      )
      .join('');

    resultsEl.querySelectorAll('.qs-result-item').forEach((row) => {
      row.onclick = (e) => {
        if (e.target.closest('.qs-pay-btn') || e.target.closest('.qs-view-btn')) return;
        closeQuickSearchModal();
        openCustomerDrawer(row.dataset.id, () => navigateTo(currentView));
      };
    });

    resultsEl.querySelectorAll('.qs-view-btn').forEach((btn) => {
      btn.onclick = () => {
        closeQuickSearchModal();
        openCustomerDrawer(btn.dataset.id, () => navigateTo(currentView));
      };
    });

    resultsEl.querySelectorAll('.qs-pay-btn').forEach((btn) => {
      btn.onclick = () => {
        closeQuickSearchModal();
        openRecordPaymentModal({
          connectionId: btn.dataset.id,
          customerName: btn.dataset.name,
          phone: btn.dataset.phone,
          provider: btn.dataset.provider,
          connectionType: btn.dataset.type,
          status: 'Paid',
          onSaved: () => navigateTo(currentView),
        });
      };
    });
  });
}

function closeQuickSearchModal() {
  const modal = document.getElementById('quick-search-modal');
  if (modal) {
    modal.classList.add('hidden');
    modal.innerHTML = '';
  }
}

document.addEventListener('DOMContentLoaded', initApp);
