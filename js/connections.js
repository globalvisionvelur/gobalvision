/**
 * Connections view — Precision Data Table & Subscriber Management.
 */
import {
  queryConnections,
  addConnection,
  updateConnection,
  deleteConnection,
  getConnectionById,
  importConnections,
  getConnections,
  getProviders,
  getConnectionTypes,
  getAlertTiers,
} from './store.js';
import {
  daysUntil,
  formatDate,
  daysBadgeInfo,
  escapeHtml,
  ICONS,
  STATUSES,
  showToast,
  debounce,
  todayISO,
  exportConnectionsCSV,
} from './utils.js';

let currentFilters = { search: '', provider: 'all', connectionType: 'all', status: 'all', urgency: 'all' };
let refreshDashboardCb = null;

export async function renderConnections(onRefreshDashboard) {
  refreshDashboardCb = onRefreshDashboard;
  const view = document.getElementById('connections-view');
  view.innerHTML = `<div style="padding: 60px 20px; text-align: center; color: var(--text-muted); font-size: 13px;">Loading subscribers…</div>`;

  const [providers, connectionTypes, tiers] = await Promise.all([getProviders(), getConnectionTypes(), getAlertTiers()]);

  view.innerHTML = `
    <div class="conns-header">
      <div class="conns-title-wrap">
        <h1>Subscribers</h1>
        <p>Manage broadband & cable TV subscribers, renewals, and disconnections</p>
      </div>
      <div style="display: flex; gap: 8px; align-items: center;">
        <button class="btn btn-ghost" id="conn-export-btn" title="Export CSV spreadsheet">
          ${ICONS.download}
          <span>Export CSV</span>
        </button>
        <button class="btn btn-ghost" id="conn-import-btn" title="Import JSON / CSV">
          ${ICONS.upload}
          <span>Import</span>
        </button>
        <button class="btn btn-primary" id="conn-add-btn">
          ${ICONS.plus}
          <span>Add Subscriber</span>
        </button>
      </div>
    </div>

    <!-- Hidden file input for import -->
    <input type="file" id="import-file-input" accept=".json,.csv" style="display:none;" />

    <div class="conns-toolbar">
      <div class="toolbar-left">
        <div class="search-box">
          ${ICONS.search}
          <input type="search" id="conn-search" placeholder="Filter by customer name or phone..." value="${escapeHtml(currentFilters.search)}" />
        </div>
      </div>
      <div class="toolbar-filters">
        <select id="filter-urgency" class="select-filter">
          <option value="all" ${currentFilters.urgency === 'all' ? 'selected' : ''}>All Expirations</option>
          ${tiers
            .map(
              (t) =>
                `<option value="${t.id}" ${currentFilters.urgency === t.id ? 'selected' : ''}>${escapeHtml(t.label)} (&le; ${t.days} days)</option>`
            )
            .join('')}
          <option value="overdue" ${currentFilters.urgency === 'overdue' ? 'selected' : ''}>Overdue</option>
        </select>
        <select id="filter-provider" class="select-filter">
          <option value="all">All Providers</option>
          ${providers.map((p) => `<option value="${escapeHtml(p)}" ${currentFilters.provider === p ? 'selected' : ''}>${escapeHtml(p)}</option>`).join('')}
        </select>
        <select id="filter-type" class="select-filter">
          <option value="all">All Types</option>
          ${connectionTypes.map((t) => `<option value="${escapeHtml(t)}" ${currentFilters.connectionType === t ? 'selected' : ''}>${escapeHtml(t)}</option>`).join('')}
        </select>
        <select id="filter-status" class="select-filter">
          <option value="all">All Statuses</option>
          ${STATUSES.map((s) => `<option value="${s}" ${currentFilters.status === s ? 'selected' : ''}>${s}</option>`).join('')}
        </select>
      </div>
    </div>

    <div id="connections-table-container"></div>
  `;

  // Bind toolbar actions
  document.getElementById('conn-add-btn').addEventListener('click', () => openModal());

  // Export CSV
  document.getElementById('conn-export-btn').addEventListener('click', async () => {
    const list = await getConnections();
    if (list.length === 0) {
      showToast('No subscribers to export', 'error');
      return;
    }
    exportConnectionsCSV(list);
    showToast('Exported connections to CSV', 'success');
  });

  // Import
  const fileInput = document.getElementById('import-file-input');
  document.getElementById('conn-import-btn').addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', handleImportFile);

  // Search & Filters
  document.getElementById('conn-search').addEventListener('input', debounce((e) => {
    currentFilters.search = e.target.value;
    renderTable();
  }));
  document.getElementById('filter-urgency').addEventListener('change', (e) => {
    currentFilters.urgency = e.target.value;
    renderTable();
  });
  document.getElementById('filter-provider').addEventListener('change', (e) => {
    currentFilters.provider = e.target.value;
    renderTable();
  });
  document.getElementById('filter-type').addEventListener('change', (e) => {
    currentFilters.connectionType = e.target.value;
    renderTable();
  });
  document.getElementById('filter-status').addEventListener('change', (e) => {
    currentFilters.status = e.target.value;
    renderTable();
  });

  await renderTable();
}

