/**
 * Settings view — Profile, PIN security, Team access, and Supabase cloud sync.
 */
import {
  changePin,
  verifyPin,
  updateUserName,
  getUsers,
  addUser,
  deleteUser,
  pushToSupabase,
  pullFromSupabase,
  getProviders,
  getConnectionTypes,
  addProvider,
  renameProvider,
  deleteProvider,
  addConnectionType,
  renameConnectionType,
  deleteConnectionType,
  getAlertTiers,
  saveAlertTiers,
} from './store.js';
import {
  getSupabaseConfig,
  saveSupabaseConfig,
  testSupabaseConnection,
  SUPABASE_SQL_SCHEMA,
} from './supabase.js';
import { getCurrentUser, setSession } from './auth.js';
import { showToast, ICONS, downloadFile, escapeHtml, getTierColorVars, todayISO } from './utils.js';

function renderChipList(kind, items) {
  return items
    .map(
      (value) => `
    <div class="chip-editable" data-kind="${kind}" data-value="${escapeHtml(value)}">
      <input type="text" class="chip-input" value="${escapeHtml(value)}" size="${Math.max(6, value.length + 1)}" />
      <button type="button" class="icon-btn icon-btn-danger chip-del-btn" data-kind="${kind}" data-value="${escapeHtml(value)}" title="Remove">${ICONS.close}</button>
    </div>
  `
    )
    .join('');
}

