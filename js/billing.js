/**
 * Billing & Payments Controller — GlobalVision
 * Comprehensive billing tracker with:
 * 1. Detailed Overdue & Dues Tracker (normal bill, unpaid months breakdown,
 *    number of outstanding dues, cumulative overdue balance, quick settling)
 * 2. Monthly Calendar Ledger (month-by-month billing and collection)
 * 3. Customer Billing Ledger Modal & Settlement Dialog
 */
import {
  getAllSubscribersOverdueLedger,
  getMonthlyBillingSummary,
  recordBillPayment,
  deleteBillPayment,
  settleMultipleDues,
  updateSubscriberRate,
  getCustomerBillingHistory,
  getConnections,
  getConnectionById,
  getBillPayments,
  getProviders,
  getConnectionTypes,
  getSubscriberRate,
  getDailyCollectionSummary,
  getBusinessProfile,
} from './store.js';
import { getCurrentUser } from './auth.js';
import {
  formatCurrency,
  currentMonthISO,
  formatMonthYear,
  formatMonthShort,
  shiftMonth,
  formatDate,
  todayISO,
  escapeHtml,
  ICONS,
  showToast,
  debounce,
  exportMonthlyBillingCSV,
  exportOverdueLedgerCSV,
  generateReceiptSlipHTML,
  generateWhatsAppReceiptText,
  generateWhatsAppReminderText,
} from './utils.js';

// Controller State
let viewMode = 'tracker'; // 'tracker' (Detailed Overdue Tracker) | 'monthly' (Month-by-Month Calendar)
let trackerTab = 'all'; // 'all' | 'critical' | 'warning' | 'current' | 'cleared'
let lookbackMonths = 6; // 3, 6, 12, 0 (since connection)
let selectedMonth = currentMonthISO();
let monthlyTab = 'all'; // 'all' | 'unpaid' | 'paid'
let filters = {
  search: '',
  provider: 'all',
  connectionType: 'all',
  paymentMethod: 'all',
};
let refreshCallback = null;

export async function renderBillingDashboard(onRefresh) {
  refreshCallback = onRefresh;
  const view = document.getElementById('billing-view');
  if (!view) return;

  view.innerHTML = `
    <div style="padding: 60px 20px; text-align: center; color: var(--text-muted); font-size: 13px;">
      Loading billing & payments dashboard…
    </div>
  `;

  // Fetch overdue ledger, monthly summary, master filters, and daily reconciler concurrently
  const [overdueLedger, monthlySummary, providers, connectionTypes, dailyRecon, businessProfile] = await Promise.all([
    getAllSubscribersOverdueLedger({ lookbackMonths }),
    getMonthlyBillingSummary(selectedMonth),
    getProviders(),
    getConnectionTypes(),
    getDailyCollectionSummary(todayISO()),
    getBusinessProfile(),
  ]);

  const monthDisplay = formatMonthYear(selectedMonth);
  const isCurrentMonth = selectedMonth === currentMonthISO();

  view.innerHTML = `
    <!-- Top Header -->
    <div class="conns-header billing-header">
      <div class="conns-title-wrap">
        <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
          <h1 class="billing-page-title">Billing & Payments</h1>
          <span class="live-dot" style="background: var(--success); width: 8px; height: 8px;"></span>

          <!-- View Mode Switcher -->
          <div class="billing-mode-switcher">
            <button type="button" class="billing-mode-btn ${viewMode === 'tracker' ? 'active' : ''}" id="mode-tracker-btn" title="Detailed Multi-Month Overdue & Dues Tracker">
              <span>Overdue & Dues Tracker</span>
              ${
                overdueLedger.totalNetworkOverdue > 0
                  ? `<span class="mode-badge-due">${formatCurrency(overdueLedger.totalNetworkOverdue)}</span>`
                  : ''
              }
            </button>
            <button type="button" class="billing-mode-btn ${viewMode === 'monthly' ? 'active' : ''}" id="mode-monthly-btn" title="Month-by-Month Calendar Ledger">
              <span>Monthly Calendar</span>
            </button>
          </div>
        </div>
        <p>
          ${
            viewMode === 'tracker'
              ? 'Track normal monthly bills, unpaid months, outstanding payment dues, and settle balances'
              : `View collections and status for ${monthDisplay}`
          }
        </p>
      </div>

      <!-- Controls & Quick Actions -->
      <div class="billing-header-controls">
        ${
          viewMode === 'monthly'
            ? `
          <!-- Month Navigator -->
          <div class="month-selector-pill">
            <button type="button" class="month-nav-btn" id="month-prev-btn" title="Previous Month">&larr;</button>
            <div class="month-picker-label" id="month-picker-trigger">
              ${ICONS.calendar}
              <span class="month-picker-text">${monthDisplay}</span>
              <input type="month" id="month-hidden-input" value="${selectedMonth}" class="month-hidden-native-input" />
            </div>
            <button type="button" class="month-nav-btn" id="month-next-btn" title="Next Month">&rarr;</button>
            ${!isCurrentMonth ? `<button type="button" class="month-today-btn" id="month-today-btn">Current Month</button>` : ''}
          </div>
        `
            : `
          <!-- Lookback Window Selector -->
          <div style="display: inline-flex; align-items: center; gap: 6px;">
            <select id="tracker-lookback-select" class="select-filter" style="font-size: 12px; font-weight: 600;" title="Historical evaluation window for dues">
              <option value="3" ${lookbackMonths === 3 ? 'selected' : ''}>Lookback: Last 3 Months</option>
              <option value="6" ${lookbackMonths === 6 ? 'selected' : ''}>Lookback: Last 6 Months (Standard)</option>
              <option value="12" ${lookbackMonths === 12 ? 'selected' : ''}>Lookback: Last 12 Months</option>
              <option value="0" ${lookbackMonths === 0 ? 'selected' : ''}>Lookback: Since Connection Start</option>
            </select>
          </div>
        `
        }

        <button class="btn btn-ghost" id="billing-export-btn" title="Export report to CSV">
          ${ICONS.download}
          <span>Export CSV</span>
        </button>

        <button class="btn btn-primary" id="billing-record-btn">
          ${ICONS.plus}
          <span>Record Payment</span>
        </button>
      </div>
    </div>

    <!-- Daily Register & Collection Reconciler Bar -->
    <div class="daily-recon-bar">
      <div class="dr-header-title">
        <span class="live-dot" style="background: var(--success); width: 7px; height: 7px;"></span>
        <span>Today's Register:</span>
      </div>
      <div class="dr-item">
        <span class="dr-label">Total Collected:</span>
        <span class="dr-val mono">${formatCurrency(dailyRecon.totalAmount)}</span>
        <span class="dr-sub">(${dailyRecon.count} txns)</span>
      </div>
      <div class="dr-divider"></div>
      <div class="dr-item">
        <span class="dr-label">💵 Cash in Hand:</span>
        <span class="dr-val mono text-success">${formatCurrency(dailyRecon.cashAmount)}</span>
      </div>
      <div class="dr-divider"></div>
      <div class="dr-item">
        <span class="dr-label">📱 UPI / GPay:</span>
        <span class="dr-val mono" style="color: var(--accent);">${formatCurrency(dailyRecon.upiAmount)}</span>
      </div>
      ${
        dailyRecon.bankAmount > 0
          ? `
        <div class="dr-divider"></div>
        <div class="dr-item">
          <span class="dr-label">🏦 Bank / Net:</span>
          <span class="dr-val mono">${formatCurrency(dailyRecon.bankAmount)}</span>
        </div>
      `
          : ''
      }
    </div>

    <!-- KPI Summary Row -->
    <div id="billing-kpis-container">
      ${viewMode === 'tracker' ? renderTrackerKPIs(overdueLedger) : renderMonthlyKPIs(monthlySummary)}
    </div>

    <!-- Toolbar & Filters -->
    <div class="billing-toolbar-panel">
      <!-- Status Tabs -->
      <div class="billing-status-tabs" id="billing-status-tabs-container">
        ${viewMode === 'tracker' ? renderTrackerTabs(overdueLedger) : renderMonthlyTabs(monthlySummary)}
      </div>

      <!-- Filters & Search -->
      <div class="billing-toolbar-right">
        <div class="search-box billing-search-box">
          ${ICONS.search}
          <input type="search" id="billing-search" placeholder="Search by name or phone..." value="${escapeHtml(filters.search)}" />
        </div>
        <select id="billing-filter-method" class="select-filter" title="Filter by payment method">
          <option value="all" ${filters.paymentMethod === 'all' ? 'selected' : ''}>All Modes</option>
          <option value="Cash" ${filters.paymentMethod === 'Cash' ? 'selected' : ''}>Cash Only</option>
          <option value="UPI" ${filters.paymentMethod === 'UPI' ? 'selected' : ''}>UPI (GPay/PhonePe)</option>
          <option value="Bank Transfer" ${filters.paymentMethod === 'Bank Transfer' ? 'selected' : ''}>Bank Transfer</option>
          <option value="Card" ${filters.paymentMethod === 'Card' ? 'selected' : ''}>Card / Cheque</option>
        </select>
        <select id="billing-filter-provider" class="select-filter">
          <option value="all">All Providers</option>
          ${providers.map((p) => `<option value="${escapeHtml(p)}" ${filters.provider === p ? 'selected' : ''}>${escapeHtml(p)}</option>`).join('')}
        </select>
        <select id="billing-filter-type" class="select-filter">
          <option value="all">All Types</option>
          ${connectionTypes.map((t) => `<option value="${escapeHtml(t)}" ${filters.connectionType === t ? 'selected' : ''}>${escapeHtml(t)}</option>`).join('')}
        </select>
      </div>
    </div>

    <!-- Table Container -->
    <div id="billing-table-container"></div>
  `;

  // Attach Mode Switcher Handlers
  document.getElementById('mode-tracker-btn').onclick = () => {
    if (viewMode !== 'tracker') {
      viewMode = 'tracker';
      renderBillingDashboard(refreshCallback);
    }
  };
  document.getElementById('mode-monthly-btn').onclick = () => {
    if (viewMode !== 'monthly') {
      viewMode = 'monthly';
      renderBillingDashboard(refreshCallback);
    }
  };

  // Month Picker & Navigation (Monthly mode)
  if (viewMode === 'monthly') {
    document.getElementById('month-prev-btn').onclick = () => changeMonth(-1);
    document.getElementById('month-next-btn').onclick = () => changeMonth(1);
    const todayBtn = document.getElementById('month-today-btn');
    if (todayBtn) {
      todayBtn.onclick = () => {
        selectedMonth = currentMonthISO();
        renderBillingDashboard(refreshCallback);
      };
    }
    const hiddenMonthInput = document.getElementById('month-hidden-input');
    document.getElementById('month-picker-trigger').onclick = () => {
      hiddenMonthInput.showPicker ? hiddenMonthInput.showPicker() : hiddenMonthInput.focus();
    };
    hiddenMonthInput.onchange = (e) => {
      if (e.target.value) {
        selectedMonth = e.target.value;
        renderBillingDashboard(refreshCallback);
      }
    };
  } else {
    // Lookback selector (Tracker mode)
    const lookbackSelect = document.getElementById('tracker-lookback-select');
    if (lookbackSelect) {
      lookbackSelect.onchange = (e) => {
        lookbackMonths = Number(e.target.value);
        renderBillingDashboard(refreshCallback);
      };
    }
  }

  // Export CSV Handler
  document.getElementById('billing-export-btn').onclick = () => {
    if (viewMode === 'tracker') {
      const filtered = getFilteredTrackerItems(overdueLedger.items);
      if (filtered.length === 0) {
        showToast('No records to export', 'error');
        return;
      }
      exportOverdueLedgerCSV(filtered);
      showToast(`Exported ${filtered.length} overdue tracker records to CSV`, 'success');
    } else {
      const filtered = getFilteredMonthlyItems(monthlySummary.items);
      if (filtered.length === 0) {
        showToast('No records to export', 'error');
        return;
      }
      exportMonthlyBillingCSV(filtered, selectedMonth);
      showToast(`Exported ${formatMonthYear(selectedMonth)} billing to CSV`, 'success');
    }
  };

  // Record Payment Global Action
  document.getElementById('billing-record-btn').onclick = () => {
    openRecordPaymentModal({
      billingMonth: selectedMonth,
      onSaved: () => renderBillingDashboard(refreshCallback),
    });
  };

  // Search & Filter listeners
  const searchInput = document.getElementById('billing-search');
  searchInput.addEventListener(
    'input',
    debounce((e) => {
      filters.search = e.target.value;
      renderCurrentTable(overdueLedger, monthlySummary);
    }, 200)
  );

  const methodFilter = document.getElementById('billing-filter-method');
  if (methodFilter) {
    methodFilter.addEventListener('change', (e) => {
      filters.paymentMethod = e.target.value;
      renderCurrentTable(overdueLedger, monthlySummary);
    });
  }

  document.getElementById('billing-filter-provider').addEventListener('change', (e) => {
    filters.provider = e.target.value;
    renderCurrentTable(overdueLedger, monthlySummary);
  });

  document.getElementById('billing-filter-type').addEventListener('change', (e) => {
    filters.connectionType = e.target.value;
    renderCurrentTable(overdueLedger, monthlySummary);
  });

  // Attach Status Tab Click listeners
  attachTabListeners(overdueLedger, monthlySummary);

  // Initial table render
  renderCurrentTable(overdueLedger, monthlySummary);
}