function handleImportFile(e) {
  const file = e.target.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async (evt) => {
    try {
      const content = evt.target.result;
      let res;
      if (file.name.endsWith('.json')) {
        const data = JSON.parse(content);
        const array = Array.isArray(data) ? data : data.connections || [];
        res = await importConnections(array);
      } else {
        const [defaultProvider, defaultType] = await Promise.all([getProviders(), getConnectionTypes()]).then(([p, t]) => [p[0] || 'Railwire', t[0] || 'Broadband']);
        const lines = content.split(/\r?\n/).filter(l => l.trim());
        if (lines.length <= 1) throw new Error('Empty file');
        const rows = lines.slice(1).map(line => {
          const parts = line.split(',').map(p => p.replace(/^"|"$/g, '').trim());
          return {
            customer_name: parts[0],
            phone: parts[1] || '',
            provider: parts[2] || defaultProvider,
            connection_type: parts[3] || defaultType,
            connection_date: parts[4] || todayISO(),
            expiry_date: parts[5] || todayISO(),
            status: parts[6] || 'Active',
            notes: parts[7] || '',
          };
        });
        res = await importConnections(rows);
      }

      if (res.success) {
        showToast(`Imported ${res.count} connections`, 'success');
        await renderTable();
        if (refreshDashboardCb) refreshDashboardCb();
      } else {
        showToast('Import failed: ' + (res.message || 'unknown error'), 'error');
      }
    } catch (err) {
      showToast('Import failed: ' + err.message, 'error');
    } finally {
      e.target.value = '';
    }
  };
  reader.readAsText(file);
}

async function renderTable() {
  const container = document.getElementById('connections-table-container');
  container.innerHTML = `<div style="padding: 40px 20px; text-align: center; color: var(--text-muted); font-size: 13px;">Loading…</div>`;

  const tiers = await getAlertTiers();
  let connections = await queryConnections(currentFilters);

  if (currentFilters.urgency !== 'all') {
    connections = connections.filter((c) => {
      const days = daysUntil(c.expiry_date);
      const isOpen = c.status !== 'Disconnected' && c.status !== 'Expired';
      if (currentFilters.urgency === 'overdue') {
        return days < 0 && isOpen;
      }
      const tier = tiers.find((t) => t.id === currentFilters.urgency);
      if (!tier) return true;
      return days >= 0 && days <= tier.days && isOpen;
    });
  }

  if (connections.length === 0) {
    container.innerHTML = `
      <div style="background: var(--bg-surface); border: 1px solid var(--border-subtle); border-radius: var(--radius-lg); padding: 48px 20px; text-align: center; color: var(--text-muted);">
        <div style="margin-bottom: 8px; display: flex; justify-content: center; color: var(--text-dim);">${ICONS.search}</div>
        <div style="font-size: 15px; font-weight: 600; color: var(--text-primary);">No records match your criteria</div>
        <div style="font-size: 13px; margin-top: 4px;">Try clearing filters, or add a new subscriber.</div>
      </div>
    `;
    return;
  }

  container.innerHTML = `
    <div class="table-wrapper">
      <table class="data-table">
        <thead>
          <tr>
            <th>Subscriber / Contact</th>
            <th>Provider & Type</th>
            <th>Connected</th>
            <th>Expiry / Disc. Date</th>
            <th>Remaining</th>
            <th>Status</th>
            <th style="text-align: right;">Actions</th>
          </tr>
        </thead>
        <tbody>
          ${connections.map((c) => renderTableRow(c, tiers)).join('')}
        </tbody>
      </table>
    </div>
  `;

  // Bind Table Actions
  container.querySelectorAll('.table-edit-btn').forEach((btn) => {
    btn.addEventListener('click', () => openModal(btn.dataset.id));
  });

  container.querySelectorAll('.table-delete-btn').forEach((btn) => {
    btn.addEventListener('click', () => handleDelete(btn.dataset.id));
  });

  container.querySelectorAll('.table-status-select').forEach((sel) => {
    sel.addEventListener('change', async () => {
      const id = sel.dataset.id;
      const status = sel.value;
      const res = await updateConnection(id, { status });
      if (res.success) {
        showToast(`Status updated to ${status}`, 'success');
        await renderTable();
        if (refreshDashboardCb) refreshDashboardCb();
      } else {
        showToast(res.message || 'Failed to update status', 'error');
      }
    });
  });
}