export function renderSettings() {
  const view = document.getElementById('settings-view');
  const user = getCurrentUser();
  const allUsers = getUsers();
  const sbConfig = getSupabaseConfig();
  const providers = getProviders();
  const connectionTypes = getConnectionTypes();
  const alertTiers = getAlertTiers();

  view.innerHTML = `
    <div class="dash-header-block">
      <div class="dash-title-row">
        <div>
          <h1 class="dash-title">Settings</h1>
          <p style="font-size: 13px; color: var(--text-muted); margin-top: 2px;">Manage your team, security PINs, and cloud backup</p>
        </div>
      </div>
    </div>

    <div class="settings-canvas">
      <!-- 1. User Profile -->
      <div class="setting-box">
        <div class="setting-box-header">
          ${ICONS.user}
          <h3>Your Profile</h3>
        </div>
        <form id="profile-form" autocomplete="off">
          <div class="form-group">
            <label for="settings-name">Display Name</label>
            <input type="text" id="settings-name" value="${user?.name || ''}" placeholder="Your name" required />
          </div>
          <button type="submit" class="btn btn-primary">Save Profile</button>
        </form>
      </div>

      <!-- 2. Security PIN -->
      <div class="setting-box">
        <div class="setting-box-header">
          ${ICONS.lock}
          <h3>Security PIN</h3>
        </div>
        <form id="pin-form" autocomplete="off">
          <div class="form-group">
            <label for="current-pin">Current Security PIN</label>
            <input type="password" id="current-pin" maxlength="10" required placeholder="Enter current PIN" autocomplete="off" />
          </div>
          <div class="form-row">
            <div class="form-group">
              <label for="new-pin">New PIN</label>
              <input type="password" id="new-pin" maxlength="10" required placeholder="4+ digits" autocomplete="off" />
            </div>
            <div class="form-group">
              <label for="confirm-pin">Confirm PIN</label>
              <input type="password" id="confirm-pin" maxlength="10" required placeholder="Re-enter" autocomplete="off" />
            </div>
          </div>
          <div id="pin-error" style="color: var(--danger); font-size: 12px; margin-bottom: 10px;" class="hidden"></div>
          <button type="submit" class="btn btn-primary">Update Security PIN</button>
        </form>
      </div>

      <!-- 3. Team Members -->
      <div class="setting-box">
        <div class="setting-box-header">
          ${ICONS.users}
          <h3>Team Members</h3>
        </div>
        <div class="team-list">
          ${allUsers
            .map(
              (u) => `
            <div class="team-item">
              <div class="team-left">
                <span class="team-avatar">${u.name.charAt(0).toUpperCase()}</span>
                <div>
                  <div class="team-name">${u.name} ${u.id === user?.id ? '<span style="color: var(--accent); font-size: 11px;">(You)</span>' : ''}</div>
                  <div style="font-size: 11px; color: var(--text-dim);">Added: ${new Date(u.created_at || Date.now()).toLocaleDateString('en-IN')}</div>
                </div>
              </div>
              ${
                allUsers.length > 1 && u.id !== user?.id
                  ? `<button type="button" class="icon-btn icon-btn-danger user-del-btn" data-id="${u.id}" title="Remove Team Member">${ICONS.trash}</button>`
                  : ''
              }
            </div>
          `
            )
            .join('')}
        </div>

        <form id="add-user-form" style="border-top: 1px solid var(--border-subtle); padding-top: 14px;" autocomplete="off">
          <div style="font-size: 12px; font-weight: 600; color: var(--text-secondary); margin-bottom: 8px;">Add Team Member</div>
          <div class="form-row">
            <div class="form-group">
              <input type="text" id="new-user-name" placeholder="Name" required />
            </div>
            <div class="form-group">
              <input type="password" id="new-user-pin" maxlength="10" placeholder="Initial PIN" required autocomplete="off" />
            </div>
          </div>
          <button type="submit" class="btn btn-ghost btn-full">Add Team Member</button>
        </form>
      </div>

      <!-- 4. Providers & Service Types -->
      <div class="setting-box">
        <div class="setting-box-header">
          ${ICONS.wifi}
          <h3>Providers & Service Types</h3>
        </div>
        <p class="setting-desc">Rename, add, or remove the ISPs, cable operators, and service types shown when adding a subscriber. Click a name to rename it.</p>

        <label style="display: block; font-size: 12px; font-weight: 600; color: var(--text-secondary); margin-bottom: 8px;">Providers</label>
        <div class="chip-list" id="providers-chip-list">${renderChipList('provider', providers)}</div>
        <form class="chip-add-form" data-kind="provider" style="margin-bottom: 18px;">
          <input type="text" placeholder="Add provider e.g. ACT Fibernet" required />
          <button type="submit" class="btn btn-ghost btn-sm">Add</button>
        </form>

        <label style="display: block; font-size: 12px; font-weight: 600; color: var(--text-secondary); margin-bottom: 8px;">Service Types</label>
        <div class="chip-list" id="types-chip-list">${renderChipList('type', connectionTypes)}</div>
        <form class="chip-add-form" data-kind="type">
          <input type="text" placeholder="Add service type e.g. DTH" required />
          <button type="submit" class="btn btn-ghost btn-sm">Add</button>
        </form>
      </div>

      <!-- 5. Alert Thresholds -->
      <div class="setting-box">
        <div class="setting-box-header">
          ${ICONS.alert}
          <h3>Alert Thresholds</h3>
        </div>
        <p class="setting-desc">Choose how many days before expiry each urgency level kicks in, most urgent first. These levels drive the colors and counts on the Dashboard and Subscribers list.</p>
        <form id="alert-tiers-form">
          <div id="alert-tiers-rows">
            ${alertTiers
              .map(
                (t) => `
              <div class="tier-row" data-id="${t.id}">
                <span class="tier-color-dot" style="background: ${getTierColorVars(t.color).color};"></span>
                <input type="text" class="tier-label-input" value="${escapeHtml(t.label)}" placeholder="Label" />
                <div class="tier-days-input-wrap">
                  <input type="number" min="1" max="3650" class="tier-days-input" value="${t.days}" />
                  <span>days</span>
                </div>
                <button type="button" class="icon-btn icon-btn-danger tier-remove-btn" title="Remove level">${ICONS.trash}</button>
              </div>
            `
              )
              .join('')}
          </div>
          <button type="button" class="btn btn-ghost btn-sm" id="tier-add-btn" style="margin-top: 12px;">+ Add Level</button>
          <div style="margin-top: 14px;">
            <button type="submit" class="btn btn-primary">Save Alert Thresholds</button>
          </div>
        </form>
      </div>

      <!-- 6. Supabase Cloud Sync -->
      <div class="setting-box">
        <div class="setting-box-header">
          ${ICONS.database}
          <h3>Cloud Sync (Free)</h3>
        </div>
        <p class="setting-desc">Sync your subscriber data across computers, tabs, and phones in real time.</p>
        
        <form id="supabase-config-form" autocomplete="off">
          <div class="form-group">
            <label for="sb-url">Project URL</label>
            <input type="url" id="sb-url" placeholder="https://your-project.supabase.co" value="${sbConfig.url || ''}" />
          </div>
          <div class="form-group">
            <label for="sb-key">Anon / Public API Key</label>
            <input type="password" id="sb-key" placeholder="eyJhbGciOiJIUzI1NiIsIn..." value="${sbConfig.anonKey || ''}" />
          </div>
          <div style="display: flex; gap: 8px; margin-top: 10px;">
            <button type="submit" class="btn btn-primary">Save Config</button>
            <button type="button" id="sb-test-btn" class="btn btn-ghost">Test Link</button>
            <button type="button" id="sb-sql-btn" class="btn btn-ghost">Get SQL Schema</button>
          </div>
        </form>

        <div style="display: flex; gap: 8px; margin-top: 14px; border-top: 1px solid var(--border-subtle); padding-top: 12px;">
          <button type="button" id="sb-push-btn" class="btn btn-ghost btn-sm">
            ${ICONS.upload} Push Local Data
          </button>
          <button type="button" id="sb-pull-btn" class="btn btn-ghost btn-sm">
            ${ICONS.download} Pull Cloud Data
          </button>
        </div>
      </div>

      <!-- 7. Offline Data Backup -->
      <div class="setting-box">
        <div class="setting-box-header">
          ${ICONS.download}
          <h3>Backup</h3>
        </div>
        <p class="setting-desc">Download a full backup of your subscribers, settings, and team logins.</p>
        <button type="button" class="btn btn-ghost" id="export-json-btn">
          ${ICONS.download}
          <span>Download Backup</span>
        </button>
      </div>

      <!-- 8. System Info -->
      <div class="setting-box">
        <div class="setting-box-header">
          ${ICONS.check}
          <h3>System Info</h3>
        </div>
        <div style="display: flex; flex-direction: column; gap: 8px; font-size: 12px;">
          <div style="display: flex; justify-content: space-between; gap: 12px; color: var(--text-muted);">
            <span>Providers</span>
            <span style="color: var(--text-primary); font-weight: 600; text-align: right;">${providers.map(escapeHtml).join(', ')}</span>
          </div>
          <div style="display: flex; justify-content: space-between; gap: 12px; color: var(--text-muted);">
            <span>Service Types</span>
            <span style="color: var(--text-primary); font-weight: 600; text-align: right;">${connectionTypes.map(escapeHtml).join(', ')}</span>
          </div>
          <div style="display: flex; justify-content: space-between; gap: 12px; color: var(--text-muted);">
            <span>Alert Levels</span>
            <span style="color: var(--text-primary); font-weight: 600; text-align: right;">${alertTiers.map((t) => `${escapeHtml(t.label)} ${t.days}d`).join(', ')}</span>
          </div>
          <div style="display: flex; justify-content: space-between; color: var(--text-muted);">
            <span>Cloud Ready</span>
            <span style="color: var(--success); font-weight: 600;">Vercel & Supabase</span>
          </div>
        </div>
      </div>
    </div>

    <!-- SQL Modal -->
    <div id="sql-modal" class="modal hidden"></div>
  `;

  // Profile Form
  document.getElementById('profile-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const newName = document.getElementById('settings-name').value.trim();
    if (!newName) return;

    if (user) {
      updateUserName(user.id, newName);
      setSession({ ...user, name: newName });
      const sidebarName = document.querySelector('.user-text-name');
      if (sidebarName) sidebarName.textContent = newName;
      const sidebarAvatar = document.querySelector('.user-avatar-badge');
      if (sidebarAvatar) sidebarAvatar.textContent = newName.charAt(0).toUpperCase();
      showToast('Profile updated', 'success');
      renderSettings();
    }
  });

  // PIN Form
  document.getElementById('pin-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errorEl = document.getElementById('pin-error');
    const currentPin = document.getElementById('current-pin').value;
    const newPin = document.getElementById('new-pin').value;
    const confirmPin = document.getElementById('confirm-pin').value;

    if (newPin.length < 4) {
      errorEl.textContent = 'New PIN must be at least 4 digits';
      errorEl.classList.remove('hidden');
      return;
    }

    if (newPin !== confirmPin) {
      errorEl.textContent = 'New PIN and confirmation do not match';
      errorEl.classList.remove('hidden');
      return;
    }

    if (!user) return;

    const valid = await verifyPin(user.id, currentPin);
    if (!valid) {
      errorEl.textContent = 'Current PIN is incorrect';
      errorEl.classList.remove('hidden');
      return;
    }

    const changed = await changePin(user.id, newPin);
    if (changed) {
      errorEl.classList.add('hidden');
      document.getElementById('current-pin').value = '';
      document.getElementById('new-pin').value = '';
      document.getElementById('confirm-pin').value = '';
      showToast('Security PIN successfully updated', 'success');
    } else {
      errorEl.textContent = 'Failed to update PIN. Please try again.';
      errorEl.classList.remove('hidden');
    }
  });

  // Add User Form
  document.getElementById('add-user-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('new-user-name').value.trim();
    const pin = document.getElementById('new-user-pin').value.trim();
    if (!name || !pin) return;

    if (pin.length < 4) {
      showToast('PIN must be at least 4 digits', 'error');
      return;
    }

    await addUser(name, pin);
    showToast(`"${name}" added to team`, 'success');
    renderSettings();
  });

  // Delete User
  document.querySelectorAll('.user-del-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const uId = btn.dataset.id;
      const res = deleteUser(uId);
      if (res.success) {
        showToast('Team member removed', 'success');
        renderSettings();
      } else {
        showToast(res.message || 'Cannot remove team member', 'error');
      }
    });
  });

  // Providers & Service Types — rename (blur), remove, add
  document.querySelectorAll('.chip-input').forEach((input) => {
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        input.blur();
      }
    });
    input.addEventListener('blur', () => {
      const container = input.closest('.chip-editable');
      const kind = container.dataset.kind;
      const oldValue = container.dataset.value;
      const newValue = input.value.trim();
      if (!newValue || newValue === oldValue) {
        input.value = oldValue;
        return;
      }
      const res = kind === 'provider' ? renameProvider(oldValue, newValue) : renameConnectionType(oldValue, newValue);
      if (res.success) {
        showToast(`Renamed "${oldValue}" to "${newValue}"`, 'success');
        renderSettings();
      } else {
        showToast(res.message || 'Rename failed', 'error');
        input.value = oldValue;
      }
    });
  });

  document.querySelectorAll('.chip-del-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const kind = btn.dataset.kind;
      const value = btn.dataset.value;
      const res = kind === 'provider' ? deleteProvider(value) : deleteConnectionType(value);
      if (res.success) {
        showToast(`Removed "${value}"`, 'success');
        renderSettings();
      } else {
        showToast(res.message || 'Could not remove', 'error');
      }
    });
  });

  document.querySelectorAll('.chip-add-form').forEach((form) => {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const kind = form.dataset.kind;
      const input = form.querySelector('input');
      const value = input.value.trim();
      if (!value) return;
      const res = kind === 'provider' ? addProvider(value) : addConnectionType(value);
      if (res.success) {
        showToast(`Added "${value}"`, 'success');
        renderSettings();
      } else {
        showToast(res.message || 'Could not add', 'error');
      }
    });
  });

  // Alert Thresholds — add/remove rows client-side, persist on Save
  function bindTierRemove(row) {
    row.querySelector('.tier-remove-btn').addEventListener('click', () => {
      const rows = document.getElementById('alert-tiers-rows');
      if (rows.querySelectorAll('.tier-row').length <= 1) {
        showToast('At least one alert level is required', 'error');
        return;
      }
      row.remove();
    });
  }
  document.querySelectorAll('#alert-tiers-rows .tier-row').forEach(bindTierRemove);

  document.getElementById('tier-add-btn').addEventListener('click', () => {
    const rows = document.getElementById('alert-tiers-rows');
    const existingDays = Array.from(rows.querySelectorAll('.tier-days-input')).map((i) => parseInt(i.value, 10) || 0);
    const nextDays = (existingDays.length ? Math.max(...existingDays) : 0) + 30;
    const row = document.createElement('div');
    row.className = 'tier-row';
    row.innerHTML = `
      <span class="tier-color-dot" style="background: var(--text-dim);"></span>
      <input type="text" class="tier-label-input" value="New Level" placeholder="Label" />
      <div class="tier-days-input-wrap">
        <input type="number" min="1" max="3650" class="tier-days-input" value="${nextDays}" />
        <span>days</span>
      </div>
      <button type="button" class="icon-btn icon-btn-danger tier-remove-btn" title="Remove level">${ICONS.trash}</button>
    `;
    rows.appendChild(row);
    bindTierRemove(row);
  });

  document.getElementById('alert-tiers-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const rows = Array.from(document.querySelectorAll('#alert-tiers-rows .tier-row'));
    const newTiers = rows.map((row) => ({
      id: row.dataset.id || undefined,
      label: row.querySelector('.tier-label-input').value.trim(),
      days: parseInt(row.querySelector('.tier-days-input').value, 10),
    }));
    const res = saveAlertTiers(newTiers);
    if (res.success) {
      showToast('Alert thresholds updated', 'success');
      renderSettings();
    } else {
      showToast(res.message || 'Please check the values and try again', 'error');
    }
  });

  // Supabase Config
  document.getElementById('supabase-config-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const url = document.getElementById('sb-url').value.trim();
    const anonKey = document.getElementById('sb-key').value.trim();

    saveSupabaseConfig({ url, anonKey, enabled: Boolean(url && anonKey) });
    showToast('Supabase configuration saved', 'success');
  });

  document.getElementById('sb-test-btn').addEventListener('click', async () => {
    const url = document.getElementById('sb-url').value.trim();
    const anonKey = document.getElementById('sb-key').value.trim();
    if (!url || !anonKey) {
      showToast('Please enter both Supabase URL and Anon Key', 'error');
      return;
    }
    showToast('Testing Supabase connection...', 'warning');
    const result = await testSupabaseConnection(url, anonKey);
    if (result.success) {
      showToast('Connection verified!', 'success');
    } else {
      showToast(result.message, 'error');
    }
  });

  // SQL Schema Modal
  document.getElementById('sb-sql-btn').addEventListener('click', () => {
    const modal = document.getElementById('sql-modal');
    modal.innerHTML = `
      <div class="modal-backdrop" id="sql-backdrop"></div>
      <div class="modal-content" style="max-width: 600px;">
        <div class="modal-header">
          <h2>Supabase PostgreSQL Schema</h2>
          <button class="icon-btn" id="sql-close">${ICONS.close}</button>
        </div>
        <p style="font-size: 12px; color: var(--text-muted); margin-bottom: 12px;">
          Execute this in your Supabase SQL Editor (<strong>SQL Editor &rarr; New Query</strong>):
        </p>
        <pre style="background: var(--bg-input); border: 1px solid var(--border-default); border-radius: var(--radius-sm); padding: 14px; font-family: var(--font-mono); font-size: 11px; color: var(--accent); max-height: 250px; overflow-y: auto; white-space: pre-wrap;"><code>${SUPABASE_SQL_SCHEMA}</code></pre>
        <div style="display: flex; justify-content: flex-end; margin-top: 14px;">
          <button type="button" class="btn btn-primary" id="copy-sql-btn">
            ${ICONS.copy} Copy SQL to Clipboard
          </button>
        </div>
      </div>
    `;
    modal.classList.remove('hidden');

    const closeModal = () => {
      modal.classList.add('hidden');
      modal.innerHTML = '';
    };

    document.getElementById('sql-backdrop').addEventListener('click', closeModal);
    document.getElementById('sql-close').addEventListener('click', closeModal);
    document.getElementById('copy-sql-btn').addEventListener('click', () => {
      navigator.clipboard.writeText(SUPABASE_SQL_SCHEMA);
      showToast('SQL Schema copied to clipboard', 'success');
    });
  });

  // Push / Pull
  document.getElementById('sb-push-btn').addEventListener('click', async () => {
    showToast('Replicating to Supabase...', 'warning');
    const res = await pushToSupabase();
    if (res.success) {
      showToast(`Pushed ${res.count} records to Supabase`, 'success');
    } else {
      showToast(res.message, 'error');
    }
  });

  document.getElementById('sb-pull-btn').addEventListener('click', async () => {
    showToast('Replicating from Supabase...', 'warning');
    const res = await pullFromSupabase();
    if (res.success) {
      showToast(`Replicated ${res.count} records from Supabase`, 'success');
    } else {
      showToast(res.message, 'error');
    }
  });

  // JSON Snapshot
  document.getElementById('export-json-btn').addEventListener('click', () => {
    const raw = localStorage.getItem('globalvision_store');
    if (!raw) {
      showToast('No records to export', 'error');
      return;
    }
    downloadFile(raw, `globalvision_registry_${todayISO()}.json`, 'application/json');
    showToast('Snapshot backup downloaded', 'success');
  });
}
