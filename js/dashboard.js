/**
 * Dashboard view — live metrics and urgent renewal queue.
 */
import {
  getAlertConnections,
  getOverdueConnections,
  getStatusCounts,
  getAlertTiers,
  updateConnection,
} from './store.js';
import { getCurrentUser } from './auth.js';
import {
  daysUntil,
  formatDate,
  daysBadgeInfo,
  getTierColorVars,
  escapeHtml,
  ICONS,
  showToast,
} from './utils.js';

export async function renderDashboard(onAddNew, onViewConnection, onRefresh) {
  const view = document.getElementById('dashboard-view');
  view.innerHTML = `<div style="padding: 60px 20px; text-align: center; color: var(--text-muted); font-size: 13px;">Loading dashboard…</div>`;

  const tiers = await getAlertTiers(); // ascending by days, e.g. Critical(7) / Medium(30) / Low(60)
  const overdue = await getOverdueConnections();
  const counts = await getStatusCounts();

  // Bucket every connection due within the widest tier into its first-matching (most urgent) tier.
  const maxDays = tiers.length ? tiers[tiers.length - 1].days : 30;
  const upcoming = tiers.length ? await getAlertConnections(maxDays) : [];
  const buckets = tiers.map(() => []);
  upcoming.forEach((c) => {
    const days = daysUntil(c.expiry_date);
    const idx = tiers.findIndex((t) => days <= t.days);
    if (idx !== -1) buckets[idx].push(c);
  });

  // "Urgent" = overdue + the most urgent tier's bucket.
  const urgentQueue = [...overdue, ...(buckets[0] || [])].sort(
    (a, b) => new Date(a.expiry_date) - new Date(b.expiry_date)
  );

  const todayStr = new Date().toLocaleDateString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  // Update top bar quick alert pill if present
  const alertPill = document.getElementById('quick-alert-pill');
  if (alertPill) {
    if (urgentQueue.length > 0) {
      alertPill.innerHTML = `${ICONS.alert} <span>${urgentQueue.length} Urgent Due</span>`;
      alertPill.classList.remove('hidden');
    } else {
      alertPill.classList.add('hidden');
    }
  }

  const tierKpiCards = tiers
    .map((tier, i) => {
      const bucket = buckets[i] || [];
      const count = i === 0 ? urgentQueue.length : bucket.length;
      const c = getTierColorVars(tier.color);
      const sub =
        i === 0
          ? `${overdue.length} overdue, ${bucket.length} due within ${tier.days}d`
          : `Next ${tiers[i - 1].days + 1}-${tier.days} days`;
      return `
      <div class="kpi-card" style="${count > 0 ? `border-color: ${c.border};` : ''}">
        <div class="kpi-top">
          <span class="kpi-label" style="${count > 0 ? `color: ${c.color};` : ''}">${escapeHtml(tier.label)} (&le;${tier.days}d)</span>
          <span class="kpi-dot" style="background: ${c.color};"></span>
        </div>
        <div class="kpi-num" style="${count > 0 ? `color: ${c.color};` : ''}">${count}</div>
        <div class="kpi-sub">${sub}</div>
      </div>
    `;
    })
    .join('');

  const criticalDaysLabel = tiers[0]?.days ?? 7;

  view.innerHTML = `
    <div class="dash-header-block">
      <div class="dash-title-row">
        <div>
          <h1 class="dash-title">Dashboard</h1>
        </div>
        <div class="dash-date">${todayStr}</div>
      </div>
    </div>

    <!-- KPI Metrics Row -->
    <div class="kpi-row">
      <div class="kpi-card">
        <div class="kpi-top">
          <span class="kpi-label">Active Subs</span>
          <span class="kpi-dot" style="background: var(--success);"></span>
        </div>
        <div class="kpi-num">${counts.Active + counts.Renewed}</div>
        <div class="kpi-sub">Total operational</div>
      </div>

      ${tierKpiCards}

      <div class="kpi-card">
        <div class="kpi-top">
          <span class="kpi-label">Pending Disc.</span>
          <span class="kpi-dot" style="background: var(--warning);"></span>
        </div>
        <div class="kpi-num">${counts['Pending Disconnection']}</div>
        <div class="kpi-sub">Customer requested</div>
      </div>

      <div class="kpi-card">
        <div class="kpi-top">
          <span class="kpi-label">Total Records</span>
          <span class="kpi-dot" style="background: var(--accent);"></span>
        </div>
        <div class="kpi-num">${counts.total}</div>
        <div class="kpi-sub">All database entries</div>
      </div>
    </div>

    <!-- Urgent Queue Panel -->
    <div class="section-panel">
      <div class="panel-header">
        <div class="panel-title-group">
          <span class="panel-title">Urgent Renewals</span>
          <span class="panel-badge ${urgentQueue.length > 0 ? 'badge-critical' : 'badge-warning'}">
            ${urgentQueue.length} Tasks
          </span>
        </div>
        <button class="btn btn-sm btn-ghost" id="dash-view-all-btn">View All Subscribers &rarr;</button>
      </div>

      ${
        urgentQueue.length === 0
          ? `
        <div style="padding: 32px 20px; text-align: center; color: var(--text-muted);">
          <div style="color: var(--success); margin-bottom: 6px; display: flex; justify-content: center;">${ICONS.check}</div>
          <div style="font-size: 14px; font-weight: 600; color: var(--text-primary);">All caught up</div>
          <div style="font-size: 12px; margin-top: 2px;">No subscribers expiring or overdue in the next ${criticalDaysLabel} days.</div>
        </div>
      `
          : `
        <div class="queue-list">
          ${urgentQueue.map((c) => renderQueueRow(c, tiers)).join('')}
        </div>
      `
      }
    </div>

    <!-- One panel per remaining alert tier (Medium, Low, …) -->
    ${tiers
      .slice(1)
      .map((tier, i) => {
        const bucket = buckets[i + 1] || [];
        if (bucket.length === 0) return '';
        return `
        <div class="section-panel">
          <div class="panel-header">
            <div class="panel-title-group">
              <span class="panel-title">${escapeHtml(tier.label)} Renewals (Next ${tier.days} Days)</span>
              <span class="panel-badge badge-warning">${bucket.length} Records</span>
            </div>
          </div>
          <div class="queue-list">
            ${bucket.map((c) => renderQueueRow(c, tiers)).join('')}
          </div>
        </div>
      `;
      })
      .join('')}
  `;

  // Bind View All button
  const viewAllBtn = document.getElementById('dash-view-all-btn');
  if (viewAllBtn && onViewConnection) {
    viewAllBtn.addEventListener('click', () => onViewConnection('all'));
  }

  // Bind Quick Status updates in the queue
  view.querySelectorAll('.queue-status-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.id;
      const newStatus = btn.dataset.status;
      const actor = await getCurrentUser();
      const res = await updateConnection(id, { status: newStatus }, actor);
      if (res.success) {
        showToast(`Updated to ${newStatus}`, 'success');
        await renderDashboard(onAddNew, onViewConnection, onRefresh);
        if (onRefresh) onRefresh();
      } else {
        showToast(res.message || 'Failed to update status', 'error');
      }
    });
  });
}