function changeMonth(delta) {
  selectedMonth = shiftMonth(selectedMonth, delta);
  renderBillingDashboard(refreshCallback);
}

// ═════════════════════════════════════════════════════════════
// KPI CARDS RENDERERS
// ═════════════════════════════════════════════════════════════
function renderTrackerKPIs(ledger) {
  return `
    <div class="kpi-row billing-kpi-row">
      <!-- 1. Total Cumulative Overdue -->
      <div class="kpi-card billing-kpi-card" style="${ledger.totalNetworkOverdue > 0 ? 'border-color: rgba(220, 38, 38, 0.4);' : ''}">
        <div class="kpi-top">
          <span class="kpi-label" style="${ledger.totalNetworkOverdue > 0 ? 'color: var(--danger);' : ''}">Total Overdue Outstanding</span>
          <span class="kpi-dot" style="background: ${ledger.totalNetworkOverdue > 0 ? 'var(--danger)' : 'var(--success)'};"></span>
        </div>
        <div class="kpi-num" style="${ledger.totalNetworkOverdue > 0 ? 'color: var(--danger);' : ''}">
          ${formatCurrency(ledger.totalNetworkOverdue)}
        </div>
        <div class="kpi-sub">
          <strong>${ledger.totalSubscribersWithDues}</strong> of ${ledger.totalSubscribers} subscribers have pending dues
        </div>
      </div>

      <!-- 2. Overdue Severity Breakdown -->
      <div class="kpi-card billing-kpi-card">
        <div class="kpi-top">
          <span class="kpi-label">Accounts with Dues</span>
          <span class="kpi-dot" style="background: var(--warning);"></span>
        </div>
        <div class="kpi-num" style="color: var(--warning); font-size: 20px; font-weight: 800; display: flex; align-items: baseline; gap: 8px;">
          <span>${ledger.totalSubscribersWithDues}</span>
          <span style="font-size: 12px; font-weight: 500; color: var(--text-muted);">Accounts</span>
        </div>
        <div class="kpi-sub" style="font-size: 11px;">
          <span style="color: var(--danger); font-weight: 600;">${ledger.criticalCount} Critical (3+)</span> &bull;
          <span style="color: var(--warning); font-weight: 600;">${ledger.warningCount} Warning</span> &bull;
          <span style="color: var(--accent); font-weight: 600;">${ledger.currentDueOnlyCount} Current</span>
        </div>
      </div>

      <!-- 3. Monthly Expected Revenue Run-Rate -->
      <div class="kpi-card billing-kpi-card">
        <div class="kpi-top">
          <span class="kpi-label">Normal Monthly Billing</span>
          <span class="kpi-dot" style="background: var(--accent);"></span>
        </div>
        <div class="kpi-num" id="kpi-monthly-runrate">
          ${formatCurrency(ledger.totalMonthlyRunRate)}
        </div>
        <div class="kpi-sub">Total expected billing per month</div>
      </div>

      <!-- 4. Clean Accounts / Up to date -->
      <div class="kpi-card billing-kpi-card">
        <div class="kpi-top">
          <span class="kpi-label">Collection Health</span>
          <span class="kpi-dot" style="background: ${ledger.clearedRate >= 80 ? 'var(--success)' : 'var(--info)'};"></span>
        </div>
        <div class="kpi-num" style="color: ${ledger.clearedRate >= 80 ? 'var(--success)' : 'var(--text-primary)'};">
          ${ledger.clearedRate}%
        </div>
        <div class="billing-progress-bar-wrap">
          <div class="billing-progress-bar-fill" style="width: ${ledger.clearedRate}%; background: ${ledger.clearedRate >= 80 ? 'var(--success)' : 'var(--accent)'};"></div>
        </div>
        <div class="kpi-sub" style="margin-top: 4px;">${ledger.clearedCount} accounts fully cleared</div>
      </div>
    </div>
  `;
}

function renderMonthlyKPIs(summary) {
  return `
    <div class="kpi-row billing-kpi-row">
      <!-- 1. Total Expected -->
      <div class="kpi-card billing-kpi-card">
        <div class="kpi-top">
          <span class="kpi-label">Total Expected</span>
          <span class="kpi-dot" style="background: var(--accent);"></span>
        </div>
        <div class="kpi-num">${formatCurrency(summary.totalExpected)}</div>
        <div class="kpi-sub">${summary.totalSubscribers} active subscribers</div>
      </div>

      <!-- 2. Collected / Paid -->
      <div class="kpi-card billing-kpi-card" style="border-color: rgba(22, 163, 74, 0.35);">
        <div class="kpi-top">
          <span class="kpi-label" style="color: var(--success);">Collected (Paid)</span>
          <span class="kpi-dot" style="background: var(--success);"></span>
        </div>
        <div class="kpi-num" style="color: var(--success);">${formatCurrency(summary.totalCollected)}</div>
        <div class="kpi-sub">${summary.paidCount} subscribers paid</div>
      </div>

      <!-- 3. Yet to Pay / Outstanding -->
      <div class="kpi-card billing-kpi-card" style="${summary.pendingCount > 0 ? 'border-color: rgba(217, 119, 6, 0.35);' : ''}">
        <div class="kpi-top">
          <span class="kpi-label" style="${summary.pendingCount > 0 ? 'color: var(--warning);' : ''}">Yet to Pay</span>
          <span class="kpi-dot" style="background: var(--warning);"></span>
        </div>
        <div class="kpi-num" style="${summary.pendingCount > 0 ? 'color: var(--warning);' : ''}">${formatCurrency(summary.totalPending)}</div>
        <div class="kpi-sub">${summary.pendingCount} subscribers pending</div>
      </div>

      <!-- 4. Collection Rate Progress -->
      <div class="kpi-card billing-kpi-card">
        <div class="kpi-top">
          <span class="kpi-label">Collection Rate</span>
          <span class="kpi-dot" style="background: ${summary.collectionRate >= 80 ? 'var(--success)' : 'var(--info)'};"></span>
        </div>
        <div class="kpi-num">${summary.collectionRate}%</div>
        <div class="billing-progress-bar-wrap">
          <div class="billing-progress-bar-fill" style="width: ${Math.min(100, summary.collectionRate)}%; background: ${summary.collectionRate >= 80 ? 'var(--success)' : 'var(--accent)'};"></div>
        </div>
      </div>
    </div>
  `;
}

