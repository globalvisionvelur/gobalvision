/**
 * Settings view — Profile, PIN security, team access, business profile & receipt branding,
 * master plans & pricing packages, providers/service types, alert thresholds, and Supabase backup.
 */
import {
  changePin,
  verifyPin,
  updateUserName,
  updateUser,
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
  getBusinessProfile,
  saveBusinessProfile,
  getMasterPlans,
  addMasterPlan,
  deleteMasterPlan,
} from './store.js';
import {
  getSupabaseConfig,
  saveSupabaseConfig,
  testSupabaseConnection,
  SUPABASE_SQL_SCHEMA,
} from './supabase.js';
import { getCurrentUser, setSession } from './auth.js';
import {
  showToast,
  ICONS,
  downloadFile,
  escapeHtml,
  getTierColorVars,
  todayISO,
  formatCurrency,
} from './utils.js';

let activeSettingsTab = 'team'; // 'team' | 'business' | 'plans' | 'providers' | 'system'

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
  if (!view) return;

  view.innerHTML = `<div style="padding: 60px 20px; text-align: center; color: var(--text-muted); font-size: 13px;">Loading settings…</div>`;

  const [user, allUsers, providers, connectionTypes, alertTiers, businessProfile, masterPlans] = await Promise.all([
    getCurrentUser(),
    getUsers(),
    getProviders(),
    getConnectionTypes(),
    getAlertTiers(),
    getBusinessProfile(),
    getMasterPlans(),
  ]);
  const sbConfig = getSupabaseConfig();

  view.innerHTML = `
    <div class="dash-header-block">
      <div class="dash-title-row">
        <div>
          <h1 class="dash-title">Settings &amp; Configuration</h1>
          <p style="font-size: 13px; color: var(--text-muted); margin-top: 2px;">Manage team credentials, receipt branding, plans master, and system connection</p>
        </div>
      </div>

      <!-- Settings Category Tabs -->
      <div class="settings-tabs" style="margin-top: 16px;">
        <button type="button" class="settings-tab-btn ${activeSettingsTab === 'team' ? 'active' : ''}" data-tab="team">
          ${ICONS.users}
          <span>Team &amp; Security</span>
        </button>
        <button type="button" class="settings-tab-btn ${activeSettingsTab === 'business' ? 'active' : ''}" data-tab="business">
          ${ICONS.briefcase}
          <span>Business &amp; Receipts</span>
        </button>
        <button type="button" class="settings-tab-btn ${activeSettingsTab === 'plans' ? 'active' : ''}" data-tab="plans">
          ${ICONS.tag}
          <span>Plans &amp; Pricing</span>
        </button>
        <button type="button" class="settings-tab-btn ${activeSettingsTab === 'providers' ? 'active' : ''}" data-tab="providers">
          ${ICONS.wifi}
          <span>Providers &amp; Alerts</span>
        </button>
        <button type="button" class="settings-tab-btn ${activeSettingsTab === 'system' ? 'active' : ''}" data-tab="system">
          ${ICONS.database}
          <span>Database &amp; Backup</span>
        </button>
      </div>
    </div>

    <div class="settings-canvas" style="margin-top: 18px;">
      <!-- TAB 1: TEAM & SECURITY -->
      ${
        activeSettingsTab === 'team'
          ? `
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
            <h3>Change Your Security PIN</h3>
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
        <div class="setting-box" style="grid-column: 1 / -1;">
          <div class="setting-box-header">
            ${ICONS.users}
            <div>
              <h3>Team Members &amp; Access PINs</h3>
              <p class="setting-desc" style="margin: 2px 0 0;">Manage operators. Click <strong>Edit</strong> to rename any team member or reset their 4-digit PIN.</p>
            </div>
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
                <div style="display: flex; align-items: center; gap: 6px;">
                  <button type="button" class="btn btn-sm btn-ghost user-edit-btn" data-id="${u.id}" data-name="${escapeHtml(u.name)}" title="Edit Name / Reset PIN">
                    ${ICONS.edit} Edit
                  </button>
                  ${
                    allUsers.length > 1 && u.id !== user?.id
                      ? `<button type="button" class="icon-btn icon-btn-danger user-del-btn" data-id="${u.id}" title="Remove Team Member">${ICONS.trash}</button>`
                      : ''
                  }
                </div>
              </div>
            `
              )
              .join('')}
          </div>

          <form id="add-user-form" style="border-top: 1px solid var(--border-subtle); padding-top: 16px; margin-top: 14px;" autocomplete="off">
            <div style="font-size: 12px; font-weight: 700; color: var(--text-primary); margin-bottom: 8px;">+ Add New Team Member</div>
            <div class="form-row">
              <div class="form-group">
                <input type="text" id="new-user-name" placeholder="Member Name" required />
              </div>
              <div class="form-group">
                <input type="password" id="new-user-pin" inputmode="numeric" maxlength="4" placeholder="4-digit PIN" required autocomplete="off" />
              </div>
            </div>
            <button type="submit" class="btn btn-ghost">Add Team Member</button>
          </form>
        </div>
      `
          : ''
      }

      <!-- TAB 2: BUSINESS & RECEIPTS -->
      ${
        activeSettingsTab === 'business'
          ? `
        <div class="setting-box" style="grid-column: 1 / -1; max-width: 720px;">
          <div class="setting-box-header">
            ${ICONS.briefcase}
            <div>
              <h3>Business Profile &amp; Payment Receipts Branding</h3>
              <p class="setting-desc" style="margin: 2px 0 0;">These business details appear on printable thermal slips, payment receipts, and automated WhatsApp payment confirmation messages.</p>
            </div>
          </div>

          <form id="business-profile-form" autocomplete="off">
            <div class="form-row">
              <div class="form-group">
                <label for="bp-name">Business / Agency Name *</label>
                <input type="text" id="bp-name" value="${escapeHtml(businessProfile.name || '')}" placeholder="e.g. GlobalVision Broadband & Cable TV" required />
              </div>
              <div class="form-group">
                <label for="bp-phone">Helpline / Support Phone *</label>
                <input type="tel" id="bp-phone" value="${escapeHtml(businessProfile.phone || '')}" placeholder="e.g. +91 98400 12345" required />
              </div>
            </div>

            <div class="form-row">
              <div class="form-group">
                <label for="bp-upi">UPI ID for Customer Payments</label>
                <input type="text" id="bp-upi" value="${escapeHtml(businessProfile.upiId || '')}" placeholder="e.g. globalvision@upi or mobile@paytm" />
                <span style="font-size: 11px; color: var(--text-muted);">Included in bill reminder messages for 1-click customer payment.</span>
              </div>
              <div class="form-group">
                <label for="bp-email">Support Email (Optional)</label>
                <input type="email" id="bp-email" value="${escapeHtml(businessProfile.email || '')}" placeholder="e.g. support@globalvision.in" />
              </div>
            </div>

            <div class="form-row">
              <div class="form-group">
                <label for="bp-address">Shop / Office Address</label>
                <input type="text" id="bp-address" value="${escapeHtml(businessProfile.address || '')}" placeholder="e.g. 12/A Bazaar St, Velur, TN" />
              </div>
              <div class="form-group">
                <label for="bp-reg">GSTIN / Registration No (Optional)</label>
                <input type="text" id="bp-reg" value="${escapeHtml(businessProfile.regNo || '')}" placeholder="e.g. 33AAAAA0000A1Z5" />
              </div>
            </div>

            <div style="margin-top: 14px;">
              <button type="submit" class="btn btn-primary" id="bp-save-btn">Save Business Profile</button>
            </div>
          </form>
        </div>
      `
          : ''
      }

      <!-- TAB 3: PLANS & PRICING -->
      ${
        activeSettingsTab === 'plans'
          ? `
        <div class="setting-box" style="grid-column: 1 / -1; max-width: 800px;">
          <div class="setting-box-header">
            ${ICONS.tag}
            <div>
              <h3>Master Plans &amp; Pricing Packages</h3>
              <p class="setting-desc" style="margin: 2px 0 0;">Define your standard plans. When creating or editing subscribers, picking a plan automatically auto-fills their bill rate and provider.</p>
            </div>
          </div>

          <!-- Existing Plans Grid -->
          <div class="master-plans-grid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 12px; margin-bottom: 20px;">
            ${masterPlans
              .map(
                (p) => `
              <div class="plan-card" style="background: var(--bg-surface); border: 1px solid var(--border-default); border-radius: var(--radius-md); padding: 14px; display: flex; flex-direction: column; justify-content: space-between;">
                <div>
                  <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 8px;">
                    <div style="font-weight: 700; color: var(--text-primary); font-size: 14px;">${escapeHtml(p.name)}</div>
                    <span class="provider-tag" style="font-size: 10px; padding: 1px 6px;">${escapeHtml(p.connection_type || 'All')}</span>
                  </div>
                  <div class="mono" style="font-size: 18px; font-weight: 800; color: var(--accent); margin: 6px 0 4px;">
                    ${formatCurrency(p.rate)}<span style="font-size: 11px; font-weight: 500; color: var(--text-muted);">/mo</span>
                  </div>
                  ${p.provider ? `<div style="font-size: 11px; color: var(--text-muted);">${escapeHtml(p.provider)}</div>` : ''}
                </div>
                <div style="display: flex; justify-content: flex-end; margin-top: 10px; border-top: 1px solid var(--border-subtle); padding-top: 8px;">
                  <button type="button" class="btn btn-sm btn-ghost text-danger btn-del-plan" data-id="${p.id}" title="Delete Plan">
                    ${ICONS.trash} Remove
                  </button>
                </div>
              </div>
            `
              )
              .join('')}
          </div>

          <!-- Add Plan Form -->
          <form id="add-plan-form" style="border-top: 1px solid var(--border-subtle); padding-top: 16px;" autocomplete="off">
            <div style="font-size: 13px; font-weight: 700; color: var(--text-primary); margin-bottom: 10px;">+ Create New Plan Package</div>
            <div class="form-row">
              <div class="form-group">
                <label for="np-name">Plan Name *</label>
                <input type="text" id="np-name" placeholder="e.g. Fiber 100 Mbps Unlimited" required />
              </div>
              <div class="form-group">
                <label for="np-rate">Monthly Rate (₹) *</label>
                <input type="number" id="np-rate" min="1" step="1" placeholder="e.g. 699" required />
              </div>
            </div>
            <div class="form-row">
              <div class="form-group">
                <label for="np-type">Service Type *</label>
                <select id="np-type" required>
                  ${connectionTypes.map((t) => `<option value="${escapeHtml(t)}">${escapeHtml(t)}</option>`).join('')}
                </select>
              </div>
              <div class="form-group">
                <label for="np-provider">Associated Provider (Optional)</label>
                <select id="np-provider">
                  <option value="">Any Provider</option>
                  ${providers.map((p) => `<option value="${escapeHtml(p)}">${escapeHtml(p)}</option>`).join('')}
                </select>
              </div>
            </div>
            <button type="submit" class="btn btn-primary">Add Plan to Master</button>
          </form>
        </div>
      `
          : ''
      }

      <!-- TAB 4: PROVIDERS & ALERTS -->
      ${
        activeSettingsTab === 'providers'
          ? `
        <!-- Providers & Service Types -->
        <div class="setting-box">
          <div class="setting-box-header">
            ${ICONS.wifi}
            <h3>Providers &amp; Service Types</h3>
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

        <!-- Alert Thresholds -->
        <div class="setting-box">
          <div class="setting-box-header">
            ${ICONS.alert}
            <h3>Alert Thresholds</h3>
          </div>
          <p class="setting-desc">Choose how many days before expiry each urgency level kicks in, most urgent first. These levels drive colors and counts on the Dashboard and Subscribers list.</p>
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
      `
          : ''
      }

      <!-- TAB 5: DATABASE & BACKUP -->
      ${
        activeSettingsTab === 'system'
          ? `
        <!-- Database Connection -->
        <div class="setting-box">
          <div class="setting-box-header">
            ${ICONS.database}
            <h3>Database Connection</h3>
          </div>
          <p class="setting-desc">Direct read and write to Supabase cloud PostgreSQL database.</p>
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

        <!-- Data Backup -->
        <div class="setting-box">
          <div class="setting-box-header">
            ${ICONS.download}
            <h3>Data Backup</h3>
          </div>
          <p class="setting-desc">Download a full JSON backup of your subscribers, settings, and team logins.</p>
          <button type="button" class="btn btn-ghost" id="export-json-btn">
            ${ICONS.download}
            <span>Download Full Backup (JSON)</span>
          </button>
        </div>

        <!-- System Info -->
        <div class="setting-box">
          <div class="setting-box-header">
            ${ICONS.check}
            <h3>System Status</h3>
          </div>
          <div style="display: flex; flex-direction: column; gap: 8px; font-size: 12px;">
            <div style="display: flex; justify-content: space-between; gap: 12px; color: var(--text-muted);">
              <span>Active Providers</span>
              <span style="color: var(--text-primary); font-weight: 600; text-align: right;">${providers.map(escapeHtml).join(', ')}</span>
            </div>
            <div style="display: flex; justify-content: space-between; gap: 12px; color: var(--text-muted);">
              <span>Service Types</span>
              <span style="color: var(--text-primary); font-weight: 600; text-align: right;">${connectionTypes.map(escapeHtml).join(', ')}</span>
            </div>
            <div style="display: flex; justify-content: space-between; color: var(--text-muted);">
              <span>Master Packages</span>
              <span style="color: var(--accent); font-weight: 600;">${masterPlans.length} Active Plans</span>
            </div>
          </div>
        </div>
      `
          : ''
      }
    </div>

    <!-- SQL Modal -->
    <div id="sql-modal" class="modal hidden"></div>

    <!-- Edit User Modal -->
    <div id="edit-user-modal" class="modal hidden"></div>
  `;

  // Attach Settings Tab Switching
  view.querySelectorAll('.settings-tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      activeSettingsTab = btn.dataset.tab;
      renderSettings();
    });
  });

  // ─── TAB 1 LISTENERS (Team) ──────────────────────────────
  if (activeSettingsTab === 'team') {
    // Profile Form
    const profileForm = document.getElementById('profile-form');
    if (profileForm) {
      profileForm.addEventListener('submit', async (e) => {
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
    }

    // PIN Form
    const pinForm = document.getElementById('pin-form');
    if (pinForm) {
      pinForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const errorEl = document.getElementById('pin-error');
        const pinSubmitBtn = e.target.querySelector('button[type="submit"]');
        if (pinSubmitBtn.disabled) return;
        const currentPin = document.getElementById('current-pin').value;
        const newPin = document.getElementById('new-pin').value;
        const confirmPin = document.getElementById('confirm-pin').value;

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
    }

    // Add User Form
    const addUserForm = document.getElementById('add-user-form');
    if (addUserForm) {
      addUserForm.addEventListener('submit', async (e) => {
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
    }

    // Edit Team Member (Name / Reset PIN)
    view.querySelectorAll('.user-edit-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        openEditUserModal(btn.dataset.id, btn.dataset.name);
      });
    });

    // Delete User
    view.querySelectorAll('.user-del-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const uId = btn.dataset.id;
        const name = btn.closest('.team-item')?.querySelector('.team-name')?.textContent.trim() || 'this team member';
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
  }

  // ─── TAB 2 LISTENERS (Business) ───────────────────────────
  if (activeSettingsTab === 'business') {
    const bpForm = document.getElementById('business-profile-form');
    if (bpForm) {
      bpForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = document.getElementById('bp-name').value.trim();
        const phone = document.getElementById('bp-phone').value.trim();
        const upiId = document.getElementById('bp-upi').value.trim();
        const email = document.getElementById('bp-email').value.trim();
        const address = document.getElementById('bp-address').value.trim();
        const regNo = document.getElementById('bp-reg').value.trim();

        const saveBtn = document.getElementById('bp-save-btn');
        saveBtn.disabled = true;
        saveBtn.textContent = 'Saving…';

        await saveBusinessProfile({ name, phone, upiId, email, address, regNo });
        showToast('Business profile and receipt details updated!', 'success');
        saveBtn.disabled = false;
        saveBtn.textContent = 'Save Business Profile';
      });
    }
  }

  // ─── TAB 3 LISTENERS (Plans) ──────────────────────────────
  if (activeSettingsTab === 'plans') {
    const addPlanForm = document.getElementById('add-plan-form');
    if (addPlanForm) {
      addPlanForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = document.getElementById('np-name').value.trim();
        const rate = Number(document.getElementById('np-rate').value) || 0;
        const connection_type = document.getElementById('np-type').value;
        const provider = document.getElementById('np-provider').value;

        if (!name || rate <= 0) {
          showToast('Please enter a valid plan name and monthly rate', 'error');
          return;
        }

        await addMasterPlan({ name, rate, connection_type, provider });
        showToast(`Plan "${name}" (${formatCurrency(rate)}/mo) created!`, 'success');
        renderSettings();
      });
    }

    view.querySelectorAll('.btn-del-plan').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (!window.confirm('Delete this plan package?')) return;
        await deleteMasterPlan(btn.dataset.id);
        showToast('Plan removed', 'success');
        renderSettings();
      });
    });
  }

  // ─── TAB 4 LISTENERS (Providers & Alerts) ──────────────────
  if (activeSettingsTab === 'providers') {
    // Providers & Service Types — rename (blur), remove, add
    view.querySelectorAll('.chip-input').forEach((input) => {
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
        const res =
          kind === 'provider'
            ? await renameProvider(oldValue, newValue)
            : await renameConnectionType(oldValue, newValue);
        if (res.success) {
          showToast(`Renamed "${oldValue}" to "${newValue}"`, 'success');
          renderSettings();
        } else {
          showToast(res.message || 'Rename failed', 'error');
          input.value = oldValue;
        }
      });
    });

    view.querySelectorAll('.chip-del-btn').forEach((btn) => {
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

    view.querySelectorAll('.chip-add-form').forEach((form) => {
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

    // Alert Thresholds
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
    view.querySelectorAll('#alert-tiers-rows .tier-row').forEach(bindTierRemove);

    const tierAddBtn = document.getElementById('tier-add-btn');
    if (tierAddBtn) {
      tierAddBtn.addEventListener('click', () => {
        const rows = document.getElementById('alert-tiers-rows');
        const existingDays = Array.from(rows.querySelectorAll('.tier-days-input')).map((i) =>
          parseInt(i.value, 10) || 0
        );
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
    }

    const alertTiersForm = document.getElementById('alert-tiers-form');
    if (alertTiersForm) {
      alertTiersForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const rows = Array.from(document.querySelectorAll('#alert-tiers-rows .tier-row'));
        const newTiers = rows.map((row) => ({
          id: row.dataset.id || undefined,
          label: row.querySelector('.tier-label-input').value.trim(),
          days: parseInt(row.querySelector('.tier-days-input').value, 10),
        }));

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
    }
  }

  // ─── TAB 5 LISTENERS (Database & Backup) ───────────────────
  if (activeSettingsTab === 'system') {
    const statusEl = document.getElementById('db-status-indicator');
    (async () => {
      if (!sbConfig.url || !sbConfig.anonKey) {
        if (statusEl) {
          statusEl.textContent = 'Not configured';
          statusEl.style.color = 'var(--danger)';
        }
        return;
      }
      const result = await testSupabaseConnection(sbConfig.url, sbConfig.anonKey);
      if (statusEl) {
        statusEl.textContent = result.success ? 'Connected' : 'Error';
        statusEl.style.color = result.success ? 'var(--success)' : 'var(--danger)';
      }
    })();

    const dbTestBtn = document.getElementById('db-test-btn');
    if (dbTestBtn) {
      dbTestBtn.addEventListener('click', async () => {
        if (!sbConfig.url || !sbConfig.anonKey) {
          showToast('No Supabase project configured', 'error');
          return;
        }
        showToast('Testing connection…', 'warning');
        const result = await testSupabaseConnection(sbConfig.url, sbConfig.anonKey);
        if (result.success) {
          showToast('Connection verified!', 'success');
          if (statusEl) {
            statusEl.textContent = 'Connected';
            statusEl.style.color = 'var(--success)';
          }
        } else {
          showToast(result.message, 'error');
          if (statusEl) {
            statusEl.textContent = 'Error';
            statusEl.style.color = 'var(--danger)';
          }
        }
      });
    }

    const dbDisconnectBtn = document.getElementById('db-disconnect-btn');
    if (dbDisconnectBtn) {
      dbDisconnectBtn.addEventListener('click', () => {
        saveSupabaseConfig({ url: '', anonKey: '', enabled: false });
        showToast('Disconnected from Supabase', 'success');
        window.location.reload();
      });
    }

    // SQL Schema Modal
    const dbSqlBtn = document.getElementById('db-sql-btn');
    if (dbSqlBtn) {
      dbSqlBtn.addEventListener('click', () => {
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
    }

    // Full Backup
    const exportJsonBtn = document.getElementById('export-json-btn');
    if (exportJsonBtn) {
      exportJsonBtn.addEventListener('click', async () => {
        try {
          const snapshot = await getBackupSnapshot();
          if (snapshot.users.length === 0 && snapshot.connections.length === 0) {
            showToast('No records to export', 'error');
            return;
          }
          downloadFile(
            JSON.stringify(snapshot, null, 2),
            `globalvision_registry_${todayISO()}.json`,
            'application/json'
          );
          showToast(`Backup downloaded — ${snapshot.connections.length} subscribers`, 'success');
        } catch (err) {
          showToast(err.message || 'Backup failed — nothing was downloaded', 'error');
        }
      });
    }
  }
}

/**
 * Edit Team Member Modal (Name & PIN reset)
 */
function openEditUserModal(userId, currentName) {
  const modal = document.getElementById('edit-user-modal') || document.getElementById('connection-modal');
  if (!modal) return;

  modal.innerHTML = `
    <div class="modal-backdrop" id="edit-user-backdrop"></div>
    <div class="modal-content" style="max-width: 420px;">
      <div class="modal-header">
        <h2>Edit Team Member</h2>
        <button class="icon-btn" id="edit-user-close">${ICONS.close}</button>
      </div>

      <form id="edit-user-form" autocomplete="off">
        <div class="form-group">
          <label for="eum-name">Member Display Name *</label>
          <input type="text" id="eum-name" value="${escapeHtml(currentName)}" required />
        </div>

        <div class="form-group" style="margin-top: 12px;">
          <label for="eum-pin">Reset 4-Digit Security PIN (Optional)</label>
          <input type="password" id="eum-pin" inputmode="numeric" maxlength="4" placeholder="Leave blank to keep existing PIN" autocomplete="off" />
          <span style="font-size: 11px; color: var(--text-muted);">Enter 4 numbers only if you want to reset their sign-in PIN.</span>
        </div>

        <div class="modal-actions" style="margin-top: 20px;">
          <button type="button" class="btn btn-ghost" id="eum-cancel">Cancel</button>
          <button type="submit" class="btn btn-primary" id="eum-save">Save Member Details</button>
        </div>
      </form>
    </div>
  `;

  modal.classList.remove('hidden');

  const closeModal = () => {
    modal.classList.add('hidden');
    modal.innerHTML = '';
  };

  document.getElementById('edit-user-backdrop').onclick = closeModal;
  document.getElementById('edit-user-close').onclick = closeModal;
  document.getElementById('eum-cancel').onclick = closeModal;

  document.getElementById('edit-user-form').onsubmit = async (e) => {
    e.preventDefault();
    const name = document.getElementById('eum-name').value.trim();
    const pin = document.getElementById('eum-pin').value.trim();

    if (!name) {
      showToast('Name is required', 'error');
      return;
    }

    if (pin && !/^\d{4}$/.test(pin)) {
      showToast('PIN must be exactly 4 numeric digits', 'error');
      return;
    }

    const saveBtn = document.getElementById('eum-save');
    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving…';

    const updates = { name };
    if (pin) updates.pin = pin;

    const res = await updateUser(userId, updates);
    if (res.success) {
      showToast(`Team member "${name}" updated successfully!`, 'success');
      closeModal();
      renderSettings();
    } else {
      showToast(res.message || 'Failed to update member', 'error');
      saveBtn.disabled = false;
      saveBtn.textContent = 'Save Member Details';
    }
  };
}
