/**
 * Settings view — Profile, PIN security, team access, providers/service types,
 * alert thresholds, and Supabase connection status.
 */
import {
  changePin,
  verifyPin,
  updateUserName,
  getUsers,
  addUser,
  deleteUser,
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
  getBackupSnapshot,
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

export async function renderSettings() {
  const view = document.getElementById('settings-view');
  view.innerHTML = `<div style="padding: 60px 20px; text-align: center; color: var(--text-muted); font-size: 13px;">Loading settings…</div>`;

  const [user, allUsers, providers, connectionTypes, alertTiers] = await Promise.all([
    getCurrentUser(),
    getUsers(),
    getProviders(),
    getConnectionTypes(),
    getAlertTiers(),
  ]);
  const sbConfig = getSupabaseConfig();

  view.innerHTML = `
    <div class="dash-header-block">
      <div class="dash-title-row">
        <div>
          <h1 class="dash-title">Settings</h1>
          <p style="font-size: 13px; color: var(--text-muted); margin-top: 2px;">Manage your team, security PINs, and connected data</p>
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
            <input type="text" id="settings-name" value="${escapeHtml(user?.name || '')}" placeholder="Your name" required />
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
            <input type="password" id="current-pin" inputmode="numeric" maxlength="4" required placeholder="Enter current PIN" autocomplete="off" />
          </div>
          <div class="form-row">
            <div class="form-group">
              <label for="new-pin">New PIN</label>
              <input type="password" id="new-pin" inputmode="numeric" maxlength="4" required placeholder="4 digits" autocomplete="off" />
            </div>
            <div class="form-group">
              <label for="confirm-pin">Confirm PIN</label>
              <input type="password" id="confirm-pin" inputmode="numeric" maxlength="4" required placeholder="Re-enter" autocomplete="off" />
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
                <span class="team-avatar">${escapeHtml(u.name.charAt(0).toUpperCase())}</span>
                <div>
                  <div class="team-name">${escapeHtml(u.name)} ${u.id === user?.id ? '<span style="color: var(--accent); font-size: 11px;">(You)</span>' : ''}</div>
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
              <input type="password" id="new-user-pin" inputmode="numeric" maxlength="4" placeholder="4-digit PIN" required autocomplete="off" />
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

      <!-- 6. Database Connection (direct — no manual sync) -->
      <div class="setting-box">
        <div class="setting-box-header">
          ${ICONS.database}
          <h3>Database Connection</h3>
        </div>
        <p class="setting-desc">This app reads and writes straight to Supabase — there's no local copy to keep in sync, so changes made by any team member show up everywhere immediately.</p>
        <div style="display: flex; flex-direction: column; gap: 8px; font-size: 12px; margin-bottom: 14px;">
          <div style="display: flex; justify-content: space-between; gap: 12px; color: var(--text-muted);">
            <span>Project URL</span>
            <span class="mono" style="color: var(--text-primary); font-weight: 600; word-break: break-all; text-align: right;">${escapeHtml(sbConfig.url || '—')}</span>
          </div>
          <div style="display: flex; justify-content: space-between; color: var(--text-muted);">
            <span>Status</span>
            <span id="db-status-indicator" style="color: var(--text-dim); font-weight: 600;">Checking…</span>
          </div>
        </div>
        <div style="display: flex; gap: 8px; flex-wrap: wrap;">
          <button type="button" id="db-test-btn" class="btn btn-ghost btn-sm">Test Connection</button>
          <button type="button" id="db-sql-btn" class="btn btn-ghost btn-sm">Get SQL Schema</button>
          <button type="button" id="db-disconnect-btn" class="btn btn-danger btn-sm">Disconnect</button>
        </div>
      </div>

      <!-- 7. Data Backup -->
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
  document.getElementById('profile-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const newName = document.getElementById('settings-name').value.trim();
    if (!newName || !user) return;

    const res = await updateUserName(user.id, newName);
    if (res.success) {
      setSession({ ...user, name: newName });
      const sidebarName = document.querySelector('.user-text-name');
      if (sidebarName) sidebarName.textContent = newName;
      const sidebarAvatar = document.querySelector('.user-avatar-badge');
      if (sidebarAvatar) sidebarAvatar.textContent = newName.charAt(0).toUpperCase();
      showToast('Profile updated', 'success');
      renderSettings();
    } else {
      showToast(res.message || 'Failed to update profile', 'error');
    }
  });

  // PIN Form
  document.getElementById('pin-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errorEl = document.getElementById('pin-error');
    const pinSubmitBtn = e.target.querySelector('button[type="submit"]');
    // A second submit would re-verify against the PIN the first one just changed.
    if (pinSubmitBtn.disabled) return;
    const currentPin = document.getElementById('current-pin').value;
    const newPin = document.getElementById('new-pin').value;
    const confirmPin = document.getElementById('confirm-pin').value;

    // The sign-in keypad submits automatically at exactly 4 digits, so anything
    // longer (or non-numeric) would lock the user out of their own account.
    if (!/^\d{4}$/.test(newPin)) {
      errorEl.textContent = 'PIN must be exactly 4 digits';
      errorEl.classList.remove('hidden');
      return;
    }

    if (newPin !== confirmPin) {
      errorEl.textContent = 'New PIN and confirmation do not match';
      errorEl.classList.remove('hidden');
      return;
    }

    if (!user) return;

    pinSubmitBtn.disabled = true;
    try {
      const valid = await verifyPin(user.id, currentPin);
      if (!valid) {
        errorEl.textContent = 'Current PIN is incorrect';
        errorEl.classList.remove('hidden');
        return;
      }

      const res = await changePin(user.id, newPin);
      if (res.success) {
        errorEl.classList.add('hidden');
        document.getElementById('current-pin').value = '';
        document.getElementById('new-pin').value = '';
        document.getElementById('confirm-pin').value = '';
        showToast('Security PIN successfully updated', 'success');
      } else {
        errorEl.textContent = res.message || 'Failed to update PIN. Please try again.';
        errorEl.classList.remove('hidden');
      }
    } finally {
      pinSubmitBtn.disabled = false;
    }
  });

  // Add User Form
  document.getElementById('add-user-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('new-user-name').value.trim();
    const pin = document.getElementById('new-user-pin').value.trim();
    if (!name || !pin) return;

    if (!/^\d{4}$/.test(pin)) {
      showToast('PIN must be exactly 4 digits', 'error');
      return;
    }

    const res = await addUser(name, pin);
    if (res.success) {
      showToast(`"${name}" added to team`, 'success');
      renderSettings();
    } else {
      showToast(res.message || 'Failed to add team member', 'error');
    }
  });

  // Delete User
  document.querySelectorAll('.user-del-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const uId = btn.dataset.id;
      const name = btn.closest('.team-item')?.querySelector('.team-name')?.textContent.trim() || 'this team member';
      // Deleting a subscriber asks first; removing someone's login should too.
      if (!window.confirm(`Remove ${name}? Their sign-in PIN will stop working.`)) return;
      btn.disabled = true;
      const res = await deleteUser(uId);
      if (res.success) {
        showToast('Team member removed', 'success');
        renderSettings();
      } else {
        btn.disabled = false;
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
    input.addEventListener('blur', async () => {
      const container = input.closest('.chip-editable');
      const kind = container.dataset.kind;
      const oldValue = container.dataset.value;
      const newValue = input.value.trim();
      if (!newValue || newValue === oldValue) {
        input.value = oldValue;
        return;
      }
      const res = kind === 'provider' ? await renameProvider(oldValue, newValue) : await renameConnectionType(oldValue, newValue);
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
    btn.addEventListener('click', async () => {
      const kind = btn.dataset.kind;
      const value = btn.dataset.value;
      const res = kind === 'provider' ? await deleteProvider(value) : await deleteConnectionType(value);
      if (res.success) {
        showToast(`Removed "${value}"`, 'success');
        renderSettings();
      } else {
        showToast(res.message || 'Could not remove', 'error');
      }
    });
  });

  document.querySelectorAll('.chip-add-form').forEach((form) => {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const kind = form.dataset.kind;
      const input = form.querySelector('input');
      const value = input.value.trim();
      if (!value) return;
      const res = kind === 'provider' ? await addProvider(value) : await addConnectionType(value);
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

  document.getElementById('alert-tiers-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const rows = Array.from(document.querySelectorAll('#alert-tiers-rows .tier-row'));
    const newTiers = rows.map((row) => ({
      id: row.dataset.id || undefined,
      label: row.querySelector('.tier-label-input').value.trim(),
      days: parseInt(row.querySelector('.tier-days-input').value, 10),
    }));

    // saveAlertTiers drops invalid rows and still reports success, which would
    // silently delete a level the user only meant to edit.
    if (newTiers.some((t) => !t.label || !Number.isFinite(t.days) || t.days < 1)) {
      showToast('Every level needs a label and a day count of 1 or more', 'error');
      return;
    }

    const res = await saveAlertTiers(newTiers);
    if (res.success) {
      showToast('Alert thresholds updated', 'success');
      renderSettings();
    } else {
      showToast(res.message || 'Please check the values and try again', 'error');
    }
  });

  // Database Connection status / actions
  const statusEl = document.getElementById('db-status-indicator');
  (async () => {
    if (!sbConfig.url || !sbConfig.anonKey) {
      statusEl.textContent = 'Not configured';
      statusEl.style.color = 'var(--danger)';
      return;
    }
    const result = await testSupabaseConnection(sbConfig.url, sbConfig.anonKey);
    statusEl.textContent = result.success ? 'Connected' : 'Error';
    statusEl.style.color = result.success ? 'var(--success)' : 'var(--danger)';
  })();

  document.getElementById('db-test-btn').addEventListener('click', async () => {
    if (!sbConfig.url || !sbConfig.anonKey) {
      showToast('No Supabase project configured', 'error');
      return;
    }
    showToast('Testing connection…', 'warning');
    const result = await testSupabaseConnection(sbConfig.url, sbConfig.anonKey);
    if (result.success) {
      showToast('Connection verified!', 'success');
      statusEl.textContent = 'Connected';
      statusEl.style.color = 'var(--success)';
    } else {
      showToast(result.message, 'error');
      statusEl.textContent = 'Error';
      statusEl.style.color = 'var(--danger)';
    }
  });

  document.getElementById('db-disconnect-btn').addEventListener('click', () => {
    saveSupabaseConfig({ url: '', anonKey: '', enabled: false });
    showToast('Disconnected from Supabase', 'success');
    window.location.reload();
  });

  // SQL Schema Modal
  document.getElementById('db-sql-btn').addEventListener('click', () => {
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
    document.getElementById('copy-sql-btn').addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(SUPABASE_SQL_SCHEMA);
        showToast('SQL Schema copied to clipboard', 'success');
      } catch {
        showToast('Copy failed — select the SQL above and copy it manually', 'error');
      }
    });
  });

  // Full Backup (live export from Supabase)
  document.getElementById('export-json-btn').addEventListener('click', async () => {
    try {
      const snapshot = await getBackupSnapshot();
      if (snapshot.users.length === 0 && snapshot.connections.length === 0) {
        showToast('No records to export', 'error');
        return;
      }
      downloadFile(JSON.stringify(snapshot, null, 2), `globalvision_registry_${todayISO()}.json`, 'application/json');
      showToast(`Backup downloaded — ${snapshot.connections.length} subscribers`, 'success');
    } catch (err) {
      showToast(err.message || 'Backup failed — nothing was downloaded', 'error');
    }
  });
}