// ═════════════════════════════════════════════════════════════
// STATUS TABS RENDERERS
// ═════════════════════════════════════════════════════════════
function renderTrackerTabs(ledger) {
  return `
    <button type="button" class="billing-tab-btn ${trackerTab === 'all' ? 'active' : ''}" data-tab="all">
      <span>All Subscribers</span>
      <span class="tab-count-badge">${ledger.items.length}</span>
    </button>
    <button type="button" class="billing-tab-btn ${trackerTab === 'critical' ? 'active' : ''}" data-tab="critical">
      <span class="tab-indicator-dot dot-danger" style="background: var(--danger);"></span>
      <span>Critical (3+ Dues)</span>
      <span class="tab-count-badge badge-danger" style="background: rgba(220, 38, 38, 0.15); color: var(--danger);">${ledger.criticalCount}</span>
    </button>
    <button type="button" class="billing-tab-btn ${trackerTab === 'warning' ? 'active' : ''}" data-tab="warning">
      <span class="tab-indicator-dot dot-warning"></span>
      <span>1-2 Dues Overdue</span>
      <span class="tab-count-badge badge-warning">${ledger.warningCount}</span>
    </button>
    <button type="button" class="billing-tab-btn ${trackerTab === 'current' ? 'active' : ''}" data-tab="current">
      <span class="tab-indicator-dot dot-info" style="background: var(--accent);"></span>
      <span>Current Due Only</span>
      <span class="tab-count-badge" style="background: rgba(37, 99, 235, 0.12); color: var(--accent);">${ledger.currentDueOnlyCount}</span>
    </button>
    <button type="button" class="billing-tab-btn ${trackerTab === 'cleared' ? 'active' : ''}" data-tab="cleared">
      <span class="tab-indicator-dot dot-success"></span>
      <span>All Clear</span>
      <span class="tab-count-badge badge-success">${ledger.clearedCount}</span>
    </button>
  `;
}

function renderMonthlyTabs(summary) {
  return `
    <button type="button" class="billing-tab-btn ${monthlyTab === 'all' ? 'active' : ''}" data-tab="all">
      <span>All Subscribers</span>
      <span class="tab-count-badge">${summary.items.length}</span>
    </button>
    <button type="button" class="billing-tab-btn tab-unpaid ${monthlyTab === 'unpaid' ? 'active' : ''}" data-tab="unpaid">
      <span class="tab-indicator-dot dot-warning"></span>
      <span>Yet to Pay</span>
      <span class="tab-count-badge badge-warning">${summary.pendingCount}</span>
    </button>
    <button type="button" class="billing-tab-btn tab-paid ${monthlyTab === 'paid' ? 'active' : ''}" data-tab="paid">
      <span class="tab-indicator-dot dot-success"></span>
      <span>Paid</span>
      <span class="tab-count-badge badge-success">${summary.paidCount}</span>
    </button>
  `;
}

function attachTabListeners(overdueLedger, monthlySummary) {
  const container = document.getElementById('billing-status-tabs-container');
  if (!container) return;

  container.querySelectorAll('.billing-tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      container.querySelectorAll('.billing-tab-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');

      if (viewMode === 'tracker') {
        trackerTab = btn.dataset.tab;
      } else {
        monthlyTab = btn.dataset.tab;
      }
      renderCurrentTable(overdueLedger, monthlySummary);
    });
  });
}

function renderCurrentTable(overdueLedger, monthlySummary) {
  if (viewMode === 'tracker') {
    renderTrackerTable(overdueLedger);
  } else {
    renderMonthlyTable(monthlySummary);
  }
}

// ═════════════════════════════════════════════════════════════
// OVERDUE TRACKER TABLE
// ═════════════════════════════════════════════════════════════
function getFilteredTrackerItems(allItems) {
  return allItems.filter((item) => {
    // Status tab filter
    if (trackerTab === 'critical' && item.duesSeverity !== 'critical') return false;
    if (trackerTab === 'warning' && item.duesSeverity !== 'warning') return false;
    if (trackerTab === 'current' && item.duesSeverity !== 'current') return false;
    if (trackerTab === 'cleared' && item.duesSeverity !== 'cleared') return false;

    // Search query
    if (filters.search) {
      const q = filters.search.toLowerCase();
      const matchName = (item.customer_name || '').toLowerCase().includes(q);
      const matchPhone = (item.phone || '').toLowerCase().includes(q);
      if (!matchName && !matchPhone) return false;
    }

    // Provider
    if (filters.provider !== 'all' && item.provider !== filters.provider) return false;

    // Type
    if (filters.connectionType !== 'all' && item.connection_type !== filters.connectionType) return false;

    // Payment Mode
    if (filters.paymentMethod !== 'all') {
      if (item.lastPayment?.payment_method !== filters.paymentMethod) return false;
    }

    return true;
  });
}

function renderTrackerTable(overdueLedger) {
  const container = document.getElementById('billing-table-container');
  if (!container) return;

  const items = getFilteredTrackerItems(overdueLedger.items);

  if (items.length === 0) {
    container.innerHTML = `
      <div class="billing-empty-state">
        <div class="billing-empty-icon" style="color: ${trackerTab === 'critical' || trackerTab === 'warning' ? 'var(--success)' : 'var(--text-muted)'};">
          ${trackerTab === 'critical' || trackerTab === 'warning' ? ICONS.checkCircle : ICONS.receipt}
        </div>
        <div class="billing-empty-title">
          ${trackerTab === 'critical' || trackerTab === 'warning' ? 'No Accounts in this category!' : 'No matching subscribers found'}
        </div>
        <div class="billing-empty-sub">
          Try adjusting your search terms, status filter, or lookback window.
        </div>
      </div>
    `;
    return;
  }

  container.innerHTML = `
    <div class="table-card">
      <div class="table-responsive">
        <table class="data-table billing-table">
          <thead>
            <tr>
              <th>Subscriber</th>
              <th>Service</th>
              <th>Normal Bill</th>
              <th>Unpaid Months Breakdown</th>
              <th>Outstanding Dues</th>
              <th>Total Overdue</th>
              <th style="text-align: right;">Actions</th>
            </tr>
          </thead>
          <tbody>
            ${items.map((item) => renderTrackerRow(item)).join('')}
          </tbody>
        </table>
      </div>
      <div class="table-footer-bar">
        <span>Showing <strong>${items.length}</strong> of <strong>${overdueLedger.items.length}</strong> subscribers</span>
        <span class="mono" style="font-size: 12px; color: var(--text-muted);">
          Total Outstanding: <strong>${formatCurrency(items.reduce((s, i) => s + i.totalOverdue, 0))}</strong>
        </span>
      </div>
    </div>
  `;

  attachTrackerRowListeners(container);
}