function renderTableRow(c, tiers) {
  const days = daysUntil(c.expiry_date);
  const isOpen = c.status !== 'Disconnected' && c.status !== 'Expired';
  const badge = isOpen ? daysBadgeInfo(days, tiers) : { label: `${days}d`, color: 'var(--text-dim)' };

  const cleanPhone = (c.phone || '').replace(/[^0-9]/g, '');
  const phoneFormatted = cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone;
  const waMsg = encodeURIComponent(
    `Hello ${c.customer_name}, greetings from GlobalVision regarding your ${c.provider} (${c.connection_type}) connection.`
  );

  return `
    <tr>
      <td>
        <div class="table-cust-name">${escapeHtml(c.customer_name)}</div>
        <div style="display: flex; align-items: center; gap: 8px; margin-top: 3px;">
          <span class="table-cust-phone">${escapeHtml(c.phone || '—')}</span>
          ${
            cleanPhone
              ? `
            <a href="https://wa.me/${phoneFormatted}?text=${waMsg}" target="_blank" rel="noopener" class="action-pill pill-wa" style="padding: 2px 6px; font-size: 10px;" title="WhatsApp">
              ${ICONS.whatsapp} WA
            </a>
            <a href="tel:${cleanPhone}" class="action-pill pill-call" style="padding: 2px 6px; font-size: 10px;" title="Call">
              ${ICONS.phone} Call
            </a>
          `
              : ''
          }
        </div>
      </td>
      <td>
        <span class="provider-tag">
          ${c.connection_type === 'Broadband' ? ICONS.wifi : ICONS.tv} ${escapeHtml(c.provider)}
        </span>
        <div style="font-size: 11px; color: var(--text-dim); margin-top: 2px;">${escapeHtml(c.connection_type)}</div>
      </td>
      <td>
        <span class="table-date" style="color: var(--text-secondary);">${formatDate(c.connection_date)}</span>
      </td>
      <td>
        <span class="table-date" style="font-weight: 600; color: ${isOpen ? badge.color : 'var(--text-secondary)'};">
          ${formatDate(c.expiry_date)}
        </span>
      </td>
      <td>
        <span class="mono" style="color: ${badge.color}; font-weight: 600;">${badge.label}</span>
      </td>
      <td>
        <select class="status-chip-select table-status-select" data-id="${c.id}">
          ${STATUSES.map((s) => `<option value="${s}" ${c.status === s ? 'selected' : ''}>${s}</option>`).join('')}
        </select>
      </td>
      <td style="text-align: right;">
        <div style="display: inline-flex; gap: 4px;">
          <button type="button" class="icon-btn table-edit-btn" data-id="${c.id}" title="Edit">
            ${ICONS.edit}
          </button>
          <button type="button" class="icon-btn icon-btn-danger table-delete-btn" data-id="${c.id}" title="Delete">
            ${ICONS.trash}
          </button>
        </div>
      </td>
    </tr>
  `;
}

