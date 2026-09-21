/**
 * Billing & Payments Controller — GlobalVision
 * Tracks bill payments by customer, month-by-month billing ledger,
 * and dedicated dashboard for Paid vs Yet-to-Pay subscribers.
 */
import {
  getMonthlyBillingSummary,
  recordBillPayment,
  deleteBillPayment,
  getCustomerBillingHistory,
  getConnections,
  getConnectionById,
  getProviders,
  getConnectionTypes,
  getSubscriberRate,
  setSubscriberRate,
} from './store.js';
import { getCurrentUser } from './auth.js';
import {
  formatCurrency,
  currentMonthISO,
  formatMonthYear,
  shiftMonth,
  formatDate,
  todayISO,
  escapeHtml,
  ICONS,
  showToast,
  debounce,
  exportMonthlyBillingCSV,
} from './utils.js';

let selectedMonth = currentMonthISO();
let activeTab = 'all'; // 'all' | 'unpaid' | 'paid'
let filters = {
  search: '',
  provider: 'all',
  connectionType: 'all',
};
let refreshCallback = null;

export async function renderBillingDashboard(onRefresh) {
  refreshCallback = onRefresh;
  const view = document.getElementById('billing-view');
  if (!view) return;

  view.innerHTML = `<div style="padding: 60px 20px; text-align: center; color: var(--text-muted); font-size: 13px;">Loading billing dashboard…</div>`;

  const [summary, providers, connectionTypes] = await Promise.all([
    getMonthlyBillingSummary(selectedMonth),
    getProviders(),
    getConnectionTypes(),
  ]);

  const isCurrentMonth = selectedMonth === currentMonthISO();
  const monthDisplay = formatMonthYear(selectedMonth);

  view.innerHTML = `
    <!-- Billing Header -->
    <div class="conns-header billing-header">
      <div class="conns-title-wrap">
        <div style="display: flex; align-items: center; gap: 10px;">
          <h1 class="billing-page-title">Billing & Payments</h1>
          <span class="live-dot" style="background: var(--success); width: 8px; height: 8px;"></span>
        </div>
        <p>Monitor subscriber bill payments, collect monthly dues, and follow up with unpaid accounts</p>
      </div>

      <!-- Month Navigator & Quick Actions -->
      <div class="billing-header-controls">
        <div class="month-selector-pill">
          <button type="button" class="month-nav-btn" id="month-prev-btn" title="Previous Month">
            &larr;
          </button>
          <div class="month-picker-label" id="month-picker-trigger">
            ${ICONS.calendar}
            <span class="month-picker-text">${monthDisplay}</span>
            <input type="month" id="month-hidden-input" value="${selectedMonth}" class="month-hidden-native-input" />
          </div>
          <button type="button" class="month-nav-btn" id="month-next-btn" title="Next Month">
            &rarr;
          </button>
          ${!isCurrentMonth ? `<button type="button" class="month-today-btn" id="month-today-btn">Current Month</button>` : ''}
        </div>

        <button class="btn btn-ghost" id="billing-export-btn" title="Export monthly billing report to CSV">
          ${ICONS.download}
          <span>Export CSV</span>
        </button>

        <button class="btn btn-primary" id="billing-record-btn">
          ${ICONS.plus}
          <span>Record Payment</span>
        </button>
      </div>
    </div>

    <!-- KPI Summary Row -->
    <div class="kpi-row billing-kpi-row">
      <!-- 1. Total Expected -->
      <div class="kpi-card billing-kpi-card">
        <div class="kpi-top">
          <span class="kpi-label">Total Expected</span>
          <span class="kpi-dot" style="background: var(--accent);"></span>
        </div>
        <div class="kpi-num" id="kpi-total-expected">${formatCurrency(summary.totalExpected)}</div>
        <div class="kpi-sub">${summary.totalSubscribers} active subscribers</div>
      </div>

      <!-- 2. Collected / Paid -->
      <div class="kpi-card billing-kpi-card" style="border-color: rgba(22, 163, 74, 0.35);">
        <div class="kpi-top">
          <span class="kpi-label" style="color: var(--success);">Collected (Paid)</span>
          <span class="kpi-dot" style="background: var(--success);"></span>
        </div>
        <div class="kpi-num" style="color: var(--success);" id="kpi-total-collected">${formatCurrency(summary.totalCollected)}</div>
        <div class="kpi-sub">${summary.paidCount} subscribers paid</div>
      </div>

      <!-- 3. Yet to Pay / Outstanding -->
      <div class="kpi-card billing-kpi-card" style="${summary.pendingCount > 0 ? 'border-color: rgba(217, 119, 6, 0.35);' : ''}">
        <div class="kpi-top">
          <span class="kpi-label" style="${summary.pendingCount > 0 ? 'color: var(--warning);' : ''}">Yet to Pay</span>
          <span class="kpi-dot" style="background: var(--warning);"></span>
        </div>
        <div class="kpi-num" style="${summary.pendingCount > 0 ? 'color: var(--warning);' : ''}" id="kpi-total-pending">${formatCurrency(summary.totalPending)}</div>
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

    <!-- Status Tabs & Toolbar -->
    <div class="billing-toolbar-panel">
      <!-- Status Tabs -->
      <div class="billing-status-tabs">
        <button type="button" class="billing-tab-btn ${activeTab === 'all' ? 'active' : ''}" data-tab="all">
          <span>All Subscribers</span>
          <span class="tab-count-badge">${summary.items.length}</span>
        </button>
        <button type="button" class="billing-tab-btn tab-unpaid ${activeTab === 'unpaid' ? 'active' : ''}" data-tab="unpaid">
          <span class="tab-indicator-dot dot-warning"></span>
          <span>Yet to Pay</span>
          <span class="tab-count-badge badge-warning">${summary.pendingCount}</span>
        </button>
        <button type="button" class="billing-tab-btn tab-paid ${activeTab === 'paid' ? 'active' : ''}" data-tab="paid">
          <span class="tab-indicator-dot dot-success"></span>
          <span>Paid</span>
          <span class="tab-count-badge badge-success">${summary.paidCount}</span>
        </button>
      </div>

      <!-- Filters & Search -->
      <div class="billing-toolbar-right">
        <div class="search-box billing-search-box">
          ${ICONS.search}
          <input type="search" id="billing-search" placeholder="Search by name or phone..." value="${escapeHtml(filters.search)}" />
        </div>
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

    <!-- Monthly Customer Billing Table -->
    <div id="billing-table-container"></div>
  `;

  // Attach Month Selector events
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

  // Tab switching
  view.querySelectorAll('.billing-tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      activeTab = btn.dataset.tab;
      view.querySelectorAll('.billing-tab-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      renderBillingTable(summary.items);
    });
  });

  // Search & Filter listeners
  const searchInput = document.getElementById('billing-search');
  searchInput.addEventListener(
    'input',
    debounce((e) => {
      filters.search = e.target.value;
      renderBillingTable(summary.items);
    }, 250)
  );

  document.getElementById('billing-filter-provider').addEventListener('change', (e) => {
    filters.provider = e.target.value;
    renderBillingTable(summary.items);
  });

  document.getElementById('billing-filter-type').addEventListener('change', (e) => {
    filters.connectionType = e.target.value;
    renderBillingTable(summary.items);
  });

  // Export CSV
  document.getElementById('billing-export-btn').addEventListener('click', () => {
    const filtered = getFilteredItems(summary.items);
    if (filtered.length === 0) {
      showToast('No billing records to export', 'error');
      return;
    }
    exportMonthlyBillingCSV(filtered, selectedMonth);
    showToast(`Exported ${formatMonthYear(selectedMonth)} billing to CSV`, 'success');
  });

  // Record Payment Global Action
  document.getElementById('billing-record-btn').addEventListener('click', () => {
    openRecordPaymentModal({
      billingMonth: selectedMonth,
      onSaved: () => renderBillingDashboard(refreshCallback),
    });
  });

  // Initial table render
  renderBillingTable(summary.items);
}