function renderTrackerRow(item) {
  const cleanPhone = (item.phone || '').replace(/[^0-9]/g, '');
  const phoneFormatted = cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone;

  // Unpaid months formatted text for WhatsApp
  const monthsText = item.unpaidMonths.map((m) => m.label).join(', ');
  const overdueMsg = encodeURIComponent(
    `Hello ${item.customer_name}, this is an overdue payment reminder from GlobalVision regarding your ${item.provider} (${item.connection_type}) connection. You have ${item.unpaidDuesCount} pending bill dues for [${monthsText}] totaling ${formatCurrency(item.totalOverdue)}. Kindly clear the pending dues to ensure uninterrupted service. Thank you!`
  );

  const clearMsg = encodeURIComponent(
    `Hello ${item.customer_name}, thank you for keeping your GlobalVision account up to date! All monthly dues are fully cleared.`
  );

  return `
    <tr class="${item.totalOverdue > 0 ? (item.duesSeverity === 'critical' ? 'row-unpaid' : '') : 'row-paid'}">
      <!-- 1. Subscriber -->
      <td>
        <div class="table-cust-name">${escapeHtml(item.customer_name)}</div>
        <div class="cust-phone-actions" style="margin-top: 3px;">
          <span class="table-cust-phone">${escapeHtml(item.phone || '—')}</span>
          ${
            cleanPhone
              ? `
            <a href="https://wa.me/${phoneFormatted}?text=${item.totalOverdue > 0 ? overdueMsg : clearMsg}" target="_blank" rel="noopener" class="action-pill pill-wa" title="${item.totalOverdue > 0 ? 'Send Overdue Reminder via WhatsApp' : 'Send Status via WhatsApp'}">
              ${ICONS.whatsapp} WA
            </a>
            <a href="tel:${cleanPhone}" class="action-pill pill-call" title="Call Customer">
              ${ICONS.phone} Call
            </a>
          `
              : ''
          }
        </div>
      </td>

      <!-- 2. Service -->
      <td>
        <span class="provider-tag">
          ${item.connection_type === 'Broadband' ? ICONS.wifi : ICONS.tv} ${escapeHtml(item.provider)}
        </span>
        <div style="font-size: 11px; color: var(--text-dim); margin-top: 2px;">${escapeHtml(item.connection_type)}</div>
      </td>

      <!-- 3. Normal Monthly Bill -->
      <td>
        <div class="normal-rate-wrap">
          <span class="normal-rate-val">${formatCurrency(item.normalBill)}</span>
          <span style="font-size: 11px; color: var(--text-muted);">/mo</span>
          <button type="button" class="btn-edit-rate" data-conn-id="${item.connection_id}" data-name="${escapeHtml(item.customer_name)}" data-rate="${item.normalBill}" title="Edit standard monthly bill rate">
            ${ICONS.edit}
          </button>
        </div>
      </td>

      <!-- 4. Unpaid Months Breakdown -->
      <td>
        ${
          item.unpaidMonths.length > 0
            ? `
          <div class="unpaid-months-chips">
            ${item.unpaidMonths
              .map(
                (m) => `
              <button type="button"
                class="month-chip ${m.isOverdue ? 'chip-overdue' : 'chip-current'} btn-chip-pay"
                data-conn-id="${item.connection_id}"
                data-name="${escapeHtml(item.customer_name)}"
                data-month="${m.month}"
                data-amount="${m.outstanding || m.amount}"
                title="${m.label}: ${formatCurrency(m.outstanding || m.amount)} ${m.isOverdue ? 'overdue' : 'due'}. Click to record payment.">
                <span>${m.shortLabel}</span>
                <span class="chip-amt">${formatCurrency(m.outstanding || m.amount)}</span>
              </button>
            `
              )
              .join('')}
          </div>
        `
            : `
          <span class="badge-all-clear">
            ${ICONS.check} All Up to Date
          </span>
        `
        }
      </td>

      <!-- 5. Outstanding Dues Count -->
      <td>
        ${
          item.duesSeverity === 'critical'
            ? `<span class="dues-badge badge-critical">${item.unpaidDuesCount} Dues (Critical)</span>`
            : item.duesSeverity === 'warning'
            ? `<span class="dues-badge badge-warning">${item.unpaidDuesCount} Dues Overdue</span>`
            : item.duesSeverity === 'current'
            ? `<span class="dues-badge badge-current">1 Due (Current)</span>`
            : `<span class="dues-badge badge-cleared">${ICONS.check} All Clear</span>`
        }
        ${
          item.lastPayment
            ? `<div style="font-size: 10px; color: var(--text-muted); margin-top: 3px;">Last: ${formatDate(item.lastPayment.payment_date)} (${formatCurrency(item.lastPayment.amount_paid || item.lastPayment.amount)})</div>`
            : ''
        }
      </td>

      <!-- 6. Total Overdue -->
      <td>
        ${
          item.totalOverdue > 0
            ? `<span class="amount-overdue mono">${formatCurrency(item.totalOverdue)}</span>`
            : `<span class="amount-cleared mono">₹0</span>`
        }
      </td>

      <!-- 7. Actions -->
      <td style="text-align: right;">
        <div style="display: inline-flex; align-items: center; gap: 6px;">
          ${
            item.totalOverdue > 0
              ? `
            <button type="button" class="btn btn-sm btn-success btn-settle-dues"
              data-conn-id="${item.connection_id}"
              data-name="${escapeHtml(item.customer_name)}"
              data-phone="${escapeHtml(item.phone || '')}"
              data-provider="${escapeHtml(item.provider)}"
              data-type="${escapeHtml(item.connection_type)}"
              data-count="${item.unpaidDuesCount}"
              data-total="${item.totalOverdue}">
              ${ICONS.check} ${item.unpaidDuesCount === 1 ? 'Mark Paid' : `Settle (${item.unpaidDuesCount})`}
            </button>
            ${
              cleanPhone
                ? `
              <a href="https://wa.me/${phoneFormatted}?text=${overdueMsg}" target="_blank" rel="noopener" class="btn btn-sm btn-ghost btn-icon-only text-success" title="Send WhatsApp Overdue Reminder">
                ${ICONS.whatsapp}
              </a>
            `
                : ''
            }
          `
              : `
            <span style="font-size: 12px; color: var(--success); font-weight: 600; padding: 4px 6px;">Cleared</span>
          `
          }

          <button type="button" class="btn btn-sm btn-ghost btn-view-history" data-conn-id="${item.connection_id}" title="Customer Billing History & Ledger">
            ${ICONS.history}
          </button>
        </div>
      </td>
    </tr>
  `;
}

function attachTrackerRowListeners(container) {
  // Pay specific month via chip click
  container.querySelectorAll('.btn-chip-pay').forEach((btn) => {
    btn.onclick = () => {
      openRecordPaymentModal({
        connectionId: btn.dataset.connId,
        customerName: btn.dataset.name,
        billingMonth: btn.dataset.month,
        amount: Number(btn.dataset.amount) || 500,
        status: 'Paid',
        onSaved: () => renderBillingDashboard(refreshCallback),
      });
    };
  });

  // Settle Dues button
  container.querySelectorAll('.btn-settle-dues').forEach((btn) => {
    btn.onclick = () => {
      openRecordPaymentModal({
        connectionId: btn.dataset.connId,
        customerName: btn.dataset.name,
        phone: btn.dataset.phone,
        provider: btn.dataset.provider,
        connectionType: btn.dataset.type,
        status: 'Paid',
        onSaved: () => renderBillingDashboard(refreshCallback),
      });
    };
  });

  // Edit Normal Bill Rate button
  container.querySelectorAll('.btn-edit-rate').forEach((btn) => {
    btn.onclick = () => {
      openEditRateModal({
        connectionId: btn.dataset.connId,
        customerName: btn.dataset.name,
        currentRate: Number(btn.dataset.rate) || 500,
        onSaved: () => renderBillingDashboard(refreshCallback),
      });
    };
  });

  // View Customer History
  container.querySelectorAll('.btn-view-history').forEach((btn) => {
    btn.onclick = () => {
      openCustomerBillingModal(btn.dataset.connId, () => renderBillingDashboard(refreshCallback));
    };
  });
}

// ═════════════════════════════════════════════════════════════
// MONTHLY CALENDAR TABLE
// ═════════════════════════════════════════════════════════════
function getFilteredMonthlyItems(allItems) {
  return allItems.filter((item) => {
    // Tab filter
    if (monthlyTab === 'unpaid' && item.isPaid) return false;
    if (monthlyTab === 'paid' && !item.isPaid) return false;

    // Search query
    if (filters.search) {
      const q = filters.search.toLowerCase();
      const matchName = (item.customer_name || '').toLowerCase().includes(q);
      const matchPhone = (item.phone || '').toLowerCase().includes(q);
      if (!matchName && !matchPhone) return false;
    }

    // Provider
    if (filters.provider !== 'all' && item.provider !== filters.provider) return false;

    // Type
    if (filters.connectionType !== 'all' && item.connection_type !== filters.connectionType) return false;

    // Payment Mode
    if (filters.paymentMethod !== 'all') {
      if (item.payment_method !== filters.paymentMethod) return false;
    }

    return true;
  });
}

function renderMonthlyTable(monthlySummary) {
  const container = document.getElementById('billing-table-container');
  if (!container) return;

  const items = getFilteredMonthlyItems(monthlySummary.items);

  if (items.length === 0) {
    const isUnpaidEmpty = monthlyTab === 'unpaid';
    container.innerHTML = `
      <div class="billing-empty-state">
        <div class="billing-empty-icon" style="color: ${isUnpaidEmpty ? 'var(--success)' : 'var(--text-muted)'};">
          ${isUnpaidEmpty ? ICONS.checkCircle : ICONS.receipt}
        </div>
        <div class="billing-empty-title">
          ${isUnpaidEmpty ? 'All Caught Up!' : 'No billing records found'}
        </div>
        <div class="billing-empty-sub">
          ${
            isUnpaidEmpty
              ? `Every subscriber has paid for ${formatMonthYear(selectedMonth)}.`
              : 'Try changing your search terms, status tabs, or month.'
          }
        </div>
      </div>
    `;
    return;
  }

  container.innerHTML = `
    <div class="table-card">
      <div class="table-responsive">
        <table class="data-table billing-table">
          <thead>
            <tr>
              <th>Subscriber</th>
              <th>Service</th>
              <th>Billing Month</th>
              <th>Bill Amount</th>
              <th>Status & Overdue Info</th>
              <th>Payment Info</th>
              <th style="text-align: right;">Actions</th>
            </tr>
          </thead>
          <tbody>
            ${items.map((item) => renderMonthlyRow(item)).join('')}
          </tbody>
        </table>
      </div>
      <div class="table-footer-bar">
        <span>Showing <strong>${items.length}</strong> of <strong>${monthlySummary.items.length}</strong> subscribers</span>
        <span class="mono" style="font-size: 12px; color: var(--text-muted);">${formatMonthYear(selectedMonth)}</span>
      </div>
    </div>
  `;

  attachMonthlyRowListeners(container);
}