export async function openModal(editId = null) {
  const modal = document.getElementById('connection-modal');
  modal.innerHTML = `
    <div class="modal-backdrop" id="modal-backdrop-loading"></div>
    <div class="modal-content" style="text-align: center; padding: 40px 20px; color: var(--text-muted); font-size: 13px;">Loading…</div>
  `;
  modal.classList.remove('hidden');
  const cancelLoading = () => {
    modal.classList.add('hidden');
    modal.innerHTML = '';
  };
  document.getElementById('modal-backdrop-loading').addEventListener('click', cancelLoading);

  const [existing, providers, connectionTypes] = await Promise.all([
    editId ? getConnectionById(editId) : Promise.resolve(null),
    getProviders(),
    getConnectionTypes(),
  ]);

  modal.innerHTML = `
    <div class="modal-backdrop" id="modal-backdrop"></div>
    <div class="modal-content">
      <div class="modal-header">
        <h2>${existing ? 'Edit Subscriber' : 'Add Subscriber'}</h2>
        <button class="icon-btn" id="modal-close">${ICONS.close}</button>
      </div>
      <form id="connection-form" autocomplete="off">
        <div class="form-row">
          <div class="form-group">
            <label for="cf-name">Full Name *</label>
            <input type="text" id="cf-name" required value="${escapeHtml(existing?.customer_name || '')}" placeholder="e.g. John Doe" />
          </div>
          <div class="form-group">
            <label for="cf-phone">Mobile Phone Number</label>
            <input type="tel" id="cf-phone" value="${escapeHtml(existing?.phone || '')}" placeholder="10-digit number" />
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label for="cf-provider">Provider *</label>
            <select id="cf-provider" required>
              <option value="" disabled ${!existing ? 'selected' : ''}>Select provider</option>
              ${providers.map((p) => `<option value="${escapeHtml(p)}" ${existing?.provider === p ? 'selected' : ''}>${escapeHtml(p)}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label for="cf-type">Service Type *</label>
            <select id="cf-type" required>
              ${connectionTypes.map((t) => `<option value="${escapeHtml(t)}" ${existing?.connection_type === t ? 'selected' : ''}>${escapeHtml(t)}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label for="cf-conn-date">Start Date</label>
            <input type="date" id="cf-conn-date" value="${existing?.connection_date || todayISO()}" />
          </div>
          <div class="form-group">
            <label for="cf-expiry-date">Renewal / Expiry Date *</label>
            <input type="date" id="cf-expiry-date" required value="${existing?.expiry_date || ''}" />
          </div>
        </div>
        <div class="form-group">
          <label for="cf-status">Status</label>
          <select id="cf-status" required>
            ${STATUSES.map((s) => `<option value="${s}" ${(existing?.status || 'Active') === s ? 'selected' : ''}>${s}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label for="cf-notes">Notes</label>
          <textarea id="cf-notes" rows="2" placeholder="e.g. Requested disconnection on month end, modem pickup scheduled...">${escapeHtml(existing?.notes || '')}</textarea>
        </div>
        <div class="modal-actions">
          <button type="button" class="btn btn-ghost" id="modal-cancel">Cancel</button>
          <button type="submit" class="btn btn-primary" id="connection-form-submit">
            ${existing ? 'Save Changes' : 'Add Subscriber'}
          </button>
        </div>
      </form>
    </div>
  `;

  const closeModal = () => {
    modal.classList.add('hidden');
    modal.innerHTML = '';
  };

  document.getElementById('modal-backdrop').addEventListener('click', closeModal);
  document.getElementById('modal-close').addEventListener('click', closeModal);
  document.getElementById('modal-cancel').addEventListener('click', closeModal);

  document.getElementById('connection-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = {
      customer_name: document.getElementById('cf-name').value.trim(),
      phone: document.getElementById('cf-phone').value.trim(),
      provider: document.getElementById('cf-provider').value,
      connection_type: document.getElementById('cf-type').value,
      connection_date: document.getElementById('cf-conn-date').value,
      expiry_date: document.getElementById('cf-expiry-date').value,
      status: document.getElementById('cf-status').value,
      notes: document.getElementById('cf-notes').value.trim(),
    };

    const submitBtn = document.getElementById('connection-form-submit');
    submitBtn.disabled = true;

    const res = existing ? await updateConnection(editId, data) : await addConnection(data);
    if (res.success) {
      showToast(existing ? 'Subscriber record updated' : 'Subscriber added', 'success');
      closeModal();
      await renderTable();
      if (refreshDashboardCb) refreshDashboardCb();
    } else {
      submitBtn.disabled = false;
      showToast(res.message || 'Failed to save subscriber', 'error');
    }
  });

  setTimeout(() => document.getElementById('cf-name').focus(), 50);
}

async function handleDelete(id) {
  const c = await getConnectionById(id);
  if (!c) return;

  const modal = document.getElementById('connection-modal');
  modal.innerHTML = `
    <div class="modal-backdrop" id="del-backdrop"></div>
    <div class="modal-content" style="max-width: 400px; text-align: center;">
      <div style="margin-bottom: 10px; display: flex; justify-content: center; color: var(--danger);">${ICONS.trash}</div>
      <h2 style="font-size: 16px; margin-bottom: 6px;">Delete Subscriber</h2>
      <p style="font-size: 13px; color: var(--text-secondary); margin-bottom: 20px;">
        Permanently remove <strong>${escapeHtml(c.customer_name)}</strong> (${escapeHtml(c.provider)}) from your subscriber list?
      </p>
      <div style="display: flex; gap: 8px; justify-content: center;">
        <button type="button" class="btn btn-ghost" id="del-cancel">Cancel</button>
        <button type="button" class="btn btn-danger" id="del-confirm">Delete</button>
      </div>
    </div>
  `;

  modal.classList.remove('hidden');

  const closeModal = () => {
    modal.classList.add('hidden');
    modal.innerHTML = '';
  };

  document.getElementById('del-backdrop').addEventListener('click', closeModal);
  document.getElementById('del-cancel').addEventListener('click', closeModal);
  document.getElementById('del-confirm').addEventListener('click', async () => {
    const res = await deleteConnection(id);
    if (res.success) {
      showToast('Subscriber deleted', 'success');
      closeModal();
      await renderTable();
      if (refreshDashboardCb) refreshDashboardCb();
    } else {
      showToast(res.message || 'Failed to delete subscriber', 'error');
    }
  });
}