function changeMonth(delta) {
  selectedMonth = shiftMonth(selectedMonth, delta);
  renderBillingDashboard(refreshCallback);
}

function getFilteredItems(allItems) {
  return allItems.filter((item) => {
    // Tab filter
    if (activeTab === 'unpaid' && item.isPaid) return false;
    if (activeTab === 'paid' && !item.isPaid) return false;

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

    return true;
  });
}

function renderBillingTable(allItems) {
  const container = document.getElementById('billing-table-container');
  if (!container) return;

  const items = getFilteredItems(allItems);

  if (items.length === 0) {
    const isUnpaidEmpty = activeTab === 'unpaid';
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
              <th>Status</th>
              <th>Payment Info</th>
              <th style="text-align: right;">Actions</th>
            </tr>
          </thead>
          <tbody>
            ${items.map((item) => renderBillingRow(item)).join('')}
          </tbody>
        </table>
      </div>
      <div class="table-footer-bar">
        <span>Showing <strong>${items.length}</strong> of <strong>${allItems.length}</strong> subscribers</span>
        <span class="mono" style="font-size: 12px; color: var(--text-muted);">${formatMonthYear(selectedMonth)}</span>
      </div>
    </div>
  `;

  // Attach row action listeners
  container.querySelectorAll('.btn-mark-paid').forEach((btn) => {
    btn.addEventListener('click', () => {
      const connId = btn.dataset.connectionId;
      const connName = btn.dataset.customerName;
      const amount = btn.dataset.amount;
      openRecordPaymentModal({
        connectionId: connId,
        customerName: connName,
        billingMonth: selectedMonth,
        amount: Number(amount) || 500,
        status: 'Paid',
        onSaved: () => renderBillingDashboard(refreshCallback),
      });
    });
  });

  container.querySelectorAll('.btn-edit-payment').forEach((btn) => {
    btn.addEventListener('click', () => {
      const connId = btn.dataset.connectionId;
      const paymentId = btn.dataset.paymentId;
      const connName = btn.dataset.customerName;
      const amount = btn.dataset.amount;
      const paymentDate = btn.dataset.paymentDate;
      const method = btn.dataset.method;
      const ref = btn.dataset.reference;
      const notes = btn.dataset.notes;

      openRecordPaymentModal({
        id: paymentId,
        connectionId: connId,
        customerName: connName,
        billingMonth: selectedMonth,
        amount: Number(amount) || 500,
        status: 'Paid',
        paymentDate,
        paymentMethod: method,
        referenceId: ref,
        notes,
        onSaved: () => renderBillingDashboard(refreshCallback),
      });
    });
  });

  container.querySelectorAll('.btn-view-history').forEach((btn) => {
    btn.addEventListener('click', () => {
      openCustomerBillingModal(btn.dataset.connectionId, () => renderBillingDashboard(refreshCallback));
    });
  });
}

function renderBillingRow(item) {
  const cleanPhone = (item.phone || '').replace(/[^0-9]/g, '');
  const phoneFormatted = cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone;
  const monthDisplay = formatMonthYear(item.billing_month);

  // Customized reminder message
  const reminderMsg = encodeURIComponent(
    `Hello ${item.customer_name}, this is a gentle reminder from GlobalVision regarding your ${item.provider} (${item.connection_type}) connection. Your bill of ${formatCurrency(item.amount)} for ${monthDisplay} is pending. Kindly clear the bill to avoid service disruption. Thank you!`
  );

  // Customized payment acknowledgment receipt message
  const receiptMsg = encodeURIComponent(
    `Hello ${item.customer_name}, thank you for your payment of ${formatCurrency(item.amount_paid || item.amount)} for ${monthDisplay} towards your GlobalVision ${item.provider} connection. Your account is fully up to date!`
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
        ${
          item.isPaid
            ? `<span class="billing-status-badge badge-paid">${ICONS.check} PAID</span>`
            : `<span class="billing-status-badge badge-yet-to-pay">${ICONS.clockPending} YET TO PAY</span>`
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
              data-connection-id="${item.connection_id}"
              data-customer-name="${escapeHtml(item.customer_name)}"
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
              data-connection-id="${item.connection_id}"
              data-payment-id="${item.payment_id || ''}"
              data-customer-name="${escapeHtml(item.customer_name)}"
              data-amount="${item.amount}"
              data-payment-date="${item.payment_date || ''}"
              data-method="${escapeHtml(item.payment_method || '')}"
              data-reference="${escapeHtml(item.reference_id || '')}"
              data-notes="${escapeHtml(item.notes || '')}">
              ${ICONS.edit} Edit
            </button>
          `
          }

          <button type="button" class="btn btn-sm btn-ghost btn-view-history" data-connection-id="${item.connection_id}" title="Customer Billing History">
            ${ICONS.history}
          </button>
        </div>
      </td>
    </tr>
  `;
}

// ═════════════════════════════════════════════════════════════
// RECORD / EDIT PAYMENT MODAL
// ═════════════════════════════════════════════════════════════
export async function openRecordPaymentModal(options = {}) {
  const modal = document.getElementById('billing-modal') || document.getElementById('connection-modal');
  if (!modal) return;

  const connections = await getConnections();
  const defaultMonth = options.billingMonth || selectedMonth || currentMonthISO();
  const editId = options.id || null;

  modal.innerHTML = `
    <div class="modal-backdrop" id="billing-modal-backdrop"></div>
    <div class="modal-content" style="max-width: 480px;">
      <div class="modal-header">
        <h2>${editId ? 'Edit Bill Payment' : 'Record Bill Payment'}</h2>
        <button class="icon-btn" id="billing-modal-close">${ICONS.close}</button>
      </div>

      <form id="record-payment-form" autocomplete="off">
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

        <div class="form-row">
          <div class="form-group">
            <label for="bpm-month">Billing Month *</label>
            <input type="month" id="bpm-month" required value="${defaultMonth}" />
          </div>
          <div class="form-group">
            <label for="bpm-amount">Bill Amount (₹) *</label>
            <input type="number" id="bpm-amount" min="1" step="1" required value="${options.amount || 500}" placeholder="500" />
          </div>
        </div>

        <div class="form-row">
          <div class="form-group">
            <label for="bpm-status">Payment Status *</label>
            <select id="bpm-status" required>
              <option value="Paid" ${(options.status || 'Paid') === 'Paid' ? 'selected' : ''}>Paid (Received)</option>
              <option value="Pending" ${options.status === 'Pending' ? 'selected' : ''}>Pending (Yet to Pay)</option>
            </select>
          </div>
          <div class="form-group">
            <label for="bpm-date">Payment Date</label>
            <input type="date" id="bpm-date" value="${options.paymentDate || todayISO()}" />
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

        <div class="form-group">
          <label for="bpm-notes">Notes / Remarks</label>
          <input type="text" id="bpm-notes" value="${escapeHtml(options.notes || '')}" placeholder="e.g. Paid in full for September" />
        </div>

        <div class="modal-actions" style="display: flex; justify-content: space-between; align-items: center;">
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

  modal.classList.remove('hidden');

  const closeModal = () => {
    modal.classList.add('hidden');
    modal.innerHTML = '';
  };

  document.getElementById('billing-modal-backdrop').onclick = closeModal;
  document.getElementById('billing-modal-close').onclick = closeModal;
  document.getElementById('bpm-cancel-btn').onclick = closeModal;

  // Auto-fill default amount when changing customer
  const custSelect = document.getElementById('bpm-customer');
  if (custSelect.tagName === 'SELECT') {
    custSelect.addEventListener('change', () => {
      const selectedConn = connections.find((c) => c.id === custSelect.value);
      if (selectedConn) {
        const rate = getSubscriberRate(selectedConn);
        document.getElementById('bpm-amount').value = rate;
      }
    });
  }

  // Delete payment
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
    const phone = targetConn?.phone || '';
    const provider = targetConn?.provider || '';
    const connectionType = targetConn?.connection_type || '';
    const billingMonth = document.getElementById('bpm-month').value;
    const amount = Number(document.getElementById('bpm-amount').value) || 0;
    const status = document.getElementById('bpm-status').value;
    const paymentDate = document.getElementById('bpm-date').value;
    const paymentMethod = document.getElementById('bpm-method').value;
    const referenceId = document.getElementById('bpm-ref').value.trim();
    const notes = document.getElementById('bpm-notes').value.trim();

    const actor = await getCurrentUser();

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
        notes,
      },
      actor
    );

    if (res.success) {
      showToast(
        status === 'Paid'
          ? `Payment of ${formatCurrency(amount)} recorded for ${customerName}`
          : `Marked as Yet to Pay for ${customerName}`,
        'success'
      );
      closeModal();
      if (options.onSaved) options.onSaved();
    } else {
      showToast(res.message || 'Failed to save payment', 'error');
      submitBtn.disabled = false;
      submitBtn.textContent = editId ? 'Save Changes' : 'Confirm Payment';
    }
  };
}

