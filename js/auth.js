/**
 * Authentication module — Precision PIN Keypad with instant verification.
 */
import { getUsers, verifyPin, getUserById } from './store.js';
import { showToast, escapeHtml } from './utils.js';

const SESSION_KEY = 'globalvision_session';

export function getSession() {
  const raw = localStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function setSession(user) {
  localStorage.setItem(
    SESSION_KEY,
    JSON.stringify({ userId: user.id, name: user.name, loggedInAt: new Date().toISOString() })
  );
}

export function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}

export async function getCurrentUser() {
  const session = getSession();
  if (!session) return null;
  return getUserById(session.userId);
}

export async function renderLogin(onLoginSuccess) {
  const loginScreen = document.getElementById('login-screen');
  loginScreen.innerHTML = `<div class="auth-card" style="align-items: center; justify-content: center; min-height: 320px;"><p style="color: var(--text-muted); font-size: 13px;">Connecting…</p></div>`;

  const users = await getUsers();
  let selectedUserId = users[0]?.id || '';
  let currentPin = '';

  function renderAuthCard() {
    loginScreen.innerHTML = `
      <div class="auth-card">
        <div class="auth-header">
          <div class="auth-logo-badge">
            <span class="auth-logo-dot"></span>
            <span class="auth-logo-text">GlobalVision</span>
          </div>
          <h1 class="auth-title">Sign In</h1>
          <p class="auth-subtitle">Broadband & Cable TV Subscriber Manager</p>
        </div>

        <div class="auth-users-selector">
          ${users
            .map(
              (u) => `
            <button type="button" class="auth-user-btn ${u.id === selectedUserId ? 'active' : ''}" data-user-id="${u.id}">
              <span class="auth-user-avatar">${escapeHtml(u.name.charAt(0).toUpperCase())}</span>
              <span>${escapeHtml(u.name)}</span>
            </button>
          `
            )
            .join('')}
        </div>

        <div class="pin-display" id="pin-dots">
          <div class="pin-dot ${currentPin.length >= 1 ? 'filled' : ''}"></div>
          <div class="pin-dot ${currentPin.length >= 2 ? 'filled' : ''}"></div>
          <div class="pin-dot ${currentPin.length >= 3 ? 'filled' : ''}"></div>
          <div class="pin-dot ${currentPin.length >= 4 ? 'filled' : ''}"></div>
        </div>

        <div class="keypad">
          <button type="button" class="keypad-btn" data-key="1">1</button>
          <button type="button" class="keypad-btn" data-key="2">2</button>
          <button type="button" class="keypad-btn" data-key="3">3</button>
          <button type="button" class="keypad-btn" data-key="4">4</button>
          <button type="button" class="keypad-btn" data-key="5">5</button>
          <button type="button" class="keypad-btn" data-key="6">6</button>
          <button type="button" class="keypad-btn" data-key="7">7</button>
          <button type="button" class="keypad-btn" data-key="8">8</button>
          <button type="button" class="keypad-btn" data-key="9">9</button>
          <button type="button" class="keypad-btn keypad-btn-fn" data-key="clear">CLR</button>
          <button type="button" class="keypad-btn" data-key="0">0</button>
          <button type="button" class="keypad-btn keypad-btn-fn" data-key="back">⌫</button>
        </div>

        <div id="auth-error" class="auth-error-msg"></div>
      </div>
    `;

    // Attach user selector events
    loginScreen.querySelectorAll('.auth-user-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        selectedUserId = btn.dataset.userId;
        currentPin = '';
        renderAuthCard();
      });
    });

    // Attach keypad events
    loginScreen.querySelectorAll('.keypad-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const key = btn.dataset.key;
        handleKeyInput(key);
      });
    });
  }

  async function handleKeyInput(key) {
    const errorEl = document.getElementById('auth-error');
    if (errorEl) errorEl.textContent = '';

    if (key === 'clear') {
      currentPin = '';
      updateDots();
      return;
    }

    if (key === 'back') {
      currentPin = currentPin.slice(0, -1);
      updateDots();
      return;
    }

    if (/^[0-9]$/.test(key) && currentPin.length < 10) {
      currentPin += key;
      updateDots();

      // Automatically verify when 4 digits are reached (standard PIN length)
      if (currentPin.length === 4) {
        await verifyAndLogin();
      }
    }
  }

  function updateDots() {
    const dotsContainer = document.getElementById('pin-dots');
    if (!dotsContainer) return;
    const dots = dotsContainer.querySelectorAll('.pin-dot');
    dots.forEach((dot, index) => {
      if (index < currentPin.length) {
        dot.classList.add('filled');
      } else {
        dot.classList.remove('filled');
      }
    });
  }

  async function verifyAndLogin() {
    const errorEl = document.getElementById('auth-error');
    const dots = document.querySelectorAll('.pin-dot');

    try {
      const valid = await verifyPin(selectedUserId, currentPin);
      if (valid) {
        const user = await getUserById(selectedUserId);
        setSession(user);
        showToast(`Authenticated as ${user.name}`, 'success');
        document.removeEventListener('keydown', keyboardHandler);
        onLoginSuccess(user);
      } else {
        dots.forEach((d) => d.classList.add('error'));
        if (errorEl) errorEl.textContent = 'Incorrect Security PIN';
        setTimeout(() => {
          currentPin = '';
          updateDots();
          dots.forEach((d) => d.classList.remove('error'));
        }, 500);
      }
    } catch {
      if (errorEl) errorEl.textContent = 'Authentication error. Try again.';
      currentPin = '';
      updateDots();
    }
  }

  // Direct physical keyboard handler
  function keyboardHandler(e) {
    if (!document.getElementById('login-screen') || document.getElementById('login-screen').classList.contains('hidden')) {
      return;
    }

    if (e.key >= '0' && e.key <= '9') {
      handleKeyInput(e.key);
    } else if (e.key === 'Backspace') {
      handleKeyInput('back');
    } else if (e.key === 'Escape') {
      handleKeyInput('clear');
    } else if (e.key === 'Enter' && currentPin.length >= 4) {
      verifyAndLogin();
    }
  }

  document.removeEventListener('keydown', keyboardHandler);
  document.addEventListener('keydown', keyboardHandler);

  renderAuthCard();
}