function renderMonthlyRow(item) {
  const cleanPhone = (item.phone || '').replace(/[^0-9]/g, '');
  const phoneFormatted = cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone;
  const monthDisplay = formatMonthYear(item.billing_month);

  const reminderMsg = encodeURIComponent(
    `Hello ${item.customer_name}, this is a gentle reminder from GlobalVision regarding your ${item.provider} (${item.connection_type}) connection. Your bill of ${formatCurrency(item.amount)} for ${monthDisplay} is pending.${item.priorOverdueCount > 0 ? ` You also have ${item.priorOverdueCount} prior unpaid dues (${formatCurrency(item.priorOverdueAmount)}). Total overdue: ${formatCurrency(item.totalSubscriberOverdue)}.` : ''} Kindly clear the bill to avoid service disruption. Thank you!`
  );

  const receiptMsg = encodeURIComponent(
    `Hello ${item.customer_name}, thank you for your payment of ${formatCurrency(item.amount_paid || item.amount)} for ${monthDisplay} towards your GlobalVision ${item.provider} connection.${item.totalSubscriberOverdue > 0 ? ` Remaining outstanding balance: ${formatCurrency(item.totalSubscriberOverdue)}.` : ' Your account is fully up to date!'}`
  );

  return `
    <tr class="${item.isPaid ? 'row-paid' : 'row-unpaid'}">
      <td>
        <div class="table-cust-name">${escapeHtml(item.customer_name)}</div>
        <div class="cust-phone-actions" style="margin-top: 3px;">
          <span class="table-cust-phone">${escapeHtml(item.phone || '—')}</span>
          ${
            cleanPhone
              ? `
            <a href="https://wa.me/${phoneFormatted}?text=${item.isPaid ? receiptMsg : reminderMsg}" target="_blank" rel="noopener" class="action-pill pill-wa" title="${item.isPaid ? 'Send Receipt via WhatsApp' : 'Send Reminder via WhatsApp'}">
              ${ICONS.whatsapp} WA
            </a>
            <a href="tel:${cleanPhone}" class="action-pill pill-call" title="Call Customer">
              ${ICONS.phone} Call
            </a>
          `
              : ''
          }
        </div>
      </td>

      <td>
        <span class="provider-tag">
          ${item.connection_type === 'Broadband' ? ICONS.wifi : ICONS.tv} ${escapeHtml(item.provider)}
        </span>
        <div style="font-size: 11px; color: var(--text-dim); margin-top: 2px;">${escapeHtml(item.connection_type)}</div>
      </td>

      <td>
        <span class="mono" style="font-size: 12px; font-weight: 600; color: var(--text-secondary);">${monthDisplay}</span>
      </td>

      <td>
        <span class="mono" style="font-size: 14px; font-weight: 700; color: var(--text-primary);">${formatCurrency(item.amount)}</span>
      </td>

      <td>
        <div>
          ${
            item.isPaid
              ? `<span class="billing-status-badge badge-paid">${ICONS.check} PAID</span>`
              : `<span class="billing-status-badge badge-yet-to-pay">${ICONS.clockPending} YET TO PAY</span>`
          }
        </div>
        ${
          item.priorOverdueCount > 0
            ? `
          <button type="button" class="prior-overdue-tag btn-prior-overdue" data-conn-id="${item.connection_id}" title="Click to view all unpaid months">
            ${ICONS.alert} +${item.priorOverdueCount} prior overdue (${formatCurrency(item.priorOverdueAmount)})
          </button>
        `
            : ''
        }
      </td>

      <td>
        ${
          item.isPaid
            ? `
          <div style="font-size: 12px; font-weight: 600; color: var(--text-primary);">
            ${formatDate(item.payment_date)}
            <span style="color: var(--text-muted); font-weight: normal;">&bull; ${escapeHtml(item.payment_method || 'Cash')}</span>
          </div>
          ${item.reference_id ? `<div class="mono" style="font-size: 11px; color: var(--text-dim);">Ref: ${escapeHtml(item.reference_id)}</div>` : ''}
        `
            : `<span style="font-size: 12px; color: var(--warning); font-weight: 500;">Payment Pending</span>`
        }
      </td>

      <td style="text-align: right;">
        <div style="display: inline-flex; align-items: center; gap: 6px;">
          ${
            !item.isPaid
              ? `
            <button type="button" class="btn btn-sm btn-success btn-mark-paid"
              data-conn-id="${item.connection_id}"
              data-name="${escapeHtml(item.customer_name)}"
              data-amount="${item.amount}">
              ${ICONS.check} Mark Paid
            </button>
            ${
              cleanPhone
                ? `
              <a href="https://wa.me/${phoneFormatted}?text=${reminderMsg}" target="_blank" rel="noopener" class="btn btn-sm btn-ghost btn-icon-only text-success" title="Send WhatsApp Bill Reminder">
                ${ICONS.whatsapp}
              </a>
            `
                : ''
            }
          `
              : `
            <button type="button" class="btn btn-sm btn-ghost btn-edit-payment"
              data-conn-id="${item.connection_id}"
              data-payment-id="${item.payment_id || ''}"
              data-name="${escapeHtml(item.customer_name)}"
              data-amount="${item.amount}"
              data-date="${item.payment_date || ''}"
              data-method="${escapeHtml(item.payment_method || '')}"
              data-ref="${escapeHtml(item.reference_id || '')}"
              data-notes="${escapeHtml(item.notes || '')}">
              ${ICONS.edit} Edit
            </button>
          `
          }

          <button type="button" class="btn btn-sm btn-ghost btn-view-history" data-conn-id="${item.connection_id}" title="Customer Billing History">
            ${ICONS.history}
          </button>
        </div>
      </td>
    </tr>
  `;
}

function attachMonthlyRowListeners(container) {
  container.querySelectorAll('.btn-mark-paid').forEach((btn) => {
    btn.onclick = () => {
      openRecordPaymentModal({
        connectionId: btn.dataset.connId,
        customerName: btn.dataset.name,
        billingMonth: selectedMonth,
        amount: Number(btn.dataset.amount) || 500,
        status: 'Paid',
        onSaved: () => renderBillingDashboard(refreshCallback),
      });
    };
  });

  container.querySelectorAll('.btn-edit-payment').forEach((btn) => {
    btn.onclick = () => {
      openRecordPaymentModal({
        id: btn.dataset.paymentId,
        connectionId: btn.dataset.connId,
        customerName: btn.dataset.name,
        billingMonth: selectedMonth,
        amount: Number(btn.dataset.amount) || 500,
        status: 'Paid',
        paymentDate: btn.dataset.date,
        paymentMethod: btn.dataset.method,
        referenceId: btn.dataset.ref,
        notes: btn.dataset.notes,
        onSaved: () => renderBillingDashboard(refreshCallback),
      });
    };
  });

  container.querySelectorAll('.btn-prior-overdue, .btn-view-history').forEach((btn) => {
    btn.onclick = () => {
      openCustomerBillingModal(btn.dataset.connId, () => renderBillingDashboard(refreshCallback));
    };
  });
}

// ═════════════════════════════════════════════════════════════
// INLINE RATE EDITOR MODAL
// ═════════════════════════════════════════════════════════════
export async function openEditRateModal({ connectionId, customerName, currentRate = 500, onSaved = null }) {
  const modal = document.getElementById('billing-modal') || document.getElementById('connection-modal');
  if (!modal) return;

  modal.innerHTML = `
    <div class="modal-backdrop" id="edit-rate-backdrop"></div>
    <div class="modal-content" style="max-width: 400px;">
      <div class="modal-header">
        <h2>Edit Normal Monthly Bill</h2>
        <button class="icon-btn" id="edit-rate-close">${ICONS.close}</button>
      </div>

      <form id="edit-rate-form" autocomplete="off">
        <div style="margin-bottom: 14px; font-size: 13px; color: var(--text-secondary);">
          Set the standard monthly subscription plan rate for <strong>${escapeHtml(customerName)}</strong>.
          This rate will be used as their expected monthly bill for future and overdue billing calculations.
        </div>

        <div class="form-group">
          <label for="erm-rate">Normal Monthly Bill (₹) *</label>
          <input type="number" id="erm-rate" min="0" step="1" required value="${currentRate}" placeholder="e.g. 500" />
        </div>

        <div class="modal-actions" style="margin-top: 20px;">
          <button type="button" class="btn btn-ghost" id="erm-cancel">Cancel</button>
          <button type="submit" class="btn btn-primary" id="erm-save">Save Rate</button>
        </div>
      </form>
    </div>
  `;

  modal.classList.remove('hidden');

  const closeModal = () => {
    modal.classList.add('hidden');
    modal.innerHTML = '';
  };

  document.getElementById('edit-rate-backdrop').onclick = closeModal;
  document.getElementById('edit-rate-close').onclick = closeModal;
  document.getElementById('erm-cancel').onclick = closeModal;

  document.getElementById('edit-rate-form').onsubmit = async (e) => {
    e.preventDefault();
    const rateInput = document.getElementById('erm-rate');
    const newRate = Number(rateInput.value) || 0;
    const saveBtn = document.getElementById('erm-save');
    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving…';

    const actor = await getCurrentUser();
    await updateSubscriberRate(connectionId, newRate, actor);

    showToast(`Updated normal bill to ${formatCurrency(newRate)} for ${customerName}`, 'success');
    closeModal();
    if (onSaved) onSaved();
  };
}