// ═════════════════════════════════════════════════════════════
// CUSTOMER BILLING HISTORY MODAL
// ═════════════════════════════════════════════════════════════
export async function openCustomerBillingModal(connectionId, onSaved = null) {
  const modal = document.getElementById('billing-modal') || document.getElementById('connection-modal');
  if (!modal) return;

  modal.innerHTML = `
    <div class="modal-backdrop" id="cust-billing-backdrop"></div>
    <div class="modal-content" style="max-width: 640px;">
      <div style="padding: 40px; text-align: center; color: var(--text-muted);">Loading payment history…</div>
    </div>
  `;
  modal.classList.remove('hidden');

  const { connection, payments } = await getCustomerBillingHistory(connectionId);
  if (!connection) {
    modal.classList.add('hidden');
    showToast('Customer not found', 'error');
    return;
  }

  const defaultRate = getSubscriberRate(connection);
  const totalPaid = payments.filter((p) => p.status === 'Paid').reduce((sum, p) => sum + Number(p.amount_paid || p.amount || 0), 0);

  modal.innerHTML = `
    <div class="modal-backdrop" id="cust-billing-backdrop"></div>
    <div class="modal-content" style="max-width: 640px;">
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
          <span class="cb-stat-label">Monthly Rate</span>
          <span class="cb-stat-val mono">${formatCurrency(defaultRate)}</span>
        </div>
        <div class="cb-stat">
          <span class="cb-stat-label">Total Recorded Paid</span>
          <span class="cb-stat-val mono" style="color: var(--success);">${formatCurrency(totalPaid)}</span>
        </div>
        <div class="cb-stat">
          <span class="cb-stat-label">Total Receipts</span>
          <span class="cb-stat-val">${payments.filter((p) => p.status === 'Paid').length} Months</span>
        </div>
      </div>

      <div style="display: flex; justify-content: space-between; align-items: center; margin: 18px 0 10px;">
        <h3 style="font-size: 14px; font-weight: 700; color: var(--text-primary);">Monthly Payment Ledger</h3>
        <button type="button" class="btn btn-sm btn-primary" id="cb-add-payment-btn">
          ${ICONS.plus} Record for Month
        </button>
      </div>

      <!-- Payments Table -->
      <div class="cust-billing-table-wrap">
        ${
          payments.length === 0
            ? `
          <div style="padding: 30px; text-align: center; color: var(--text-muted); font-size: 13px;">
            No payment records logged yet for this subscriber.<br />
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
                    <button type="button" class="icon-btn cb-edit-payment-btn" data-id="${p.id}" data-month="${p.billing_month}" data-amount="${p.amount}" data-method="${escapeHtml(p.payment_method || '')}" data-date="${p.payment_date || ''}" data-ref="${escapeHtml(p.reference_id || '')}" data-notes="${escapeHtml(p.notes || '')}" title="Edit">
                      ${ICONS.edit}
                    </button>
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

  document.getElementById('cb-add-payment-btn').onclick = () => {
    openRecordPaymentModal({
      connectionId: connection.id,
      customerName: connection.customer_name,
      billingMonth: selectedMonth,
      amount: defaultRate,
      onSaved: () => {
        openCustomerBillingModal(connectionId, onSaved);
        if (onSaved) onSaved();
      },
    });
  };

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
}
