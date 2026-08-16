/**
 * Logs view — audit trail of subscriber status changes (disconnects, renewals, etc).
 */
import { getConnectionEvents } from './store.js';
import { formatDate, escapeHtml, ICONS, STATUSES, STATUS_COLORS, debounce } from './utils.js';

let currentFilters = { eventType: 'all', search: '' };

export async function renderLogs() {
  const view = document.getElementById('logs-view');
  view.innerHTML = `<div style="padding: 60px 20px; text-align: center; color: var(--text-muted); font-size: 13px;">Loading activity log…</div>`;

  view.innerHTML = `
    <div class="conns-header">
      <div class="conns-title-wrap">
        <h1>Activity Log</h1>
        <p>History of subscriber status changes, including disconnections</p>
      </div>
    </div>

    <div class="conns-toolbar">
      <div class="toolbar-left">
        <div class="search-box">
          ${ICONS.search}
          <input type="search" id="log-search" placeholder="Filter by customer name..." value="${escapeHtml(currentFilters.search)}" />
        </div>
      </div>
      <div class="toolbar-filters">
        <select id="filter-event-type" class="select-filter">
          <option value="all" ${currentFilters.eventType === 'all' ? 'selected' : ''}>All Events</option>
          ${STATUSES.map((s) => `<option value="${s}" ${currentFilters.eventType === s ? 'selected' : ''}>${s}</option>`).join('')}
        </select>
      </div>
    </div>

    <div id="logs-table-container"></div>
  `;

  document.getElementById('log-search').addEventListener('input', debounce((e) => {
    currentFilters.search = e.target.value;
    renderTable();
  }));
  document.getElementById('filter-event-type').addEventListener('change', (e) => {
    currentFilters.eventType = e.target.value;
    renderTable();
  });

  await renderTable();
}

async function renderTable() {
  const container = document.getElementById('logs-table-container');
  container.innerHTML = `<div style="padding: 40px 20px; text-align: center; color: var(--text-muted); font-size: 13px;">Loading…</div>`;

  const events = await getConnectionEvents({ eventType: currentFilters.eventType, search: currentFilters.search });

  if (events.length === 0) {
    container.innerHTML = `
      <div style="background: var(--bg-surface); border: 1px solid var(--border-subtle); border-radius: var(--radius-lg); padding: 48px 20px; text-align: center; color: var(--text-muted);">
        <div style="margin-bottom: 8px; display: flex; justify-content: center; color: var(--text-dim);">${ICONS.clock}</div>
        <div style="font-size: 15px; font-weight: 600; color: var(--text-primary);">No activity recorded yet</div>
        <div style="font-size: 13px; margin-top: 4px;">Status changes made from the Dashboard or Subscribers page will show up here.</div>
      </div>
    `;
    return;
  }

  container.innerHTML = `
    <div class="table-wrapper">
      <table class="data-table">
        <thead>
          <tr>
            <th>When</th>
            <th>Subscriber</th>
            <th>Provider & Type</th>
            <th>Status Change</th>
            <th>Changed By</th>
          </tr>
        </thead>
        <tbody>
          ${events.map(renderEventRow).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function statusPill(status) {
  const c = STATUS_COLORS[status];
  if (!c) return `<span>${escapeHtml(status || '—')}</span>`;
  return `<span style="display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 11px; font-weight: 600; background: ${c.bg}; color: ${c.text};">${escapeHtml(status)}</span>`;
}

function renderEventRow(e) {
  const when = new Date(e.created_at);
  const whenLabel = `${formatDate(e.created_at)} · ${when.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`;

  return `
    <tr>
      <td>
        <span class="table-date" style="color: var(--text-secondary);">${whenLabel}</span>
      </td>
      <td>
        <div class="table-cust-name">${escapeHtml(e.customer_name)}</div>
      </td>
      <td>
        <span class="provider-tag">
          ${e.connection_type === 'Broadband' ? ICONS.wifi : ICONS.tv} ${escapeHtml(e.provider || '—')}
        </span>
        <div style="font-size: 11px; color: var(--text-dim); margin-top: 2px;">${escapeHtml(e.connection_type || '')}</div>
      </td>
      <td>
        <div style="display: flex; align-items: center; gap: 6px;">
          ${e.previous_status ? statusPill(e.previous_status) : '<span style="color: var(--text-dim); font-size: 11px;">New record</span>'}
          <span style="color: var(--text-dim);">&rarr;</span>
          ${statusPill(e.new_status)}
        </div>
      </td>
      <td>
        <span style="color: var(--text-secondary); font-size: 13px;">${escapeHtml(e.changed_by_name || '—')}</span>
      </td>
    </tr>
  `;
}