// ═════════════════════════════════════════════════════════════
// RECORD / SETTLE PAYMENT MODAL
// ═════════════════════════════════════════════════════════════
export async function openRecordPaymentModal(options = {}) {
  const modal = document.getElementById('billing-modal') || document.getElementById('connection-modal');
  if (!modal) return;

  const connections = await getConnections();
  const defaultMonth = options.billingMonth || selectedMonth || currentMonthISO();
  const editId = options.id || null;

  modal.innerHTML = `
    <div class="modal-backdrop" id="billing-modal-backdrop"></div>
    <div class="modal-content" style="max-width: 520px;">
      <div style="padding: 40px; text-align: center; color: var(--text-muted);">Loading payment form…</div>
    </div>
  `;
  modal.classList.remove('hidden');

  // If a connectionId is provided, fetch their detailed overdue state
  let targetConnHistory = null;
  if (options.connectionId) {
    targetConnHistory = await getCustomerBillingHistory(options.connectionId, { lookbackMonths: 12 });
  }

  const unpaidMonthsList = targetConnHistory?.unpaidMonths || [];
  const normalBill = targetConnHistory?.normalBill || (options.amount || 500);
  const totalOverdue = targetConnHistory?.totalOverdue || 0;

  // Render form
  modal.innerHTML = `
    <div class="modal-backdrop" id="billing-modal-backdrop"></div>
    <div class="modal-content" style="max-width: 520px;">
      <div class="modal-header">
        <div>
          <h2>${editId ? 'Edit Bill Payment' : 'Record Bill Payment'}</h2>
          ${
            options.customerName
              ? `<div style="font-size: 12px; color: var(--text-muted); margin-top: 2px;">${escapeHtml(options.customerName)} &bull; Normal Bill: <strong class="mono">${formatCurrency(normalBill)}/mo</strong></div>`
              : ''
          }
        </div>
        <button class="icon-btn" id="billing-modal-close">${ICONS.close}</button>
      </div>

      <form id="record-payment-form" autocomplete="off">
        <!-- Subscriber Picker (if not fixed) -->
        <div class="form-group">
          <label for="bpm-customer">Subscriber *</label>
          ${
            options.connectionId
              ? `
            <input type="text" class="input-readonly" value="${escapeHtml(options.customerName || 'Selected Customer')}" readonly />
            <input type="hidden" id="bpm-customer" value="${options.connectionId}" />
          `
              : `
            <select id="bpm-customer" required>
              <option value="" disabled selected>Select subscriber</option>
              ${connections
                .map(
                  (c) =>
                    `<option value="${c.id}" ${c.id === options.connectionId ? 'selected' : ''}>${escapeHtml(c.customer_name)} (${escapeHtml(c.provider)} - ${escapeHtml(c.phone || 'No phone')})</option>`
                )
                .join('')}
            </select>
          `
          }
        </div>

        <!-- Multi-Month Settlement Selector (if customer has multiple unpaid dues and not editing an existing payment) -->
        ${
          !editId && unpaidMonthsList.length > 1
            ? `
          <div class="form-group" style="margin-top: 10px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
              <label style="font-weight: 700; color: var(--text-primary);">Select Months to Settle (${unpaidMonthsList.length} Dues Pending):</label>
              <button type="button" class="btn btn-sm btn-ghost" id="bpm-select-all-btn" style="padding: 2px 6px; font-size: 11px;">
                Select All
              </button>
            </div>

            <div class="settle-months-list" id="bpm-months-checklist">
              ${unpaidMonthsList
                .map(
                  (m, idx) => `
                <label class="settle-month-row ${idx === 0 || m.month === defaultMonth ? 'selected' : ''}">
                  <div class="settle-month-row-left">
                    <input type="checkbox" class="bpm-month-check" value="${m.month}" data-amount="${m.outstanding || m.amount}" ${idx === 0 || m.month === defaultMonth ? 'checked' : ''} />
                    <span style="font-weight: 600;">${m.label}</span>
                    ${m.isOverdue ? `<span class="badge-danger" style="font-size: 10px; padding: 1px 5px; border-radius: 4px; background: rgba(220,38,38,0.1); color: var(--danger);">Overdue</span>` : `<span style="font-size: 10px; color: var(--accent);">Current</span>`}
                  </div>
                  <span class="mono" style="font-weight: 700;">${formatCurrency(m.outstanding || m.amount)}</span>
                </label>
              `
                )
                .join('')}
            </div>

            <!-- Dynamic Balance Calculation -->
            <div class="settle-calc-box">
              <div class="settle-calc-item">
                <div class="calc-label">Total Outstanding</div>
                <div class="calc-val mono" style="color: var(--danger);" id="calc-total-out">${formatCurrency(totalOverdue)}</div>
              </div>
              <div class="settle-calc-item">
                <div class="calc-label">Paying Now</div>
                <div class="calc-val mono" style="color: var(--success);" id="calc-paying-now">${formatCurrency(normalBill)}</div>
              </div>
              <div class="settle-calc-item">
                <div class="calc-label">Remaining Dues</div>
                <div class="calc-val mono" style="color: var(--text-primary);" id="calc-remaining">${formatCurrency(Math.max(0, totalOverdue - normalBill))}</div>
              </div>
            </div>
          </div>
        `
            : `
          <!-- Single Month Form Row -->
          <div class="form-row">
            <div class="form-group">
              <label for="bpm-month">Billing Month *</label>
              <input type="month" id="bpm-month" required value="${defaultMonth}" />
            </div>
            <div class="form-group">
              <label for="bpm-amount">Bill Amount (₹) *</label>
              <input type="number" id="bpm-amount" min="1" step="1" required value="${options.amount || normalBill}" placeholder="500" />
            </div>
          </div>
        `
        }

        <div class="form-row">
          <div class="form-group">
            <label for="bpm-status">Payment Status *</label>
            <select id="bpm-status" required>
              <option value="Paid" ${(options.status || 'Paid') === 'Paid' ? 'selected' : ''}>Paid (Received & Clear)</option>
              <option value="Pending" ${options.status === 'Pending' ? 'selected' : ''}>Pending (Yet to Pay)</option>
            </select>
          </div>
          <div class="form-group">
            <label for="bpm-date">Payment Date *</label>
            <input type="date" id="bpm-date" required value="${options.paymentDate || todayISO()}" />
          </div>
        </div>

        <div class="form-row">
          <div class="form-group">
            <label for="bpm-method">Payment Mode</label>
            <select id="bpm-method">
              <option value="Cash" ${(options.paymentMethod || 'Cash') === 'Cash' ? 'selected' : ''}>Cash</option>
              <option value="UPI" ${options.paymentMethod === 'UPI' ? 'selected' : ''}>UPI (GPay / PhonePe / Paytm)</option>
              <option value="Bank Transfer" ${options.paymentMethod === 'Bank Transfer' ? 'selected' : ''}>Bank Transfer (NEFT / IMPS)</option>
              <option value="Card" ${options.paymentMethod === 'Card' ? 'selected' : ''}>Card (Debit / Credit)</option>
              <option value="Cheque" ${options.paymentMethod === 'Cheque' ? 'selected' : ''}>Cheque</option>
              <option value="Other" ${options.paymentMethod === 'Other' ? 'selected' : ''}>Other</option>
            </select>
          </div>
          <div class="form-group">
            <label for="bpm-ref">Reference / UTR ID</label>
            <input type="text" id="bpm-ref" value="${escapeHtml(options.referenceId || '')}" placeholder="e.g. UPI Ref / Txn ID" />
          </div>
        </div>

        <div class="form-row">
          <div class="form-group">
            <label for="bpm-discount">Concession / Discount (₹)</label>
            <input type="number" id="bpm-discount" min="0" step="1" value="0" placeholder="Optional discount" />
          </div>
          <div class="form-group">
            <label for="bpm-notes">Notes / Remarks</label>
            <input type="text" id="bpm-notes" value="${escapeHtml(options.notes || '')}" placeholder="e.g. Paid in full via GPay" />
          </div>
        </div>

        <div class="modal-actions" style="display: flex; justify-content: space-between; align-items: center; margin-top: 18px;">
          ${
            editId
              ? `<button type="button" class="btn btn-ghost text-danger" id="bpm-delete-btn">${ICONS.trash} Delete Entry</button>`
              : `<div></div>`
          }
          <div style="display: flex; gap: 8px;">
            <button type="button" class="btn btn-ghost" id="bpm-cancel-btn">Cancel</button>
            <button type="submit" class="btn btn-primary" id="bpm-submit-btn">
              ${editId ? 'Save Changes' : 'Confirm Payment'}
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

  document.getElementById('billing-modal-backdrop').onclick = closeModal;
  document.getElementById('billing-modal-close').onclick = closeModal;
  document.getElementById('bpm-cancel-btn').onclick = closeModal;

  // Auto-fill rate when customer dropdown changes
  const custSelect = document.getElementById('bpm-customer');
  if (custSelect && custSelect.tagName === 'SELECT') {
    custSelect.addEventListener('change', async () => {
      const selectedConn = connections.find((c) => c.id === custSelect.value);
      if (selectedConn) {
        openRecordPaymentModal({
          connectionId: selectedConn.id,
          customerName: selectedConn.customer_name,
          phone: selectedConn.phone,
          provider: selectedConn.provider,
          connectionType: selectedConn.connection_type,
          billingMonth: defaultMonth,
          onSaved: options.onSaved,
        });
      }
    });
  }

  // Multi-month checklist calculation
  const checklist = document.getElementById('bpm-months-checklist');
  if (checklist) {
    const updateChecklistCalc = () => {
      let payingTotal = 0;
      checklist.querySelectorAll('.bpm-month-check').forEach((cb) => {
        const row = cb.closest('.settle-month-row');
        if (cb.checked) {
          row.classList.add('selected');
          payingTotal += Number(cb.dataset.amount) || 0;
        } else {
          row.classList.remove('selected');
        }
      });
      const payingEl = document.getElementById('calc-paying-now');
      const remEl = document.getElementById('calc-remaining');
      if (payingEl) payingEl.textContent = formatCurrency(payingTotal);
      if (remEl) remEl.textContent = formatCurrency(Math.max(0, totalOverdue - payingTotal));
    };

    checklist.querySelectorAll('.bpm-month-check').forEach((cb) => {
      cb.addEventListener('change', updateChecklistCalc);
    });

    const selectAllBtn = document.getElementById('bpm-select-all-btn');
    if (selectAllBtn) {
      selectAllBtn.onclick = () => {
        const allChecked = Array.from(checklist.querySelectorAll('.bpm-month-check')).every((cb) => cb.checked);
        checklist.querySelectorAll('.bpm-month-check').forEach((cb) => {
          cb.checked = !allChecked;
        });
        selectAllBtn.textContent = allChecked ? 'Select All' : 'Deselect All';
        updateChecklistCalc();
      };
    }

    updateChecklistCalc();
  }

  // Delete payment action
  const deleteBtn = document.getElementById('bpm-delete-btn');
  if (deleteBtn && editId) {
    deleteBtn.onclick = async () => {
      if (!window.confirm('Delete this payment record? The customer will show as Yet to Pay.')) return;
      deleteBtn.disabled = true;
      await deleteBillPayment(editId);
      showToast('Payment record deleted', 'success');
      closeModal();
      if (options.onSaved) options.onSaved();
    };
  }

  // Submit payment form
  document.getElementById('record-payment-form').onsubmit = async (e) => {
    e.preventDefault();
    const connId = document.getElementById('bpm-customer').value;
    const targetConn = connections.find((c) => c.id === connId);
    if (!targetConn && !options.connectionId) {
      showToast('Please select a subscriber', 'error');
      return;
    }

    const submitBtn = document.getElementById('bpm-submit-btn');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Saving…';

    const customerName = options.customerName || targetConn?.customer_name || 'Subscriber';
    const phone = options.phone || targetConn?.phone || '';
    const provider = options.provider || targetConn?.provider || '';
    const connectionType = options.connectionType || targetConn?.connection_type || '';
    const status = document.getElementById('bpm-status').value;
    const paymentDate = document.getElementById('bpm-date').value;
    const paymentMethod = document.getElementById('bpm-method').value;
    const referenceId = document.getElementById('bpm-ref').value.trim();
    const notes = document.getElementById('bpm-notes').value.trim();
    const discount = Number(document.getElementById('bpm-discount')?.value) || 0;
    let finalNotes = notes;
    if (discount > 0) {
      finalNotes = finalNotes ? `${finalNotes} (Concession: ₹${discount})` : `Concession: ₹${discount}`;
    }
    const actor = await getCurrentUser();

    // Check if multi-month settlement
    const checkedMonths = checklist
      ? Array.from(checklist.querySelectorAll('.bpm-month-check:checked')).map((cb) => ({
          month: cb.value,
          amount: Number(cb.dataset.amount),
        }))
      : [];

    if (checklist && checkedMonths.length > 0) {
      const res = await settleMultipleDues(
        {
          connectionId: connId,
          customerName,
          phone,
          provider,
          connectionType,
          months: checkedMonths,
          paymentDate,
          paymentMethod,
          referenceId,
          notes: finalNotes,
        },
        actor
      );

      if (res.success) {
        const totalPaid = checkedMonths.reduce((s, m) => s + m.amount, 0);
        const remDues = Math.max(0, unpaidMonthsList.length - checkedMonths.length);
        const remAmount = Math.max(0, totalOverdue - totalPaid);

        showToast(
          `Recorded payment of ${formatCurrency(totalPaid)} for ${checkedMonths.length} month(s). Remaining: ${formatCurrency(remAmount)} (${remDues} dues)`,
          'success'
        );
        closeModal();
        if (options.onSaved) options.onSaved();
        openReceiptModal(
          {
            id: `rcpt_${Date.now()}`,
            connection_id: connId,
            customer_name: customerName,
            phone,
            provider,
            connection_type: connectionType,
            billing_month: checkedMonths.map((m) => formatMonthShort(m.month)).join(', '),
            amount: totalPaid,
            amount_paid: totalPaid,
            payment_date: paymentDate,
            payment_method: paymentMethod,
            reference_id: referenceId,
            notes: finalNotes,
          },
          targetConn || { customer_name: customerName, phone, provider, connection_type: connectionType }
        );
      } else {
        showToast(res.message || 'Failed to save payments', 'error');
        submitBtn.disabled = false;
        submitBtn.textContent = 'Confirm Payment';
      }
      return;
    }

    // Single month settlement
    const billingMonth = document.getElementById('bpm-month')?.value || defaultMonth;
    const amount = Number(document.getElementById('bpm-amount')?.value) || normalBill;

    const res = await recordBillPayment(
      {
        id: editId,
        connection_id: connId,
        customer_name: customerName,
        phone,
        provider,
        connection_type: connectionType,
        billing_month: billingMonth,
        amount,
        amount_paid: status === 'Paid' ? amount : 0,
        status,
        payment_date: paymentDate,
        payment_method: paymentMethod,
        reference_id: referenceId,
        notes: finalNotes,
      },
      actor
    );

    if (res.success) {
      showToast(
        status === 'Paid'
          ? `Payment of ${formatCurrency(amount)} recorded for ${formatMonthShort(billingMonth)}. Outstanding balance reduced!`
          : `Marked as Yet to Pay for ${customerName}`,
        'success'
      );
      closeModal();
      if (options.onSaved) options.onSaved();
      if (status === 'Paid') {
        openReceiptModal(
          {
            id: res.data?.id || editId || `rcpt_${Date.now()}`,
            connection_id: connId,
            customer_name: customerName,
            phone,
            provider,
            connection_type: connectionType,
            billing_month: billingMonth,
            amount,
            amount_paid: amount,
            payment_date: paymentDate,
            payment_method: paymentMethod,
            reference_id: referenceId,
            notes: finalNotes,
          },
          targetConn || { customer_name: customerName, phone, provider, connection_type: connectionType }
        );
      }
    } else {
      showToast(res.message || 'Failed to save payment', 'error');
      submitBtn.disabled = false;
      submitBtn.textContent = editId ? 'Save Changes' : 'Confirm Payment';
    }
  };
}

// ═════════════════════════════════════════════════════════════
// CUSTOMER BILLING HISTORY & OUTSTANDING LEDGER MODAL
// ═════════════════════════════════════════════════════════════
export async function openCustomerBillingModal(connectionId, onSaved = null) {
  const modal = document.getElementById('billing-modal') || document.getElementById('connection-modal');
  if (!modal) return;

  modal.innerHTML = `
    <div class="modal-backdrop" id="cust-billing-backdrop"></div>
    <div class="modal-content" style="max-width: 680px;">
      <div style="padding: 40px; text-align: center; color: var(--text-muted);">Loading payment ledger…</div>
    </div>
  `;
  modal.classList.remove('hidden');

  const historyData = await getCustomerBillingHistory(connectionId, { lookbackMonths: 12 });
  const { connection, payments, normalBill, unpaidMonths, unpaidDuesCount, totalOverdue } = historyData;

  if (!connection) {
    modal.classList.add('hidden');
    showToast('Customer not found', 'error');
    return;
  }

  const totalPaid = payments
    .filter((p) => p.status === 'Paid')
    .reduce((sum, p) => sum + Number(p.amount_paid || p.amount || 0), 0);

  modal.innerHTML = `
    <div class="modal-backdrop" id="cust-billing-backdrop"></div>
    <div class="modal-content" style="max-width: 680px;">
      <div class="modal-header">
        <div>
          <h2>${escapeHtml(connection.customer_name)}</h2>
          <div style="display: flex; align-items: center; gap: 8px; margin-top: 4px; font-size: 12px; color: var(--text-muted);">
            <span>${escapeHtml(connection.phone || 'No phone')}</span>
            <span>&bull;</span>
            <span class="provider-tag">${escapeHtml(connection.provider)} (${escapeHtml(connection.connection_type)})</span>
          </div>
        </div>
        <button class="icon-btn" id="cust-billing-close">${ICONS.close}</button>
      </div>

      <!-- Customer Billing Quick Stats -->
      <div class="cust-billing-stats-strip">
        <div class="cb-stat">
          <span class="cb-stat-label">Normal Monthly Bill</span>
          <div style="display: flex; align-items: center; gap: 4px;">
            <span class="cb-stat-val mono">${formatCurrency(normalBill)}</span>
            <button type="button" class="btn-edit-rate" id="cb-edit-rate-btn" title="Edit normal monthly rate">${ICONS.edit}</button>
          </div>
        </div>
        <div class="cb-stat">
          <span class="cb-stat-label">Total Outstanding Dues</span>
          <span class="cb-stat-val mono" style="color: ${totalOverdue > 0 ? 'var(--danger)' : 'var(--success)'};">
            ${formatCurrency(totalOverdue)}
          </span>
        </div>
        <div class="cb-stat">
          <span class="cb-stat-label">Unpaid Dues Count</span>
          <span class="cb-stat-val" style="color: ${unpaidDuesCount > 0 ? 'var(--warning)' : 'var(--success)'};">
            ${unpaidDuesCount > 0 ? `${unpaidDuesCount} Months` : 'All Cleared'}
          </span>
        </div>
        <div class="cb-stat">
          <span class="cb-stat-label">Total Paid (Ledger)</span>
          <span class="cb-stat-val mono" style="color: var(--success);">${formatCurrency(totalPaid)}</span>
        </div>
      </div>

      <!-- Unpaid Months Detailed Action Strip (if any) -->
      ${
        unpaidMonths.length > 0
          ? `
        <div style="margin-top: 16px; padding: 12px 14px; background: rgba(220, 38, 38, 0.05); border: 1px solid rgba(220, 38, 38, 0.2); border-radius: var(--radius-md);">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
            <span style="font-size: 12px; font-weight: 700; color: var(--danger);">Unpaid Months Breakdown (${unpaidDuesCount} Pending):</span>
            <button type="button" class="btn btn-sm btn-primary" id="cb-settle-all-btn">
              ${ICONS.check} Settle All (${formatCurrency(totalOverdue)})
            </button>
          </div>
          <div class="unpaid-months-chips">
            ${unpaidMonths
              .map(
                (m) => `
              <button type="button" class="month-chip ${m.isOverdue ? 'chip-overdue' : 'chip-current'} cb-pay-month-chip"
                data-month="${m.month}"
                data-amount="${m.outstanding || m.amount}"
                title="Click to mark ${m.label} as paid">
                <span>${m.shortLabel}</span>
                <span class="chip-amt">${formatCurrency(m.outstanding || m.amount)}</span>
              </button>
            `
              )
              .join('')}
          </div>
        </div>
      `
          : ''
      }

      <!-- Monthly Ledger Section -->
      <div style="display: flex; justify-content: space-between; align-items: center; margin: 18px 0 10px;">
        <h3 style="font-size: 14px; font-weight: 700; color: var(--text-primary);">Recorded Payments Ledger</h3>
        <button type="button" class="btn btn-sm btn-ghost" id="cb-add-payment-btn">
          ${ICONS.plus} Record for Month
        </button>
      </div>

      <!-- Payments Table -->
      <div class="cust-billing-table-wrap">
        ${
          payments.length === 0
            ? `
          <div style="padding: 30px; text-align: center; color: var(--text-muted); font-size: 13px;">
            No recorded payment entries yet for this subscriber.<br />
            Click <strong>Record for Month</strong> to add a payment.
          </div>
        `
            : `
          <table class="data-table" style="font-size: 13px;">
            <thead>
              <tr>
                <th>Month</th>
                <th>Amount</th>
                <th>Status</th>
                <th>Paid Date</th>
                <th>Mode</th>
                <th style="text-align: right;">Action</th>
              </tr>
            </thead>
            <tbody>
              ${payments
                .map(
                  (p) => `
                <tr>
                  <td><span class="mono" style="font-weight: 600;">${formatMonthYear(p.billing_month)}</span></td>
                  <td><span class="mono" style="font-weight: 700;">${formatCurrency(p.amount)}</span></td>
                  <td>
                    ${
                      p.status === 'Paid'
                        ? `<span class="billing-status-badge badge-paid" style="padding: 2px 7px; font-size: 10px;">${ICONS.check} PAID</span>`
                        : `<span class="billing-status-badge badge-yet-to-pay" style="padding: 2px 7px; font-size: 10px;">YET TO PAY</span>`
                    }
                  </td>
                  <td><span style="color: var(--text-secondary);">${formatDate(p.payment_date)}</span></td>
                  <td><span style="color: var(--text-muted);">${escapeHtml(p.payment_method || 'Cash')}</span></td>
                  <td style="text-align: right;">
                    <div style="display: inline-flex; align-items: center; gap: 4px;">
                      ${
                        p.status === 'Paid'
                          ? `
                        <button type="button" class="icon-btn cb-receipt-btn text-success"
                          data-id="${p.id}"
                          data-month="${p.billing_month}"
                          data-amount="${p.amount_paid || p.amount}"
                          data-method="${escapeHtml(p.payment_method || '')}"
                          data-date="${p.payment_date || ''}"
                          data-ref="${escapeHtml(p.reference_id || '')}"
                          data-notes="${escapeHtml(p.notes || '')}"
                          title="View & Print Receipt Slip">
                          ${ICONS.printer}
                        </button>
                      `
                          : ''
                      }
                      <button type="button" class="icon-btn cb-edit-payment-btn"
                        data-id="${p.id}"
                        data-month="${p.billing_month}"
                        data-amount="${p.amount}"
                        data-method="${escapeHtml(p.payment_method || '')}"
                        data-date="${p.payment_date || ''}"
                        data-ref="${escapeHtml(p.reference_id || '')}"
                        data-notes="${escapeHtml(p.notes || '')}"
                        title="Edit">
                        ${ICONS.edit}
                      </button>
                    </div>
                  </td>
                </tr>
              `
                )
                .join('')}
            </tbody>
          </table>
        `
        }
      </div>

      <div class="modal-actions" style="margin-top: 18px;">
        <button type="button" class="btn btn-ghost" id="cust-billing-done">Close</button>
      </div>
    </div>
  `;

  const closeModal = () => {
    modal.classList.add('hidden');
    modal.innerHTML = '';
  };

  document.getElementById('cust-billing-backdrop').onclick = closeModal;
  document.getElementById('cust-billing-close').onclick = closeModal;
  document.getElementById('cust-billing-done').onclick = closeModal;

  // Edit Rate from modal
  const editRateBtn = document.getElementById('cb-edit-rate-btn');
  if (editRateBtn) {
    editRateBtn.onclick = () => {
      openEditRateModal({
        connectionId: connection.id,
        customerName: connection.customer_name,
        currentRate: normalBill,
        onSaved: () => {
          openCustomerBillingModal(connectionId, onSaved);
          if (onSaved) onSaved();
        },
      });
    };
  }

  // Settle All button
  const settleAllBtn = document.getElementById('cb-settle-all-btn');
  if (settleAllBtn) {
    settleAllBtn.onclick = () => {
      openRecordPaymentModal({
        connectionId: connection.id,
        customerName: connection.customer_name,
        phone: connection.phone,
        provider: connection.provider,
        connectionType: connection.connection_type,
        onSaved: () => {
          openCustomerBillingModal(connectionId, onSaved);
          if (onSaved) onSaved();
        },
      });
    };
  }

  // Click individual unpaid month chip in modal
  modal.querySelectorAll('.cb-pay-month-chip').forEach((chip) => {
    chip.onclick = () => {
      openRecordPaymentModal({
        connectionId: connection.id,
        customerName: connection.customer_name,
        billingMonth: chip.dataset.month,
        amount: Number(chip.dataset.amount),
        status: 'Paid',
        onSaved: () => {
          openCustomerBillingModal(connectionId, onSaved);
          if (onSaved) onSaved();
        },
      });
    };
  });

  // Record for Month button
  document.getElementById('cb-add-payment-btn').onclick = () => {
    openRecordPaymentModal({
      connectionId: connection.id,
      customerName: connection.customer_name,
      billingMonth: selectedMonth,
      amount: normalBill,
      onSaved: () => {
        openCustomerBillingModal(connectionId, onSaved);
        if (onSaved) onSaved();
      },
    });
  };

  // Edit individual payment in ledger
  modal.querySelectorAll('.cb-edit-payment-btn').forEach((btn) => {
    btn.onclick = () => {
      openRecordPaymentModal({
        id: btn.dataset.id,
        connectionId: connection.id,
        customerName: connection.customer_name,
        billingMonth: btn.dataset.month,
        amount: Number(btn.dataset.amount),
        paymentDate: btn.dataset.date,
        paymentMethod: btn.dataset.method,
        referenceId: btn.dataset.ref,
        notes: btn.dataset.notes,
        onSaved: () => {
          openCustomerBillingModal(connectionId, onSaved);
          if (onSaved) onSaved();
        },
      });
    };
  });

  // View receipt for individual payment in ledger
  modal.querySelectorAll('.cb-receipt-btn').forEach((btn) => {
    btn.onclick = () => {
      openReceiptModal(
        {
          id: btn.dataset.id,
          connection_id: connection.id,
          customer_name: connection.customer_name,
          phone: connection.phone,
          provider: connection.provider,
          connection_type: connection.connection_type,
          billing_month: btn.dataset.month,
          amount: Number(btn.dataset.amount),
          amount_paid: Number(btn.dataset.amount),
          payment_date: btn.dataset.date,
          payment_method: btn.dataset.method,
          reference_id: btn.dataset.ref,
          notes: btn.dataset.notes,
        },
        connection
      );
    };
  });
}

// ═════════════════════════════════════════════════════════════
// PAYMENT RECEIPT SLIP & SHARE MODAL
// ═════════════════════════════════════════════════════════════
export async function openReceiptModal(paymentData, connectionData = null) {
  const modal = document.getElementById('billing-modal') || document.getElementById('connection-modal');
  if (!modal) return;

  const [businessProfile, allConnections, allPayments] = await Promise.all([
    getBusinessProfile(),
    connectionData ? Promise.resolve([connectionData]) : getConnections(),
    typeof paymentData === 'string' ? getBillPayments() : Promise.resolve([]),
  ]);

  let payment = typeof paymentData === 'string' ? allPayments.find((p) => p.id === paymentData) : paymentData;
  if (!payment) {
    showToast('Payment record not found', 'error');
    return;
  }

  let connection =
    connectionData ||
    allConnections.find((c) => c.id === payment.connection_id) || {
      customer_name: payment.customer_name,
      phone: payment.phone,
      provider: payment.provider,
      connection_type: payment.connection_type,
    };

  const receiptHTML = generateReceiptSlipHTML(payment, connection, businessProfile);
  const waText = generateWhatsAppReceiptText(payment, connection, businessProfile);
  const cleanPhone = (payment.phone || connection.phone || '').replace(/[^0-9]/g, '');
  const phoneFormatted = cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone;

  modal.innerHTML = `
    <div class="modal-backdrop" id="receipt-modal-backdrop"></div>
    <div class="modal-content" style="max-width: 440px;">
      <div class="modal-header">
        <h2>Payment Receipt</h2>
        <button class="icon-btn" id="receipt-modal-close">${ICONS.close}</button>
      </div>

      <div style="background: var(--bg-surface); padding: 12px; border-radius: var(--radius-md); border: 1px solid var(--border-subtle); display: flex; justify-content: center; margin-bottom: 16px;">
        <div id="receipt-printable-area" style="width: 100%; max-width: 320px;">
          ${receiptHTML}
        </div>
      </div>

      <div class="modal-actions" style="display: flex; gap: 8px; justify-content: flex-end; flex-wrap: wrap;">
        ${
          cleanPhone
            ? `
          <a href="https://wa.me/${phoneFormatted}?text=${encodeURIComponent(waText)}" target="_blank" rel="noopener" class="btn btn-ghost text-success" title="Share via WhatsApp">
            ${ICONS.whatsapp} Share WA
          </a>
        `
            : ''
        }
        <button type="button" class="btn btn-ghost" id="receipt-print-btn">
          ${ICONS.printer} Print Slip
        </button>
        <button type="button" class="btn btn-primary" id="receipt-done-btn">Done</button>
      </div>
    </div>
  `;

  modal.classList.remove('hidden');

  const closeModal = () => {
    modal.classList.add('hidden');
    modal.innerHTML = '';
  };

  document.getElementById('receipt-modal-backdrop').onclick = closeModal;
  document.getElementById('receipt-modal-close').onclick = closeModal;
  document.getElementById('receipt-done-btn').onclick = closeModal;

  document.getElementById('receipt-print-btn').onclick = () => {
    window.print();
  };
}
