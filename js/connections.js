/**
 * Connections view — Precision Data Table & Subscriber Management.
 * Features:
 * 1. Rich Data Table with column sorting, live status update, quick +1M renew
 * 2. Multi-select checkboxes & Floating Bulk Actions Bar (Bulk Renew, Bulk Status, Bulk Export)
 * 3. Customer 360° Drawer with full hardware info, live dues, quick actions
 * 4. Add/Edit modal with Master Plan Presets, Box/STB/Address fields, and Quick Expiry buttons
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
  getSubscriberRate,
  setSubscriberRate,
  quickRenewConnection,
  bulkUpdateConnections,
  getMasterPlans,
  getBusinessProfile,
  getCustomerBillingHistory,
  getConnectionEvents,
} from './store.js';
import { getCurrentUser } from './auth.js';
import { openCustomerBillingModal, openRecordPaymentModal } from './billing.js';
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
  addMonths,
  formatCurrency,
  generateWhatsAppReminderText,
} from './utils.js';

let currentFilters = { search: '', provider: 'all', connectionType: 'all', status: 'all', urgency: 'all' };
let currentSort = { column: 'expiry_date', dir: 'asc' };
let selectedConnectionIds = new Set();
let refreshDashboardCb = null;

export function resetConnectionFilters() {
  currentFilters = { search: '', provider: 'all', connectionType: 'all', status: 'all', urgency: 'all' };
  selectedConnectionIds.clear();
}

// ─── Metadata Serialization (Box, Address, Alt Phone, ONT) ──
export function parseNotesMetadata(rawNotes = '') {
  let notes = rawNotes || '';
  let boxNo = '';
  let address = '';
  let altPhone = '';
  let ont = '';

  const mBox = notes.match(/\[(?:Box|STB|VSC):\s*([^\]]+)\]/i);
  if (mBox) { boxNo = mBox[1].trim(); notes = notes.replace(mBox[0], '').trim(); }

  const mAddr = notes.match(/\[(?:Address|Area|Landmark):\s*([^\]]+)\]/i);
  if (mAddr) { address = mAddr[1].trim(); notes = notes.replace(mAddr[0], '').trim(); }

  const mAlt = notes.match(/\[(?:AltPhone|Alt):\s*([^\]]+)\]/i);
  if (mAlt) { altPhone = mAlt[1].trim(); notes = notes.replace(mAlt[0], '').trim(); }

  const mOnt = notes.match(/\[(?:ONT|Router|MAC):\s*([^\]]+)\]/i);
  if (mOnt) { ont = mOnt[1].trim(); notes = notes.replace(mOnt[0], '').trim(); }

  // Clean rate tag if present
  notes = notes.replace(/\[(?:Rate|Plan):\s*₹?\d+(?:\.\d+)?\]/gi, '').trim();

  return { cleanNotes: notes, boxNo, address, altPhone, ont };
}

export function formatNotesMetadata(cleanNotes, { rate, boxNo, address, altPhone, ont } = {}) {
  const parts = [];
  if (cleanNotes && cleanNotes.trim()) parts.push(cleanNotes.trim());
  if (rate) parts.push(`[Rate: ₹${rate}]`);
  if (boxNo && boxNo.trim()) parts.push(`[Box: ${boxNo.trim()}]`);
  if (address && address.trim()) parts.push(`[Address: ${address.trim()}]`);
  if (altPhone && altPhone.trim()) parts.push(`[Alt: ${altPhone.trim()}]`);
  if (ont && ont.trim()) parts.push(`[ONT: ${ont.trim()}]`);
  return parts.join(' ');
}

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
      <div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
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
          <input type="search" id="conn-search" placeholder="Filter by customer name, phone, or Box number..." value="${escapeHtml(currentFilters.search)}" />
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
        ${
          currentFilters.search || currentFilters.provider !== 'all' || currentFilters.connectionType !== 'all' || currentFilters.status !== 'all' || currentFilters.urgency !== 'all'
            ? `<button type="button" class="btn btn-sm btn-ghost text-danger" id="toolbar-clear-filters" title="Reset all filters">✕ Clear</button>`
            : ''
        }
      </div>
    </div>

    <!-- Table Container -->
    <div id="connections-table-container"></div>

    <!-- Floating Bulk Actions Bar -->
    <div id="conn-bulk-bar" class="bulk-action-bar hidden"></div>

    <!-- Customer 360 Drawer Overlay -->
    <div id="customer-drawer-container"></div>
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

  const toolbarClearBtn = document.getElementById('toolbar-clear-filters');
  if (toolbarClearBtn) {
    toolbarClearBtn.addEventListener('click', () => {
      resetConnectionFilters();
      renderConnections(refreshDashboardCb);
    });
  }

  await renderTable();
}

function parseCsvLine(line) {
  const out = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      out.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out.map((s) => s.trim());
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
        const lines = content.split(/\r?\n/).filter((l) => l.trim());
        if (lines.length <= 1) throw new Error('Empty file');
        const rows = lines.slice(1).map((line) => {
          const parts = parseCsvLine(line);
          return {
            customer_name: parts[0],
            phone: parts[1] || '',
            provider: parts[2] || '',
            connection_type: parts[3] || '',
            connection_date: parts[4] || '',
            expiry_date: parts[5] || '',
            status: parts[6] || '',
            notes: parts[7] || '',
          };
        });
        res = await importConnections(rows);
      }

      if (res.success) {
        const skipped = res.skipped
          ? ` (${res.skipped} row${res.skipped === 1 ? '' : 's'} skipped — missing name or a valid expiry date)`
          : '';
        showToast(`Imported ${res.count} connections${skipped}`, res.skipped ? 'warning' : 'success');
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
  if (!container) return;
  container.innerHTML = `<div style="padding: 40px 20px; text-align: center; color: var(--text-muted); font-size: 13px;">Loading…</div>`;

  const tiers = await getAlertTiers();

  if (
    currentFilters.urgency !== 'all' &&
    currentFilters.urgency !== 'overdue' &&
    !tiers.some((t) => t.id === currentFilters.urgency)
  ) {
    currentFilters.urgency = tiers.length ? tiers[0].id : 'all';
    const urgencySelect = document.getElementById('filter-urgency');
    if (urgencySelect) urgencySelect.value = currentFilters.urgency;
  }

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

  // Sorting
  connections.sort((a, b) => {
    let vA, vB;
    if (currentSort.column === 'customer_name') {
      vA = (a.customer_name || '').toLowerCase();
      vB = (b.customer_name || '').toLowerCase();
    } else if (currentSort.column === 'provider') {
      vA = (a.provider || '').toLowerCase();
      vB = (b.provider || '').toLowerCase();
    } else if (currentSort.column === 'connection_date') {
      vA = new Date(a.connection_date || '1970-01-01');
      vB = new Date(b.connection_date || '1970-01-01');
    } else if (currentSort.column === 'remaining') {
      vA = daysUntil(a.expiry_date);
      vB = daysUntil(b.expiry_date);
    } else if (currentSort.column === 'rate') {
      vA = getSubscriberRate(a);
      vB = getSubscriberRate(b);
    } else if (currentSort.column === 'status') {
      vA = (a.status || '').toLowerCase();
      vB = (b.status || '').toLowerCase();
    } else {
      // expiry_date default
      vA = new Date(a.expiry_date || '1970-01-01');
      vB = new Date(b.expiry_date || '1970-01-01');
    }

    if (vA < vB) return currentSort.dir === 'asc' ? -1 : 1;
    if (vA > vB) return currentSort.dir === 'asc' ? 1 : -1;
    return 0;
  });

  if (connections.length === 0) {
    container.innerHTML = `
      <div style="background: var(--bg-surface); border: 1px solid var(--border-subtle); border-radius: var(--radius-lg); padding: 48px 20px; text-align: center; color: var(--text-muted);">
        <div style="margin-bottom: 8px; display: flex; justify-content: center; color: var(--text-dim);">${ICONS.search}</div>
        <div style="font-size: 15px; font-weight: 600; color: var(--text-primary);">No records match your criteria</div>
        <div style="font-size: 13px; margin-top: 4px; color: var(--text-muted);">A filter is currently hiding subscribers.</div>
        <button type="button" class="btn btn-sm btn-primary" id="conn-clear-filters-btn" style="margin-top: 14px;">
          Show All Subscribers
        </button>
      </div>
    `;

    const clearBtn = document.getElementById('conn-clear-filters-btn');
    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        resetConnectionFilters();
        renderConnections(refreshDashboardCb);
      });
    }
    updateBulkBar();
    return;
  }

  const allSelected = connections.length > 0 && connections.every((c) => selectedConnectionIds.has(c.id));

  container.innerHTML = `
    <div class="table-wrapper">
      <table class="data-table">
        <thead>
          <tr>
            <th style="width: 40px; text-align: center;">
              <input type="checkbox" id="conn-select-all" class="table-check" ${allSelected ? 'checked' : ''} title="Select All" />
            </th>
            <th class="th-sortable" data-sort="customer_name">
              Subscriber / Contact ${getSortIndicator('customer_name')}
            </th>
            <th class="th-sortable" data-sort="provider">
              Provider &amp; Type ${getSortIndicator('provider')}
            </th>
            <th class="th-sortable" data-sort="connection_date">
              Connected ${getSortIndicator('connection_date')}
            </th>
            <th class="th-sortable" data-sort="expiry_date">
              Expiry Date ${getSortIndicator('expiry_date')}
            </th>
            <th class="th-sortable" data-sort="remaining">
              Remaining ${getSortIndicator('remaining')}
            </th>
            <th class="th-sortable" data-sort="rate">
              Rate ${getSortIndicator('rate')}
            </th>
            <th class="th-sortable" data-sort="status">
              Status ${getSortIndicator('status')}
            </th>
            <th style="text-align: right; min-width: 140px;">Actions</th>
          </tr>
        </thead>
        <tbody>
          ${connections.map((c) => renderTableRow(c, tiers)).join('')}
        </tbody>
      </table>
    </div>
  `;

  // Sort Header Click Listeners
  container.querySelectorAll('th.th-sortable').forEach((th) => {
    th.addEventListener('click', () => {
      const col = th.dataset.sort;
      if (currentSort.column === col) {
        currentSort.dir = currentSort.dir === 'asc' ? 'desc' : 'asc';
      } else {
        currentSort.column = col;
        currentSort.dir = 'asc';
      }
      renderTable();
    });
  });

  // Select All Checkbox
  const selectAll = document.getElementById('conn-select-all');
  if (selectAll) {
    selectAll.addEventListener('change', (e) => {
      if (e.target.checked) {
        connections.forEach((c) => selectedConnectionIds.add(c.id));
      } else {
        connections.forEach((c) => selectedConnectionIds.delete(c.id));
      }
      renderTable();
    });
  }

  // Row Checkboxes
  container.querySelectorAll('.conn-row-check').forEach((chk) => {
    chk.addEventListener('change', (e) => {
      const id = chk.dataset.id;
      if (e.target.checked) {
        selectedConnectionIds.add(id);
      } else {
        selectedConnectionIds.delete(id);
      }
      updateBulkBar();
    });
  });

  // Table Row Click to Open Customer 360 Drawer
  container.querySelectorAll('.table-row-clickable').forEach((row) => {
    row.addEventListener('click', (e) => {
      // Don't trigger if clicked on a button, select, link, or checkbox
      if (e.target.closest('button, a, select, input, label')) return;
      openCustomerDrawer(row.dataset.id);
    });
  });

  // Click on customer name triggers Drawer
  container.querySelectorAll('.table-cust-name-link').forEach((link) => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      openCustomerDrawer(link.dataset.id);
    });
  });

  // Quick +1M Renew Action
  container.querySelectorAll('.table-quick-renew-btn').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const id = btn.dataset.id;
      btn.disabled = true;
      btn.textContent = '…';
      const actor = await getCurrentUser();
      const res = await quickRenewConnection(id, 1, actor);
      if (res.success) {
        showToast('Renewed validity for 1 month (+1M)', 'success');
        await renderTable();
        if (refreshDashboardCb) refreshDashboardCb();
      } else {
        showToast(res.message || 'Renewal failed', 'error');
        btn.disabled = false;
        btn.textContent = '+1M';
      }
    });
  });

  // Open Drawer from action icon
  container.querySelectorAll('.table-drawer-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      openCustomerDrawer(btn.dataset.id);
    });
  });

  // View Bills Action
  container.querySelectorAll('.table-bills-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      openCustomerBillingModal(btn.dataset.id, async () => {
        if (refreshDashboardCb) refreshDashboardCb();
      });
    });
  });

  // Edit Action
  container.querySelectorAll('.table-edit-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      openModal(btn.dataset.id);
    });
  });

  // Delete Action
  container.querySelectorAll('.table-delete-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      handleDelete(btn.dataset.id);
    });
  });

  // Status Select Change
  container.querySelectorAll('.table-status-select').forEach((sel) => {
    sel.addEventListener('change', async (e) => {
      e.stopPropagation();
      const id = sel.dataset.id;
      const status = sel.value;
      const actor = await getCurrentUser();
      const res = await updateConnection(id, { status }, actor);
      if (res.success) {
        showToast(`Status updated to ${status}`, 'success');
        await renderTable();
        if (refreshDashboardCb) refreshDashboardCb();
      } else {
        showToast(res.message || 'Failed to update status', 'error');
        await renderTable();
      }
    });
  });

  updateBulkBar();
}

function getSortIndicator(col) {
  if (currentSort.column !== col) return '<span class="sort-icon-neutral">↕</span>';
  return currentSort.dir === 'asc' ? '<span class="sort-icon-active">↑</span>' : '<span class="sort-icon-active">↓</span>';
}

function updateBulkBar() {
  const bar = document.getElementById('conn-bulk-bar');
  if (!bar) return;
  const count = selectedConnectionIds.size;
  if (count === 0) {
    bar.classList.add('hidden');
    bar.innerHTML = '';
    return;
  }

  bar.classList.remove('hidden');
  bar.innerHTML = `
    <div class="bulk-bar-inner">
      <div class="bulk-bar-count">
        <span class="bulk-badge-num">${count}</span>
        <span>selected</span>
      </div>
      <div class="bulk-bar-actions">
        <button type="button" class="btn btn-sm btn-ghost" id="bulk-renew-btn" title="Extend selected by 1 month">
          ${ICONS.plus} Renew +1M
        </button>
        <div style="display: flex; align-items: center; gap: 4px;">
          <span style="font-size: 11px; color: var(--text-muted);">Status:</span>
          <select id="bulk-status-select" class="select-filter" style="font-size: 11px; padding: 4px 8px;">
            <option value="" disabled selected>Change Status…</option>
            ${STATUSES.map((s) => `<option value="${s}">${s}</option>`).join('')}
          </select>
        </div>
        <button type="button" class="btn btn-sm btn-ghost" id="bulk-export-btn" title="Export selected to CSV">
          ${ICONS.download} Export
        </button>
        <button type="button" class="btn btn-sm btn-ghost text-danger" id="bulk-clear-btn" title="Deselect all">
          ✕
        </button>
      </div>
    </div>
  `;

  document.getElementById('bulk-clear-btn').onclick = () => {
    selectedConnectionIds.clear();
    renderTable();
  };

  document.getElementById('bulk-renew-btn').onclick = async () => {
    const ids = Array.from(selectedConnectionIds);
    const actor = await getCurrentUser();
    let renewed = 0;
    for (const id of ids) {
      const res = await quickRenewConnection(id, 1, actor);
      if (res.success) renewed++;
    }
    showToast(`Quick renewed ${renewed} subscribers for +1 Month`, 'success');
    selectedConnectionIds.clear();
    await renderTable();
    if (refreshDashboardCb) refreshDashboardCb();
  };

  document.getElementById('bulk-status-select').onchange = async (e) => {
    const newStatus = e.target.value;
    if (!newStatus) return;
    const ids = Array.from(selectedConnectionIds);
    const actor = await getCurrentUser();
    const res = await bulkUpdateConnections(ids, { status: newStatus }, actor);
    showToast(`Updated ${res.count} subscribers to ${newStatus}`, 'success');
    selectedConnectionIds.clear();
    await renderTable();
    if (refreshDashboardCb) refreshDashboardCb();
  };

  document.getElementById('bulk-export-btn').onclick = async () => {
    const all = await getConnections();
    const selected = all.filter((c) => selectedConnectionIds.has(c.id));
    exportConnectionsCSV(selected);
    showToast(`Exported ${selected.length} subscribers to CSV`, 'success');
  };
}

function withCurrent(list, value) {
  return value && !list.includes(value) ? [value, ...list] : list;
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

  const rate = getSubscriberRate(c);
  const meta = parseNotesMetadata(c.notes);
  const isSelected = selectedConnectionIds.has(c.id);

  return `
    <tr class="table-row-clickable ${isSelected ? 'row-selected' : ''}" data-id="${c.id}">
      <td style="text-align: center;" onclick="event.stopPropagation();">
        <input type="checkbox" class="conn-row-check table-check" data-id="${c.id}" ${isSelected ? 'checked' : ''} />
      </td>
      <td>
        <div class="table-cust-name table-cust-name-link" data-id="${c.id}" title="Click to view full Customer 360 profile">
          ${escapeHtml(c.customer_name)}
        </div>
        <div style="display: flex; align-items: center; gap: 8px; margin-top: 3px; flex-wrap: wrap;">
          <span class="table-cust-phone">${escapeHtml(c.phone || '—')}</span>
          ${
            meta.boxNo
              ? `<span class="badge-subtle" title="Box / STB Number" style="font-size: 10px; padding: 1px 5px;">${escapeHtml(meta.boxNo)}</span>`
              : ''
          }
          ${
            cleanPhone
              ? `
            <a href="https://wa.me/${phoneFormatted}?text=${waMsg}" target="_blank" rel="noopener" class="action-pill pill-wa" style="padding: 2px 6px; font-size: 10px;" title="WhatsApp" onclick="event.stopPropagation();">
              ${ICONS.whatsapp} WA
            </a>
            <a href="tel:${cleanPhone}" class="action-pill pill-call" style="padding: 2px 6px; font-size: 10px;" title="Call" onclick="event.stopPropagation();">
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
        <span class="mono" style="font-weight: 600; color: var(--text-primary); font-size: 13px;">${formatCurrency(rate)}</span>
      </td>
      <td onclick="event.stopPropagation();">
        <select class="status-chip-select table-status-select" data-id="${c.id}">
          ${withCurrent(STATUSES, c.status)
            .map((s) => `<option value="${escapeHtml(s)}" ${c.status === s ? 'selected' : ''}>${escapeHtml(s)}</option>`)
            .join('')}
        </select>
      </td>
      <td style="text-align: right;" onclick="event.stopPropagation();">
        <div style="display: inline-flex; gap: 4px; align-items: center;">
          <button type="button" class="btn btn-sm btn-ghost table-quick-renew-btn" data-id="${c.id}" title="Quick renew for 1 Month (+1M)">
            +1M
          </button>
          <button type="button" class="icon-btn table-drawer-btn" data-id="${c.id}" title="Customer 360° Profile">
            ${ICONS.eye}
          </button>
          <button type="button" class="icon-btn table-bills-btn" data-id="${c.id}" title="View & Manage Bills">
            ${ICONS.receipt}
          </button>
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

// ═════════════════════════════════════════════════════════════
// CUSTOMER 360° DRAWER / PROFILE MODAL
// ═════════════════════════════════════════════════════════════
export async function openCustomerDrawer(connectionId) {
  const container = document.getElementById('customer-drawer-container');
  if (!container) return;

  container.innerHTML = `
    <div class="drawer-backdrop" id="drawer-backdrop"></div>
    <div class="drawer-content drawer-loading">
      <div style="padding: 40px; text-align: center; color: var(--text-muted);">Loading customer profile…</div>
    </div>
  `;

  const [conn, tiers, billingHistory, allEvents, business] = await Promise.all([
    getConnectionById(connectionId),
    getAlertTiers(),
    getCustomerBillingHistory(connectionId, { lookbackMonths: 12 }),
    getConnectionEvents({ limit: 50 }),
    getBusinessProfile(),
  ]);

  if (!conn) {
    showToast('Customer not found', 'error');
    container.innerHTML = '';
    return;
  }

  const meta = parseNotesMetadata(conn.notes);
  const rate = getSubscriberRate(conn);
  const days = daysUntil(conn.expiry_date);
  const isOpen = conn.status !== 'Disconnected' && conn.status !== 'Expired';
  const badge = isOpen ? daysBadgeInfo(days, tiers) : { label: `${days}d`, color: 'var(--text-dim)' };

  const cleanPhone = (conn.phone || '').replace(/[^0-9]/g, '');
  const phoneFormatted = cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone;
  const waReminderMsg = encodeURIComponent(generateWhatsAppReminderText(conn, billingHistory, business));

  const custEvents = (allEvents?.events || []).filter((e) => e.connection_id === conn.id);

  container.innerHTML = `
    <div class="drawer-backdrop" id="drawer-backdrop"></div>
    <div class="drawer-content">
      <!-- Drawer Header -->
      <div class="drawer-header">
        <div style="display: flex; align-items: center; gap: 12px;">
          <div class="drawer-avatar">${escapeHtml(conn.customer_name.charAt(0).toUpperCase())}</div>
          <div>
            <h2 class="drawer-title">${escapeHtml(conn.customer_name)}</h2>
            <div style="display: flex; align-items: center; gap: 8px; margin-top: 2px;">
              <span class="provider-tag" style="font-size: 11px;">
                ${conn.connection_type === 'Broadband' ? ICONS.wifi : ICONS.tv} ${escapeHtml(conn.provider)}
              </span>
              <span class="drawer-status-chip ${conn.status === 'Active' ? 'chip-active' : ''}">${escapeHtml(conn.status)}</span>
            </div>
          </div>
        </div>
        <button type="button" class="icon-btn" id="drawer-close-btn">${ICONS.close}</button>
      </div>

      <!-- Quick Action Bar -->
      <div class="drawer-action-strip">
        <button type="button" class="btn btn-sm btn-primary" id="dr-renew-1m-btn" title="Quick extend validity by 1 month">
          ${ICONS.plus} +1M Renew
        </button>
        <button type="button" class="btn btn-sm btn-ghost" id="dr-renew-3m-btn" title="Quick extend validity by 3 months">
          +3M
        </button>
        <button type="button" class="btn btn-sm btn-ghost" id="dr-pay-btn" title="Open Billing / Settle Dues">
          ${ICONS.receipt} Settle Dues
        </button>
        ${
          cleanPhone
            ? `
          <a href="https://wa.me/${phoneFormatted}?text=${waReminderMsg}" target="_blank" rel="noopener" class="btn btn-sm btn-ghost" style="color: #16a34a;" title="Send WhatsApp Payment Reminder">
            ${ICONS.whatsapp} WA Reminder
          </a>
          <a href="tel:${cleanPhone}" class="btn btn-sm btn-ghost" title="Call">
            ${ICONS.phone} Call
          </a>
        `
            : ''
        }
        <button type="button" class="btn btn-sm btn-ghost" id="dr-edit-btn" title="Edit Customer Details">
          ${ICONS.edit} Edit
        </button>
      </div>

      <!-- Drawer Body -->
      <div class="drawer-body">
        <!-- 1. Validity & Plan Highlight Card -->
        <div class="drawer-card">
          <div class="drawer-card-header">
            ${ICONS.calendar}
            <span>Subscription &amp; Expiry</span>
          </div>
          <div class="drawer-grid-2">
            <div class="drawer-field">
              <span class="df-label">Monthly Rate</span>
              <span class="df-val mono" style="font-size: 16px; font-weight: 700; color: var(--accent);">${formatCurrency(rate)}/mo</span>
            </div>
            <div class="drawer-field">
              <span class="df-label">Remaining Time</span>
              <span class="df-val mono" style="font-size: 16px; font-weight: 700; color: ${badge.color};">${badge.label}</span>
            </div>
            <div class="drawer-field">
              <span class="df-label">Renewal / Expiry Date</span>
              <span class="df-val" style="font-weight: 600;">${formatDate(conn.expiry_date)}</span>
            </div>
            <div class="drawer-field">
              <span class="df-label">Connected On</span>
              <span class="df-val" style="color: var(--text-secondary);">${formatDate(conn.connection_date)}</span>
            </div>
          </div>
        </div>

        <!-- 2. Overdue Dues & Billing Card -->
        <div class="drawer-card ${billingHistory.totalOverdue > 0 ? 'card-border-danger' : ''}">
          <div class="drawer-card-header" style="justify-content: space-between;">
            <div style="display: flex; align-items: center; gap: 8px;">
              ${ICONS.receipt}
              <span>Outstanding Dues</span>
            </div>
            <span class="mono" style="font-weight: 800; font-size: 16px; color: ${billingHistory.totalOverdue > 0 ? 'var(--danger)' : 'var(--success)'};">
              ${formatCurrency(billingHistory.totalOverdue)}
            </span>
          </div>
          ${
            billingHistory.unpaidMonths && billingHistory.unpaidMonths.length > 0
              ? `
            <div style="font-size: 12px; color: var(--text-secondary); margin-bottom: 8px;">
              <strong>${billingHistory.unpaidDuesCount} Unpaid Month(s):</strong>
            </div>
            <div class="unpaid-months-chips" style="margin-bottom: 12px;">
              ${billingHistory.unpaidMonths
                .map(
                  (m) => `
                <span class="month-chip ${m.isOverdue ? 'chip-overdue' : 'chip-current'}">
                  ${m.shortLabel} (${formatCurrency(m.outstanding || m.amount)})
                </span>
              `
                )
                .join('')}
            </div>
            <button type="button" class="btn btn-sm btn-primary btn-full" id="dr-settle-dues-btn">
              ${ICONS.check} Settle Outstanding (${formatCurrency(billingHistory.totalOverdue)})
            </button>
          `
              : `
            <div style="color: var(--success); font-size: 13px; font-weight: 600; display: flex; align-items: center; gap: 6px;">
              ${ICONS.check} All dues are fully cleared and up to date!
            </div>
          `
          }
        </div>

        <!-- 3. Hardware & Installation Info -->
        <div class="drawer-card">
          <div class="drawer-card-header">
            ${ICONS.building}
            <span>Hardware &amp; Installation</span>
          </div>
          <div class="drawer-grid-2">
            <div class="drawer-field">
              <span class="df-label">Box / STB / VSC No.</span>
              <span class="df-val mono" style="font-weight: 600;">${escapeHtml(meta.boxNo || '—')}</span>
            </div>
            <div class="drawer-field">
              <span class="df-label">ONT / Router Serial</span>
              <span class="df-val mono">${escapeHtml(meta.ont || '—')}</span>
            </div>
            <div class="drawer-field" style="grid-column: span 2;">
              <span class="df-label">Installation Address / Landmark</span>
              <span class="df-val">${escapeHtml(meta.address || '—')}</span>
            </div>
            <div class="drawer-field">
              <span class="df-label">Primary Phone</span>
              <span class="df-val mono">${escapeHtml(conn.phone || '—')}</span>
            </div>
            <div class="drawer-field">
              <span class="df-label">Alternate Phone</span>
              <span class="df-val mono">${escapeHtml(meta.altPhone || '—')}</span>
            </div>
            ${
              meta.cleanNotes
                ? `
              <div class="drawer-field" style="grid-column: span 2;">
                <span class="df-label">Notes &amp; Remarks</span>
                <span class="df-val" style="color: var(--text-secondary);">${escapeHtml(meta.cleanNotes)}</span>
              </div>
            `
                : ''
            }
          </div>
        </div>

        <!-- 4. Recent Activity Log -->
        <div class="drawer-card">
          <div class="drawer-card-header">
            ${ICONS.history}
            <span>Recent Activity</span>
          </div>
          ${
            custEvents.length === 0
              ? `<div style="font-size: 12px; color: var(--text-muted);">No activity recorded yet for this subscriber.</div>`
              : `
            <div class="drawer-timeline">
              ${custEvents.slice(0, 5).map((e) => `
                <div class="timeline-row">
                  <span class="timeline-dot"></span>
                  <div class="timeline-content">
                    <div style="font-size: 12px; font-weight: 600;">Status changed to <span style="color: var(--accent);">${escapeHtml(e.new_status)}</span></div>
                    <div style="font-size: 11px; color: var(--text-dim);">${formatDate(e.created_at)} &bull; ${escapeHtml(e.changed_by_name || 'System')}</div>
                  </div>
                </div>
              `).join('')}
            </div>
          `
          }
        </div>
      </div>
    </div>
  `;

  const closeDrawer = () => {
    container.innerHTML = '';
  };

  document.getElementById('drawer-backdrop').onclick = closeDrawer;
  document.getElementById('drawer-close-btn').onclick = closeDrawer;

  // Quick renew buttons from Drawer
  document.getElementById('dr-renew-1m-btn').onclick = async () => {
    const actor = await getCurrentUser();
    const res = await quickRenewConnection(conn.id, 1, actor);
    if (res.success) {
      showToast('Extended validity by 1 month', 'success');
      closeDrawer();
      await renderTable();
      if (refreshDashboardCb) refreshDashboardCb();
    } else {
      showToast(res.message || 'Renewal failed', 'error');
    }
  };

  document.getElementById('dr-renew-3m-btn').onclick = async () => {
    const actor = await getCurrentUser();
    const res = await quickRenewConnection(conn.id, 3, actor);
    if (res.success) {
      showToast('Extended validity by 3 months', 'success');
      closeDrawer();
      await renderTable();
      if (refreshDashboardCb) refreshDashboardCb();
    } else {
      showToast(res.message || 'Renewal failed', 'error');
    }
  };

  document.getElementById('dr-pay-btn').onclick = () => {
    closeDrawer();
    openCustomerBillingModal(conn.id, () => {
      renderTable();
      if (refreshDashboardCb) refreshDashboardCb();
    });
  };

  const settleDuesBtn = document.getElementById('dr-settle-dues-btn');
  if (settleDuesBtn) {
    settleDuesBtn.onclick = () => {
      closeDrawer();
      openRecordPaymentModal({
        connectionId: conn.id,
        customerName: conn.customer_name,
        phone: conn.phone,
        provider: conn.provider,
        connectionType: conn.connection_type,
        onSaved: () => {
          renderTable();
          if (refreshDashboardCb) refreshDashboardCb();
        },
      });
    };
  }

  document.getElementById('dr-edit-btn').onclick = () => {
    closeDrawer();
    openModal(conn.id, () => {
      renderTable();
      if (refreshDashboardCb) refreshDashboardCb();
    });
  };
}

// ═════════════════════════════════════════════════════════════
// ADD / EDIT SUBSCRIBER MODAL
// ═════════════════════════════════════════════════════════════
export async function openModal(editId = null, onSaved = null) {
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

  const [existing, allProviders, allConnectionTypes, masterPlans] = await Promise.all([
    editId ? getConnectionById(editId) : Promise.resolve(null),
    getProviders(),
    getConnectionTypes(),
    getMasterPlans(),
  ]);

  if (editId && !existing) {
    modal.classList.add('hidden');
    modal.innerHTML = '';
    showToast('Could not load that subscriber — please try again', 'error');
    return;
  }

  const providers = withCurrent(allProviders, existing?.provider);
  const connectionTypes = withCurrent(allConnectionTypes, existing?.connection_type);
  const statuses = withCurrent(STATUSES, existing?.status);
  const meta = parseNotesMetadata(existing?.notes);
  const currentRate = getSubscriberRate(existing);

  modal.innerHTML = `
    <div class="modal-backdrop" id="modal-backdrop"></div>
    <div class="modal-content" style="max-width: 580px;">
      <div class="modal-header">
        <div>
          <h2>${existing ? 'Edit Subscriber' : 'Add Subscriber'}</h2>
          <div style="font-size: 12px; color: var(--text-muted); margin-top: 2px;">
            ${existing ? `Update subscriber account & service info` : `Register a new broadband or cable TV subscriber`}
          </div>
        </div>
        <button class="icon-btn" id="modal-close">${ICONS.close}</button>
      </div>

      <form id="connection-form" autocomplete="off">
        <!-- Quick Plan Preset Selector (if available) -->
        ${
          masterPlans.length > 0
            ? `
          <div class="form-group" style="background: var(--bg-surface-raised); padding: 10px 14px; border-radius: var(--radius-md); border: 1px dashed var(--border-default); margin-bottom: 14px;">
            <label for="cf-plan-preset" style="display: flex; align-items: center; gap: 6px; font-size: 11px; font-weight: 700; color: var(--accent); margin-bottom: 4px;">
              ${ICONS.tag} Quick Master Plan Preset (Optional)
            </label>
            <select id="cf-plan-preset" class="select-filter" style="width: 100%; font-size: 13px;">
              <option value="">-- Choose a package to auto-fill rate & service --</option>
              ${masterPlans
                .map(
                  (p) =>
                    `<option value="${p.id}" data-rate="${p.rate}" data-provider="${escapeHtml(p.provider)}" data-type="${escapeHtml(p.connection_type)}">${escapeHtml(p.name)} &bull; ${formatCurrency(p.rate)} (${escapeHtml(p.provider)} - ${escapeHtml(p.connection_type)})</option>`
                )
                .join('')}
            </select>
          </div>
        `
            : ''
        }

        <!-- Name & Primary Phone -->
        <div class="form-row">
          <div class="form-group">
            <label for="cf-name">Customer Full Name *</label>
            <input type="text" id="cf-name" required value="${escapeHtml(existing?.customer_name || '')}" placeholder="e.g. John Doe" />
          </div>
          <div class="form-group">
            <label for="cf-phone">Mobile Phone Number</label>
            <input type="tel" id="cf-phone" value="${escapeHtml(existing?.phone || '')}" placeholder="10-digit mobile" />
          </div>
        </div>

        <!-- Provider & Service Type -->
        <div class="form-row">
          <div class="form-group">
            <label for="cf-provider">Provider / ISP *</label>
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

        <!-- Dates & Quick Validity Extenders -->
        <div class="form-row">
          <div class="form-group">
            <label for="cf-conn-date">Connection Start Date</label>
            <input type="date" id="cf-conn-date" value="${existing?.connection_date || todayISO()}" />
          </div>
          <div class="form-group">
            <div style="display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 4px;">
              <label for="cf-expiry-date" style="margin-bottom: 0;">Renewal / Expiry Date *</label>
              <div class="quick-validity-pills">
                <button type="button" class="btn-date-pill" data-months="1" title="Add 1 Month">+1M</button>
                <button type="button" class="btn-date-pill" data-months="3" title="Add 3 Months">+3M</button>
                <button type="button" class="btn-date-pill" data-months="6" title="Add 6 Months">+6M</button>
                <button type="button" class="btn-date-pill" data-months="12" title="Add 1 Year">+1Y</button>
              </div>
            </div>
            <input type="date" id="cf-expiry-date" required value="${existing?.expiry_date || ''}" />
          </div>
        </div>

        <!-- Status & Rate -->
        <div class="form-row">
          <div class="form-group">
            <label for="cf-status">Subscription Status</label>
            <select id="cf-status" required>
              ${statuses.map((s) => `<option value="${escapeHtml(s)}" ${(existing?.status || 'Active') === s ? 'selected' : ''}>${escapeHtml(s)}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label for="cf-rate">Monthly Plan Rate (₹)</label>
            <input type="number" id="cf-rate" min="0" step="1" value="${currentRate}" placeholder="e.g. 500" />
          </div>
        </div>

        <!-- Hardware & Installation Details (Box, Address, Alt Phone, ONT) -->
        <div class="form-row">
          <div class="form-group">
            <label for="cf-box">Box / STB / VSC Number</label>
            <input type="text" id="cf-box" value="${escapeHtml(meta.boxNo)}" placeholder="e.g. 3150015161" />
          </div>
          <div class="form-group">
            <label for="cf-ont">ONT / Router Serial / IP</label>
            <input type="text" id="cf-ont" value="${escapeHtml(meta.ont)}" placeholder="e.g. HWTC12345" />
          </div>
        </div>

        <div class="form-row">
          <div class="form-group">
            <label for="cf-address">Installation Address / Landmark</label>
            <input type="text" id="cf-address" value="${escapeHtml(meta.address)}" placeholder="e.g. House No 4, Near Temple, Velur" />
          </div>
          <div class="form-group">
            <label for="cf-alt-phone">Alternate Contact Number</label>
            <input type="tel" id="cf-alt-phone" value="${escapeHtml(meta.altPhone)}" placeholder="e.g. 9846000000" />
          </div>
        </div>

        <!-- Notes -->
        <div class="form-group">
          <label for="cf-notes">Remarks / Free Notes</label>
          <textarea id="cf-notes" rows="2" placeholder="e.g. Requested disconnection on month end, modem pickup scheduled...">${escapeHtml(meta.cleanNotes)}</textarea>
        </div>

        <div class="modal-actions" style="display: flex; justify-content: space-between; align-items: center;">
          ${
            existing
              ? `<button type="button" class="btn btn-ghost" id="cf-clone-btn" title="Create duplicate connection for this customer">${ICONS.copy} Clone</button>`
              : `<div></div>`
          }
          <div style="display: flex; gap: 8px;">
            <button type="button" class="btn btn-ghost" id="modal-cancel">Cancel</button>
            <button type="submit" class="btn btn-primary" id="connection-form-submit">
              ${existing ? 'Save Changes' : 'Add Subscriber'}
            </button>
          </div>
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

  // Plan Preset Change Listener
  const presetSelect = document.getElementById('cf-plan-preset');
  if (presetSelect) {
    presetSelect.addEventListener('change', (e) => {
      const opt = e.target.selectedOptions?.[0];
      if (opt && opt.value) {
        if (opt.dataset.rate) document.getElementById('cf-rate').value = opt.dataset.rate;
        if (opt.dataset.provider) document.getElementById('cf-provider').value = opt.dataset.provider;
        if (opt.dataset.type) document.getElementById('cf-type').value = opt.dataset.type;
        showToast('Plan presets applied', 'info');
      }
    });
  }

  // Quick Expiry Extension Buttons inside Form
  modal.querySelectorAll('.btn-date-pill').forEach((btn) => {
    btn.addEventListener('click', () => {
      const months = Number(btn.dataset.months) || 1;
      const curInput = document.getElementById('cf-expiry-date');
      const baseDate = curInput.value || todayISO();
      curInput.value = addMonths(baseDate, months);
    });
  });

  // Clone Subscriber Action
  const cloneBtn = document.getElementById('cf-clone-btn');
  if (cloneBtn && existing) {
    cloneBtn.addEventListener('click', () => {
      document.getElementById('cf-name').value = `${existing.customer_name} (2)`;
      document.getElementById('cf-conn-date').value = todayISO();
      document.getElementById('cf-expiry-date').value = addMonths(todayISO(), 1);
      document.getElementById('cf-status').value = 'Active';
      // Change title
      modal.querySelector('.modal-header h2').textContent = 'Add Subscriber (Cloned)';
      cloneBtn.remove();
      editId = null; // Submit will now create a new subscriber
      showToast('Cloned subscriber details — adjust and click Add Subscriber', 'info');
    });
  }

  // Submit Handler
  document.getElementById('connection-form').addEventListener('submit', async (e) => {
    e.preventDefault();

    const rateVal = Number(document.getElementById('cf-rate').value) || 500;
    const boxNo = document.getElementById('cf-box').value.trim();
    const address = document.getElementById('cf-address').value.trim();
    const altPhone = document.getElementById('cf-alt-phone').value.trim();
    const ont = document.getElementById('cf-ont').value.trim();
    const rawCleanNotes = document.getElementById('cf-notes').value.trim();

    const fullNotes = formatNotesMetadata(rawCleanNotes, {
      rate: rateVal,
      boxNo,
      address,
      altPhone,
      ont,
    });

    const data = {
      customer_name: document.getElementById('cf-name').value.trim(),
      phone: document.getElementById('cf-phone').value.trim(),
      provider: document.getElementById('cf-provider').value,
      connection_type: document.getElementById('cf-type').value,
      connection_date: document.getElementById('cf-conn-date').value,
      expiry_date: document.getElementById('cf-expiry-date').value,
      status: document.getElementById('cf-status').value,
      notes: fullNotes,
    };

    const submitBtn = document.getElementById('connection-form-submit');
    submitBtn.disabled = true;

    const actor = await getCurrentUser();
    const res = editId ? await updateConnection(editId, data, actor) : await addConnection(data);
    if (res.success) {
      const savedId = res.data?.id || editId;
      if (savedId) {
        setSubscriberRate(savedId, rateVal);
      }
      showToast(editId ? 'Subscriber record updated' : 'Subscriber added', 'success');
      closeModal();
      await renderTable();
      if (refreshDashboardCb) refreshDashboardCb();
      if (onSaved) await onSaved();
    } else {
      submitBtn.disabled = false;
      showToast(res.message || 'Failed to save subscriber', 'error');
    }
  });

  setTimeout(() => document.getElementById('cf-name')?.focus(), 50);
}

async function handleDelete(id) {
  const c = await getConnectionById(id);
  if (!c) {
    showToast('Could not load that subscriber — please try again', 'error');
    return;
  }

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
      selectedConnectionIds.delete(id);
      await renderTable();
      if (refreshDashboardCb) refreshDashboardCb();
    } else {
      showToast(res.message || 'Failed to delete subscriber', 'error');
    }
  });
}
