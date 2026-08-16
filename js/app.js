/**
 * Main application controller — SPA router, sidebar navigation, top bar controls.
 */
import { initStore, getUrgentConnections } from './store.js';
import { renderLogin, getSession, clearSession, getCurrentUser } from './auth.js';
import { renderDashboard } from './dashboard.js';
import { renderConnections, openModal } from './connections.js';
import { renderSettings } from './settings.js';
import { ICONS, showToast } from './utils.js';

let currentView = 'dashboard';

export async function initApp() {
  await initStore();

  const session = getSession();
  if (session) {
    const user = getCurrentUser();
    if (user) {
      showMainApp(user);
      return;
    }
  }

  showLoginScreen();
}

function showLoginScreen() {
  document.getElementById('login-screen').classList.remove('hidden');
  document.getElementById('main-app').classList.add('hidden');

  renderLogin((user) => {
    showMainApp(user);
  });
}

function showMainApp(user) {
  document.getElementById('login-screen').classList.add('hidden');
  document.getElementById('main-app').classList.remove('hidden');

  renderSidebar(user);
  renderMobileNav();
  setupTopBar();
  navigateTo('dashboard');
}

function setupTopBar() {
  const globalAddBtn = document.getElementById('global-add-btn');
  if (globalAddBtn) {
    globalAddBtn.onclick = () => openModal();
  }

  const alertPill = document.getElementById('quick-alert-pill');
  if (alertPill) {
    alertPill.onclick = () => {
      navigateTo('connections');
      const filterUrgency = document.getElementById('filter-urgency');
      if (filterUrgency) {
        filterUrgency.value = 'critical';
        filterUrgency.dispatchEvent(new Event('change'));
      }
    };
  }
}

function renderSidebar(user) {
  const sidebar = document.getElementById('sidebar');
  const urgentCount = getUrgentConnections().length;

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

      <a href="#" class="nav-link ${currentView === 'settings' ? 'active' : ''}" data-view="settings">
        <div class="nav-link-left">
          ${ICONS.settings}
          <span>Settings</span>
        </div>
      </a>
    </nav>

    <div class="sidebar-footer-box">
      <div class="sidebar-user-info">
        <span class="user-avatar-badge">${user.name.charAt(0).toUpperCase()}</span>
        <span class="user-text-name">${user.name}</span>
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
    openModal();
  });
}

function navigateTo(view) {
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
      renderDashboard(
        () => openModal(),
        (targetId) => {
          navigateTo('connections');
        },
        () => {
          const user = getCurrentUser();
          if (user) renderSidebar(user);
        }
      );
      break;
    case 'connections':
      renderConnections(() => {
        const user = getCurrentUser();
        if (user) renderSidebar(user);
      });
      break;
    case 'settings':
      renderSettings();
      break;
  }
}

function handleLogout() {
  clearSession();
  showToast('Logged out', 'success');
  showLoginScreen();
}

document.addEventListener('DOMContentLoaded', initApp);