function renderQueueRow(connection, tiers) {
  const days = daysUntil(connection.expiry_date);
  const badge = daysBadgeInfo(days, tiers);

  const cleanPhone = (connection.phone || '').replace(/[^0-9]/g, '');
  const phoneFormatted = cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone;
  const waMsg = encodeURIComponent(
    `Hello ${connection.customer_name}, this is GlobalVision regarding your ${connection.provider} (${connection.connection_type}) connection expiring on ${formatDate(connection.expiry_date)}.`
  );

  return `
    <div class="queue-item">
      <div class="queue-left">
        <div class="queue-days-badge" style="background: ${badge.bg}; border: 1px solid ${badge.border}; color: ${badge.color};">
          ${badge.label}
        </div>
        <div class="queue-info">
          <div class="queue-name">${escapeHtml(connection.customer_name)}</div>
          <div class="queue-sub">
            <span class="mono">${escapeHtml(connection.phone || 'No phone')}</span>
            <span>&bull;</span>
            <span>Exp: ${formatDate(connection.expiry_date)}</span>
          </div>
        </div>
      </div>

      <div class="queue-center">
        <span class="provider-tag">
          ${connection.connection_type === 'Broadband' ? ICONS.wifi : ICONS.tv} ${escapeHtml(connection.provider)}
        </span>
        <span style="font-size: 12px; color: var(--text-dim); max-width: 200px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
          ${escapeHtml(connection.notes || connection.status)}
        </span>
      </div>

      <div class="queue-actions">
        ${
          cleanPhone
            ? `
          <a href="https://wa.me/${phoneFormatted}?text=${waMsg}" target="_blank" rel="noopener" class="action-pill pill-wa" title="WhatsApp Customer">
            ${ICONS.whatsapp} WhatsApp
          </a>
          <a href="tel:${cleanPhone}" class="action-pill pill-call" title="Call Customer">
            ${ICONS.phone} Call
          </a>
        `
            : ''
        }
        <button type="button" class="btn btn-sm btn-ghost queue-status-btn" data-id="${connection.id}" data-status="Renewed" title="Mark as Renewed">
          ✓ Renew
        </button>
        <button type="button" class="btn btn-sm btn-danger queue-status-btn" data-id="${connection.id}" data-status="Disconnected" title="Mark as Disconnected">
          ✕ Disconnect
        </button>
      </div>
    </div>
  `;
}
