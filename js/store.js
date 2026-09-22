/**
 * Data layer for GlobalVision — talks directly to Supabase (no local cache).
 * Every exported function does a live network call; read functions return
 * empty defaults on error (logged to console), write functions return
 * { success, message?, data? } so callers can surface a toast on failure.
 */
import {
  generateId,
  hashPin,
  todayISO,
  currentMonthISO,
  formatMonthYear,
  formatMonthShort,
  shiftMonth,
  addMonths,
  ALERT_COLOR_CYCLE,
  STATUSES,
} from './utils.js';
import { getSupabase } from './supabase.js';

const DEFAULT_PROVIDERS = ['Railwire', 'BSNL', 'K-Fone', 'Kerala Vision'];
const DEFAULT_CONNECTION_TYPES = ['Broadband', 'Cable TV'];
const DEFAULT_ALERT_TIERS = [
  { id: 'critical', label: 'Critical', days: 7, color: 'danger' },
  { id: 'medium', label: 'Medium', days: 30, color: 'warning' },
  { id: 'low', label: 'Low', days: 60, color: 'info' },
];

export const LOCAL_BUSINESS_PROFILE_KEY = 'gv_business_profile';
export const LOCAL_MASTER_PLANS_KEY = 'gv_master_plans';

const DEFAULT_BUSINESS_PROFILE = {
  name: 'GlobalVision',
  phone: '9497801353',
  whatsapp: '9497801353',
  address: 'Velur, Thrissur, Kerala',
  upiId: 'globalvision@upi',
  footerNote: 'Broadband & Cable TV Subscriber Network',
};

const DEFAULT_MASTER_PLANS = [
  { id: 'p1', name: 'Railwire Fiber 50 Mbps', provider: 'Railwire', connection_type: 'Broadband', rate: 499 },
  { id: 'p2', name: 'Railwire Fiber 100 Mbps', provider: 'Railwire', connection_type: 'Broadband', rate: 799 },
  { id: 'p3', name: 'BSNL Bharat Fiber 60M', provider: 'BSNL', connection_type: 'Broadband', rate: 599 },
  { id: 'p4', name: 'K-Fone Standard 50M', provider: 'K-Fone', connection_type: 'Broadband', rate: 499 },
  { id: 'p5', name: 'Kerala Vision Basic TV', provider: 'Kerala Vision', connection_type: 'Cable TV', rate: 250 },
  { id: 'p6', name: 'Kerala Vision HD Plus', provider: 'Kerala Vision', connection_type: 'Cable TV', rate: 350 },
];

function db() {
  const client = getSupabase();
  if (!client) throw new Error('Supabase is not configured');
  return client;
}

function logError(context, error) {
  console.error(`[store] ${context}:`, error?.message || error);
}

// ─── Bootstrap ──────────────────────────────────────────────
// Called once at app startup, after Supabase is confirmed configured.
// Ensures the settings row exists and seeds a default user on a brand-new project.
export async function initStore() {
  const client = getSupabase();
  if (!client) return { ok: false, message: 'Supabase is not configured.' };

  try {
    const { data: settingsRow, error: settingsErr } = await client.from('app_settings').select('*').eq('id', 1).maybeSingle();
    if (settingsErr) throw settingsErr;
    if (!settingsRow) {
      const { error: insertErr } = await client.from('app_settings').insert({
        id: 1,
        providers: DEFAULT_PROVIDERS,
        connection_types: DEFAULT_CONNECTION_TYPES,
        alert_tiers: DEFAULT_ALERT_TIERS,
      });
      if (insertErr) throw insertErr;
    }

    const { count, error: countErr } = await client.from('users').select('id', { count: 'exact', head: true });
    if (countErr) throw countErr;
    if (!count) {
      const pinHash = await hashPin('2026');
      const { error: userErr } = await client.from('users').insert({ name: 'Thanu', pin_hash: pinHash });
      if (userErr) throw userErr;
    }

    return { ok: true };
  } catch (err) {
    logError('initStore', err);
    const message = /relation .* does not exist/i.test(err?.message || '')
      ? 'Database tables are missing — run the SQL schema from Settings before continuing.'
      : err?.message || 'Could not reach Supabase.';
    return { ok: false, message };
  }
}

// ─── User Operations ──────────────────────────────────────
export async function getUsers() {
  try {
    const { data, error } = await db().from('users').select('*').order('created_at', { ascending: true });
    if (error) throw error;
    return data || [];
  } catch (err) {
    logError('getUsers', err);
    return [];
  }
}

export async function verifyPin(userId, pin) {
  try {
    const { data, error } = await db().from('users').select('pin_hash').eq('id', userId).maybeSingle();
    if (error) throw error;
    if (!data) return false;
    const pinHash = await hashPin(pin);
    return data.pin_hash === pinHash;
  } catch (err) {
    logError('verifyPin', err);
    return false;
  }
}

export async function getUserById(userId) {
  try {
    const { data, error } = await db().from('users').select('*').eq('id', userId).maybeSingle();
    if (error) throw error;
    return data || null;
  } catch (err) {
    logError('getUserById', err);
    return null;
  }
}

export async function changePin(userId, newPin) {
  try {
    const pinHash = await hashPin(newPin);
    const { error } = await db().from('users').update({ pin_hash: pinHash }).eq('id', userId);
    if (error) throw error;
    return { success: true };
  } catch (err) {
    logError('changePin', err);
    return { success: false, message: err?.message || 'Failed to update PIN' };
  }
}

export async function addUser(name, pin) {
  try {
    const pinHash = await hashPin(pin);
    const { data, error } = await db().from('users').insert({ name, pin_hash: pinHash }).select().single();
    if (error) throw error;
    return { success: true, data };
  } catch (err) {
    logError('addUser', err);
    return { success: false, message: err?.message || 'Failed to add user' };
  }
}

export async function updateUserName(userId, newName) {
  try {
    const { error } = await db().from('users').update({ name: newName }).eq('id', userId);
    if (error) throw error;
    return { success: true };
  } catch (err) {
    logError('updateUserName', err);
    return { success: false, message: err?.message || 'Failed to update name' };
  }
}

export async function deleteUser(userId) {
  try {
    const { count, error: countErr } = await db().from('users').select('id', { count: 'exact', head: true });
    if (countErr) throw countErr;
    if (count <= 1) {
      return { success: false, message: 'Cannot delete the only remaining user.' };
    }
    const { error } = await db().from('users').delete().eq('id', userId);
    if (error) throw error;
    return { success: true };
  } catch (err) {
    logError('deleteUser', err);
    return { success: false, message: err?.message || 'Failed to remove user' };
  }
}

export async function updateUser(userId, { name, pin } = {}) {
  try {
    const updates = {};
    if (name && name.trim()) updates.name = name.trim();
    if (pin && /^\d{4}$/.test(pin)) {
      updates.pin_hash = await hashPin(pin);
    }
    if (Object.keys(updates).length === 0) return { success: true };
    const { error } = await db().from('users').update(updates).eq('id', userId);
    if (error) throw error;
    return { success: true };
  } catch (err) {
    logError('updateUser', err);
    return { success: false, message: err?.message || 'Failed to update user' };
  }
}

// ─── Connection Operations ─────────────────────────────────
export async function getConnections() {
  try {
    const { data, error } = await db().from('connections').select('*');
    if (error) throw error;
    return data || [];
  } catch (err) {
    logError('getConnections', err);
    return [];
  }
}

export async function getConnectionById(id) {
  try {
    const { data, error } = await db().from('connections').select('*').eq('id', id).maybeSingle();
    if (error) throw error;
    return data || null;
  } catch (err) {
    logError('getConnectionById', err);
    return null;
  }
}

export async function addConnection(connection) {
  try {
    const { data, error } = await db().from('connections').insert(connection).select().single();
    if (error) throw error;
    return { success: true, data };
  } catch (err) {
    logError('addConnection', err);
    return { success: false, message: err?.message || 'Failed to add subscriber' };
  }
}

export async function updateConnection(id, updates, actor = null) {
  try {
    let previousStatus = null;
    if (updates.status) {
      const { data: before } = await db().from('connections').select('status').eq('id', id).maybeSingle();
      previousStatus = before?.status || null;
    }

    const { data, error } = await db()
      .from('connections')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;

    if (updates.status && updates.status !== previousStatus) {
      await logConnectionEvent(data, previousStatus, updates.status, actor);
    }

    return { success: true, data };
  } catch (err) {
    logError('updateConnection', err);
    return { success: false, message: err?.message || 'Failed to update subscriber' };
  }
}

// Best-effort audit trail for status changes (e.g. disconnections). A logging
// failure must never block the underlying status update, so errors are swallowed.
async function logConnectionEvent(connection, previousStatus, newStatus, actor) {
  try {
    const { error } = await db().from('connection_events').insert({
      connection_id: connection.id,
      customer_name: connection.customer_name,
      provider: connection.provider,
      connection_type: connection.connection_type,
      previous_status: previousStatus,
      new_status: newStatus,
      changed_by: actor?.id || null,
      changed_by_name: actor?.name || null,
    });
    if (error) throw error;
  } catch (err) {
    logError('logConnectionEvent', err);
  }
}

// ─── Connection Events (Activity Log) ──────────────────────
// Returns { events, error }. A load failure must stay distinguishable from a
// genuinely empty log, otherwise a missing table reads as "no activity yet".
export async function getConnectionEvents({ eventType = 'all', search = '', limit = 300 } = {}) {
  try {
    // Filter server-side: a client-side pass would only ever search within the
    // newest `limit` rows and report older matches as "no activity".
    let query = db().from('connection_events').select('*');
    if (eventType !== 'all') query = query.eq('new_status', eventType);
    if (search) query = query.ilike('customer_name', `%${search.replace(/[%_\\]/g, '\\$&')}%`);

    const { data, error } = await query.order('created_at', { ascending: false }).limit(limit);
    if (error) throw error;

    return { events: data || [], error: null };
  } catch (err) {
    logError('getConnectionEvents', err);
    const missingTable = /relation .* does not exist|schema cache/i.test(err?.message || '');
    return {
      events: [],
      error: missingTable
        ? 'The activity log table is missing — run the SQL schema from Settings → Database Connection.'
        : err?.message || 'Could not load the activity log.',
    };
  }
}

export async function deleteConnection(id) {
  try {
    const { error } = await db().from('connections').delete().eq('id', id);
    if (error) throw error;
    return { success: true };
  } catch (err) {
    logError('deleteConnection', err);
    return { success: false, message: err?.message || 'Failed to delete subscriber' };
  }
}

export async function quickRenewConnection(id, months = 1, actor = null) {
  try {
    const conn = await getConnectionById(id);
    if (!conn) return { success: false, message: 'Subscriber not found' };

    const today = todayISO();
    const baseDate = conn.expiry_date && conn.expiry_date > today ? conn.expiry_date : today;
    const newExpiry = addMonths(baseDate, months);

    const updates = {
      expiry_date: newExpiry,
      status: 'Active',
    };

    return await updateConnection(id, updates, actor);
  } catch (err) {
    logError('quickRenewConnection', err);
    return { success: false, message: err?.message || 'Quick renewal failed' };
  }
}

export async function bulkUpdateConnections(ids = [], updates = {}, actor = null) {
  if (!ids || ids.length === 0) return { success: true, count: 0 };
  let successCount = 0;
  for (const id of ids) {
    const res = await updateConnection(id, updates, actor);
    if (res.success) successCount++;
  }
  return { success: true, count: successCount };
}

// ─── Bill Payments Operations ──────────────────────────────
const LOCAL_PAYMENTS_KEY = 'globalvision_bill_payments';
const LOCAL_RATES_KEY = 'globalvision_customer_rates';

function getLocalPayments() {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_PAYMENTS_KEY) || '[]');
  } catch {
    return [];
  }
}

function saveLocalPayments(list) {
  try {
    localStorage.setItem(LOCAL_PAYMENTS_KEY, JSON.stringify(list));
  } catch (e) {
    console.error('Failed to save bill payments locally:', e);
  }
}

export function getSubscriberRate(connection) {
  if (!connection) return 500;
  // Check local rate override
  try {
    const rates = JSON.parse(localStorage.getItem(LOCAL_RATES_KEY) || '{}');
    if (rates[connection.id]) return Number(rates[connection.id]);
  } catch {}
  // Check if noted in notes: e.g. [Rate: 600] or [Plan: ₹600]
  if (connection.notes) {
    const m = connection.notes.match(/\[(?:Rate|Plan):\s*₹?(\d+(?:\.\d+)?)\]/i);
    if (m && m[1]) return Number(m[1]);
  }
  // Default fallback rate based on connection type
  return connection.connection_type === 'Cable TV' ? 350 : 500;
}

export function setSubscriberRate(connectionId, rate) {
  try {
    const rates = JSON.parse(localStorage.getItem(LOCAL_RATES_KEY) || '{}');
    rates[connectionId] = Number(rate) || 500;
    localStorage.setItem(LOCAL_RATES_KEY, JSON.stringify(rates));
  } catch (e) {
    console.error('Failed to save rate:', e);
  }
}

export async function updateSubscriberRate(connectionId, newRate, actor = null) {
  const numericRate = Math.max(0, Number(newRate) || 0);
  setSubscriberRate(connectionId, numericRate);
  try {
    const conn = await getConnectionById(connectionId);
    if (conn) {
      let notes = conn.notes || '';
      if (/\[(?:Rate|Plan):\s*₹?\d+(?:\.\d+)?\]/i.test(notes)) {
        notes = notes.replace(/\[(?:Rate|Plan):\s*₹?\d+(?:\.\d+)?\]/i, `[Rate: ₹${numericRate}]`);
      } else {
        notes = notes ? `${notes.trim()} [Rate: ₹${numericRate}]` : `[Rate: ₹${numericRate}]`;
      }
      await updateConnection(connectionId, { notes }, actor);
    }
  } catch (err) {
    logError('updateSubscriberRate', err);
  }
  return { success: true, rate: numericRate };
}

export async function getBillPayments({ billingMonth, connectionId } = {}) {
  try {
    let query = db().from('bill_payments').select('*');
    if (billingMonth) query = query.eq('billing_month', billingMonth);
    if (connectionId) query = query.eq('connection_id', connectionId);

    const { data, error } = await query.order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
  } catch (err) {
    logError('getBillPayments (using local cache)', err);
    let list = getLocalPayments();
    if (billingMonth) list = list.filter((p) => p.billing_month === billingMonth);
    if (connectionId) list = list.filter((p) => p.connection_id === connectionId);
    return list;
  }
}

export async function recordBillPayment(payment, actor = null) {
  const payload = {
    connection_id: payment.connection_id,
    customer_name: payment.customer_name,
    phone: payment.phone || '',
    provider: payment.provider || '',
    connection_type: payment.connection_type || '',
    billing_month: payment.billing_month,
    amount: Number(payment.amount) || 0,
    amount_paid: Number(payment.amount_paid ?? payment.amount) || 0,
    status: payment.status || 'Paid',
    payment_date: payment.payment_date || todayISO(),
    payment_method: payment.payment_method || 'Cash',
    reference_id: payment.reference_id || '',
    notes: payment.notes || '',
    recorded_by: actor?.id || null,
    recorded_by_name: actor?.name || null,
    updated_at: new Date().toISOString(),
  };

  // Remember the rate for this customer
  if (payment.connection_id && payload.amount > 0) {
    setSubscriberRate(payment.connection_id, payload.amount);
  }

  try {
    // Check if record exists for this connection & month
    const { data: existing } = await db()
      .from('bill_payments')
      .select('id')
      .eq('connection_id', payment.connection_id)
      .eq('billing_month', payment.billing_month)
      .maybeSingle();

    let result;
    if (existing?.id || payment.id) {
      const targetId = existing?.id || payment.id;
      const { data, error } = await db()
        .from('bill_payments')
        .update(payload)
        .eq('id', targetId)
        .select()
        .single();
      if (error) throw error;
      result = data;
    } else {
      const { data, error } = await db()
        .from('bill_payments')
        .insert({ ...payload, created_at: new Date().toISOString() })
        .select()
        .single();
      if (error) throw error;
      result = data;
    }

    // Mirror to local cache
    const local = getLocalPayments();
    const idx = local.findIndex((p) => (result.id && p.id === result.id) || (p.connection_id === payment.connection_id && p.billing_month === payment.billing_month));
    if (idx >= 0) {
      local[idx] = result;
    } else {
      local.unshift(result);
    }
    saveLocalPayments(local);

    return { success: true, data: result };
  } catch (err) {
    logError('recordBillPayment (saving to local cache)', err);
    // Fallback to local storage
    const local = getLocalPayments();
    const existingIdx = local.findIndex(
      (p) => (payment.id && p.id === payment.id) || (p.connection_id === payment.connection_id && p.billing_month === payment.billing_month)
    );
    const item = {
      id: payment.id || (existingIdx >= 0 ? local[existingIdx].id : generateId()),
      ...payload,
      created_at: existingIdx >= 0 ? local[existingIdx].created_at : new Date().toISOString(),
    };
    if (existingIdx >= 0) {
      local[existingIdx] = item;
    } else {
      local.unshift(item);
    }
    saveLocalPayments(local);
    return { success: true, data: item, isLocal: true };
  }
}

export async function deleteBillPayment(id) {
  try {
    const { error } = await db().from('bill_payments').delete().eq('id', id);
    if (error) throw error;
  } catch (err) {
    logError('deleteBillPayment (deleting from local cache)', err);
  }
  const local = getLocalPayments().filter((p) => p.id !== id);
  saveLocalPayments(local);
  return { success: true };
}

export async function getDailyCollectionSummary(dateStr = todayISO()) {
  try {
    let payments = [];
    try {
      const { data, error } = await db()
        .from('bill_payments')
        .select('*')
        .eq('payment_date', dateStr)
        .eq('status', 'Paid');
      if (!error && data) {
        payments = data;
      }
    } catch {}

    // Fallback & merge with local storage payments
    const local = getLocalPayments().filter(
      (p) => p.payment_date === dateStr && p.status === 'Paid'
    );
    const seen = new Set(payments.map((p) => p.id));
    for (const lp of local) {
      if (!seen.has(lp.id)) payments.push(lp);
    }

    let totalAmount = 0;
    let cashAmount = 0;
    let upiAmount = 0;
    let bankAmount = 0;
    let otherAmount = 0;

    for (const p of payments) {
      const amt = Number(p.amount_paid ?? p.amount) || 0;
      totalAmount += amt;
      const method = (p.payment_method || 'Cash').toLowerCase();
      if (method.includes('cash')) {
        cashAmount += amt;
      } else if (method.includes('upi') || method.includes('gpay') || method.includes('phonepe') || method.includes('paytm')) {
        upiAmount += amt;
      } else if (method.includes('bank') || method.includes('transfer') || method.includes('neft')) {
        bankAmount += amt;
      } else {
        otherAmount += amt;
      }
    }

    return {
      date: dateStr,
      totalAmount,
      cashAmount,
      upiAmount,
      bankAmount,
      otherAmount,
      count: payments.length,
      payments,
    };
  } catch (err) {
    logError('getDailyCollectionSummary', err);
    return {
      date: dateStr,
      totalAmount: 0,
      cashAmount: 0,
      upiAmount: 0,
      bankAmount: 0,
      otherAmount: 0,
      count: 0,
      payments: [],
    };
  }
}

// Helper: returns array of months between start and end (inclusive)
function getMonthsBetween(startMonth, endMonth) {
  const months = [];
  let cur = startMonth;
  while (cur <= endMonth) {
    months.push(cur);
    cur = shiftMonth(cur, 1);
    if (months.length > 48) break; // safety ceiling
  }
  return months;
}

/**
 * Detailed multi-month billing & overdue tracker for all subscribers.
 * Evaluates normal bill, unpaid months breakdown, number of dues,
 * and cumulative overdue balance per subscriber and network-wide.
 */
export async function getAllSubscribersOverdueLedger({
  lookbackMonths = 6, // 3, 6, 12, or 0 (since connection start)
} = {}) {
  const [connections, allPayments] = await Promise.all([
    getConnections(),
    getBillPayments(),
  ]);

  const currentMonth = currentMonthISO();

  // Map: connection_id -> Map of billing_month -> payment
  const paymentsByConn = new Map();
  allPayments.forEach((p) => {
    if (!paymentsByConn.has(p.connection_id)) {
      paymentsByConn.set(p.connection_id, new Map());
    }
    paymentsByConn.get(p.connection_id).set(p.billing_month, p);
  });

  // Filter to active or relevant subscribers (exclude Disconnected unless they have records/dues)
  const relevantSubs = connections.filter(
    (c) => c.status !== 'Disconnected' || paymentsByConn.has(c.id)
  );

  let totalNetworkOverdue = 0;
  let totalSubscribersWithDues = 0;
  let criticalCount = 0; // 3+ dues
  let warningCount = 0; // 1-2 past overdue dues
  let currentDueOnlyCount = 0; // only current month due
  let clearedCount = 0; // 0 dues
  let totalMonthlyRunRate = 0;

  const items = relevantSubs.map((conn) => {
    const normalBill = getSubscriberRate(conn);
    totalMonthlyRunRate += normalBill;

    const connPaymentsMap = paymentsByConn.get(conn.id) || new Map();

    // Determine starting month for this subscriber
    let connStartMonth = conn.connection_date
      ? conn.connection_date.slice(0, 7)
      : conn.created_at
      ? conn.created_at.slice(0, 7)
      : shiftMonth(currentMonth, -5);

    if (connStartMonth > currentMonth) {
      connStartMonth = currentMonth;
    }

    let evalStartMonth = connStartMonth;
    if (lookbackMonths > 0) {
      const earliestLookback = shiftMonth(currentMonth, -(lookbackMonths - 1));
      if (evalStartMonth < earliestLookback) {
        evalStartMonth = earliestLookback;
      }
    } else {
      const max24 = shiftMonth(currentMonth, -23);
      if (evalStartMonth < max24) evalStartMonth = max24;
    }

    // Build unique sorted list of evaluated months
    const evaluatedMonthsSet = new Set(getMonthsBetween(evalStartMonth, currentMonth));
    connPaymentsMap.forEach((_, m) => {
      if (m <= currentMonth && m >= shiftMonth(currentMonth, -23)) {
        evaluatedMonthsSet.add(m);
      }
    });

    const evaluatedMonths = Array.from(evaluatedMonthsSet).sort();

    const unpaidMonths = [];
    let paidMonthsCount = 0;
    let subscriberOverdue = 0;
    let mostRecentPayment = null;

    evaluatedMonths.forEach((m) => {
      const payment = connPaymentsMap.get(m);
      const isPaid = payment && payment.status === 'Paid';
      const isCurrentMonth = m === currentMonth;
      const isPastMonth = m < currentMonth;

      if (isPaid) {
        paidMonthsCount++;
        if (
          !mostRecentPayment ||
          (payment.payment_date &&
            (!mostRecentPayment.payment_date || payment.payment_date > mostRecentPayment.payment_date))
        ) {
          mostRecentPayment = payment;
        }
      } else {
        const monthAmount = payment ? Number(payment.amount) : normalBill;
        const amountPaid = payment ? Number(payment.amount_paid || 0) : 0;
        const outstanding = Math.max(0, monthAmount - amountPaid);

        subscriberOverdue += outstanding;
        unpaidMonths.push({
          month: m,
          label: formatMonthYear(m),
          shortLabel: formatMonthShort(m),
          amount: monthAmount,
          amountPaid,
          outstanding,
          isCurrentMonth,
          isOverdue: isPastMonth,
          paymentId: payment?.id || null,
        });
      }
    });

    const unpaidDuesCount = unpaidMonths.length;
    totalNetworkOverdue += subscriberOverdue;

    let duesSeverity = 'cleared';
    if (unpaidDuesCount > 0) {
      totalSubscribersWithDues++;
      const pastOverdueCount = unpaidMonths.filter((m) => m.isOverdue).length;
      if (unpaidDuesCount >= 3 || pastOverdueCount >= 2) {
        duesSeverity = 'critical';
        criticalCount++;
      } else if (pastOverdueCount >= 1) {
        duesSeverity = 'warning';
        warningCount++;
      } else {
        duesSeverity = 'current';
        currentDueOnlyCount++;
      }
    } else {
      clearedCount++;
    }

    return {
      connection_id: conn.id,
      customer_name: conn.customer_name,
      phone: conn.phone || '',
      provider: conn.provider,
      connection_type: conn.connection_type,
      status: conn.status,
      normalBill,
      unpaidMonths,
      unpaidDuesCount,
      totalOverdue: subscriberOverdue,
      paidMonthsCount,
      duesSeverity,
      lastPayment: mostRecentPayment,
      evaluatedMonthsCount: evaluatedMonths.length,
      oldestUnpaidMonth: unpaidMonths[0] || null,
      notes: conn.notes || '',
    };
  });

  const totalSubscribers = relevantSubs.length;
  const clearedRate = totalSubscribers > 0 ? Math.round((clearedCount / totalSubscribers) * 100) : 100;

  return {
    items,
    totalNetworkOverdue,
    totalSubscribersWithDues,
    criticalCount,
    warningCount,
    currentDueOnlyCount,
    clearedCount,
    totalMonthlyRunRate,
    totalSubscribers,
    clearedRate,
    currentMonth,
    lookbackMonths,
  };
}

/**
 * Bulk / multi-month settlement for a subscriber's unpaid dues.
 * Marks specified months as paid and reduces the customer's outstanding balance.
 */
export async function settleMultipleDues(
  {
    connectionId,
    customerName,
    phone = '',
    provider = '',
    connectionType = '',
    months = [], // array of month ISO strings e.g. ['2026-07', '2026-08'] or objects { month, amount }
    paymentDate = todayISO(),
    paymentMethod = 'Cash',
    referenceId = '',
    notes = '',
  } = {},
  actor = null
) {
  if (!connectionId) return { success: false, message: 'Connection ID is required' };
  if (!months || months.length === 0) {
    return { success: false, message: 'No billing months selected to settle' };
  }

  const conn = await getConnectionById(connectionId);
  const defaultRate = conn ? getSubscriberRate(conn) : 500;

  const results = [];
  for (const item of months) {
    const month = typeof item === 'string' ? item : item.month;
    const amount = typeof item === 'object' && item.amount ? Number(item.amount) : defaultRate;

    const res = await recordBillPayment(
      {
        connection_id: connectionId,
        customer_name: customerName || conn?.customer_name || 'Subscriber',
        phone: phone || conn?.phone || '',
        provider: provider || conn?.provider || '',
        connection_type: connectionType || conn?.connection_type || '',
        billing_month: month,
        amount,
        amount_paid: amount,
        status: 'Paid',
        payment_date: paymentDate,
        payment_method: paymentMethod,
        reference_id: referenceId,
        notes: notes ? `${notes}` : 'Settled via Overdue Tracker',
      },
      actor
    );
    results.push(res);
  }

  const allSuccess = results.every((r) => r.success);
  return {
    success: allSuccess,
    count: results.length,
    results,
  };
}

export async function getMonthlyBillingSummary(billingMonth) {
  const [connections, payments, overdueLedger] = await Promise.all([
    getConnections(),
    getBillPayments({ billingMonth }),
    getAllSubscribersOverdueLedger({ lookbackMonths: 6 }),
  ]);

  const paymentMap = new Map();
  payments.forEach((p) => {
    paymentMap.set(p.connection_id, p);
  });

  const overdueMap = new Map();
  overdueLedger.items.forEach((item) => {
    overdueMap.set(item.connection_id, item);
  });

  let totalExpected = 0;
  let totalCollected = 0;
  let paidCount = 0;
  let pendingCount = 0;

  // Active / operational subscribers (or any subscriber with a record for this month)
  const relevantSubs = connections.filter((c) => c.status !== 'Disconnected' || paymentMap.has(c.id));

  const items = relevantSubs.map((conn) => {
    const payment = paymentMap.get(conn.id);
    const overdueInfo = overdueMap.get(conn.id);
    const defaultRate = overdueInfo?.normalBill ?? getSubscriberRate(conn);
    const billAmount = payment ? Number(payment.amount) : defaultRate;
    const isPaid = payment && payment.status === 'Paid';
    const amountPaid = isPaid ? Number(payment.amount_paid || payment.amount || 0) : 0;

    totalExpected += billAmount;
    if (isPaid) {
      totalCollected += amountPaid;
      paidCount++;
    } else {
      pendingCount++;
    }

    // Historical dues prior to this month
    const priorUnpaidMonths = (overdueInfo?.unpaidMonths || []).filter((m) => m.month < billingMonth);
    const priorOverdueAmount = priorUnpaidMonths.reduce((s, m) => s + (m.outstanding || m.amount), 0);

    return {
      connection_id: conn.id,
      payment_id: payment?.id || null,
      customer_name: conn.customer_name,
      phone: conn.phone || '',
      provider: conn.provider,
      connection_type: conn.connection_type,
      status: conn.status,
      billing_month: billingMonth,
      normalBill: defaultRate,
      amount: billAmount,
      amount_paid: amountPaid,
      isPaid,
      payment_date: payment?.payment_date || null,
      payment_method: payment?.payment_method || null,
      reference_id: payment?.reference_id || '',
      notes: payment?.notes || conn.notes || '',
      // Detailed overdue context
      priorUnpaidMonths,
      priorOverdueCount: priorUnpaidMonths.length,
      priorOverdueAmount,
      totalSubscriberOverdue: overdueInfo?.totalOverdue || (isPaid ? 0 : billAmount),
      totalUnpaidDuesCount: overdueInfo?.unpaidDuesCount || (isPaid ? 0 : 1),
      allUnpaidMonths: overdueInfo?.unpaidMonths || [],
      duesSeverity: overdueInfo?.duesSeverity || (isPaid ? 'cleared' : 'current'),
    };
  });

  const totalPending = Math.max(0, totalExpected - totalCollected);
  const collectionRate = totalExpected > 0 ? Math.round((totalCollected / totalExpected) * 100) : 0;

  return {
    billingMonth,
    totalExpected,
    totalCollected,
    totalPending,
    paidCount,
    pendingCount,
    totalSubscribers: items.length,
    collectionRate,
    items,
    networkOverdueSummary: {
      totalNetworkOverdue: overdueLedger.totalNetworkOverdue,
      totalSubscribersWithDues: overdueLedger.totalSubscribersWithDues,
      criticalCount: overdueLedger.criticalCount,
      warningCount: overdueLedger.warningCount,
    },
  };
}

export async function getCustomerBillingHistory(connectionId, { lookbackMonths = 12 } = {}) {
  const [payments, connection, overdueLedger] = await Promise.all([
    getBillPayments({ connectionId }),
    getConnectionById(connectionId),
    getAllSubscribersOverdueLedger({ lookbackMonths }),
  ]);
  payments.sort((a, b) => (b.billing_month || '').localeCompare(a.billing_month || ''));

  const ledgerItem = overdueLedger.items.find((item) => item.connection_id === connectionId);

  return {
    connection,
    payments,
    normalBill: ledgerItem?.normalBill ?? (connection ? getSubscriberRate(connection) : 500),
    unpaidMonths: ledgerItem?.unpaidMonths || [],
    unpaidDuesCount: ledgerItem?.unpaidDuesCount || 0,
    totalOverdue: ledgerItem?.totalOverdue || 0,
    duesSeverity: ledgerItem?.duesSeverity || 'cleared',
    paidMonthsCount: ledgerItem?.paidMonthsCount || 0,
    lastPayment: ledgerItem?.lastPayment || null,
  };
}

// Read paths above return empty defaults on failure so a screen can still
// render. A backup must not: an empty file that claims success is worse than
// no file, so this throws instead.
export async function getBackupSnapshot() {
  const client = getSupabase();
  if (!client) throw new Error('Supabase is not configured');

  const [users, connections, settings] = await Promise.all([
    client.from('users').select('*').order('created_at', { ascending: true }),
    client.from('connections').select('*'),
    client.from('app_settings').select('*').eq('id', 1).maybeSingle(),
  ]);

  for (const [label, res] of [['users', users], ['subscribers', connections], ['settings', settings]]) {
    if (res.error) {
      logError('getBackupSnapshot', res.error);
      throw new Error(`Could not read ${label}: ${res.error.message || 'unknown error'}`);
    }
  }

  const billPayments = await getBillPayments();

  return {
    users: users.data || [],
    connections: connections.data || [],
    settings: settings.data || null,
    bill_payments: billPayments || [],
    exported_at: new Date().toISOString(),
  };
}

// ─── Filtered / Sorted Queries ─────────────────────────────
export async function queryConnections({ search, provider, connectionType, status, sortBy = 'expiry_date', sortDir = 'asc' } = {}) {
  let connections = await getConnections();

  if (search) {
    const q = search.toLowerCase();
    connections = connections.filter(
      (c) =>
        (c.customer_name || '').toLowerCase().includes(q) ||
        (c.phone || '').toLowerCase().includes(q)
    );
  }
  if (provider && provider !== 'all') {
    connections = connections.filter((c) => c.provider === provider);
  }
  if (connectionType && connectionType !== 'all') {
    connections = connections.filter((c) => c.connection_type === connectionType);
  }
  if (status && status !== 'all') {
    connections = connections.filter((c) => c.status === status);
  }

  connections.sort((a, b) => {
    let valA = a[sortBy] || '';
    let valB = b[sortBy] || '';
    if (sortBy.includes('date')) {
      valA = new Date(valA || '9999-12-31').getTime();
      valB = new Date(valB || '9999-12-31').getTime();
    }
    if (typeof valA === 'string') {
      valA = valA.toLowerCase();
      valB = valB.toLowerCase();
    }
    if (sortDir === 'asc') return valA > valB ? 1 : valA < valB ? -1 : 0;
    return valA < valB ? 1 : valA > valB ? -1 : 0;
  });

  return connections;
}

// ─── Dashboard Queries ─────────────────────────────────────
export async function getAlertConnections(withinDays) {
  const connections = await getConnections();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const limit = new Date(today);
  limit.setDate(limit.getDate() + withinDays);

  return connections.filter((c) => {
    if (c.status === 'Disconnected' || c.status === 'Expired') return false;
    if (!c.expiry_date) return false;
    const expiry = new Date(c.expiry_date);
    expiry.setHours(0, 0, 0, 0);
    return expiry >= today && expiry <= limit;
  });
}

export async function getOverdueConnections() {
  const connections = await getConnections();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return connections.filter((c) => {
    if (c.status === 'Disconnected' || c.status === 'Expired') return false;
    if (!c.expiry_date) return false;
    const expiry = new Date(c.expiry_date);
    expiry.setHours(0, 0, 0, 0);
    return expiry < today;
  });
}

export async function getStatusCounts() {
  const connections = await getConnections();
  const counts = {
    total: connections.length,
    Active: 0,
    'Pending Disconnection': 0,
    Disconnected: 0,
    Expired: 0,
    Renewed: 0,
  };
  connections.forEach((c) => {
    if (counts[c.status] !== undefined) counts[c.status]++;
  });
  return counts;
}

// Overdue + the most urgent (first) alert tier — used for top-bar / sidebar counts.
export async function getUrgentConnections() {
  const tiers = await getAlertTiers();
  const criticalDays = tiers.length ? tiers[0].days : 7;
  const [overdue, critical] = await Promise.all([getOverdueConnections(), getAlertConnections(criticalDays)]);
  return [...overdue, ...critical];
}

// ─── Bulk Import ───────────────────────────────────────────
const isISODate = (v) => /^\d{4}-\d{2}-\d{2}$/.test(v || '');

// Match an incoming free-text value against the allowed list case-insensitively,
// falling back rather than storing a value no dropdown can represent.
function matchOption(value, allowed, fallback) {
  const trimmed = String(value || '').trim();
  return allowed.find((a) => a.toLowerCase() === trimmed.toLowerCase()) || fallback;
}

export async function importConnections(newItems) {
  try {
    const [providers, types] = await Promise.all([getProviders(), getConnectionTypes()]);
    const defaultProvider = providers[0] || 'Railwire';
    const defaultType = types[0] || 'Broadband';

    // A single bad date fails the whole batch insert, so drop unusable rows here
    // and tell the caller how many were skipped.
    const rows = newItems
      .filter((item) => item.customer_name && isISODate(item.expiry_date))
      .map((item) => ({
        customer_name: item.customer_name,
        phone: item.phone || '',
        provider: matchOption(item.provider, providers, defaultProvider),
        connection_type: matchOption(item.connection_type, types, defaultType),
        connection_date: isISODate(item.connection_date) ? item.connection_date : todayISO(),
        expiry_date: item.expiry_date,
        status: matchOption(item.status, STATUSES, 'Active'),
        notes: item.notes || '',
      }));

    const skipped = newItems.length - rows.length;
    if (rows.length === 0) return { success: true, count: 0, skipped };

    const { data, error } = await db().from('connections').insert(rows).select();
    if (error) throw error;
    return { success: true, count: data?.length || 0, skipped };
  } catch (err) {
    logError('importConnections', err);
    return { success: false, message: err?.message || 'Import failed', count: 0, skipped: 0 };
  }
}

// ─── App Settings: Providers, Connection Types, Alert Tiers ───────
function defaultSettings() {
  return {
    providers: [...DEFAULT_PROVIDERS],
    connectionTypes: [...DEFAULT_CONNECTION_TYPES],
    alertTiers: DEFAULT_ALERT_TIERS.map((t) => ({ ...t })),
  };
}

export async function getSettings() {
  try {
    const { data, error } = await db().from('app_settings').select('*').eq('id', 1).maybeSingle();
    if (error) throw error;
    if (!data) return defaultSettings();
    return {
      providers: data.providers?.length ? data.providers : [...DEFAULT_PROVIDERS],
      connectionTypes: data.connection_types?.length ? data.connection_types : [...DEFAULT_CONNECTION_TYPES],
      alertTiers: data.alert_tiers?.length ? data.alert_tiers : DEFAULT_ALERT_TIERS.map((t) => ({ ...t })),
    };
  } catch (err) {
    logError('getSettings', err);
    return defaultSettings();
  }
}

export async function getProviders() {
  return (await getSettings()).providers;
}

export async function getConnectionTypes() {
  return (await getSettings()).connectionTypes;
}

export async function getAlertTiers() {
  const tiers = (await getSettings()).alertTiers;
  return [...tiers].sort((a, b) => a.days - b.days);
}

async function addNamedOption(column, name) {
  try {
    const trimmed = (name || '').trim();
    if (!trimmed) return { success: false, message: 'Name is required' };
    const settings = await getSettings();
    const key = column === 'providers' ? 'providers' : 'connectionTypes';
    const list = settings[key];
    if (list.some((v) => v.toLowerCase() === trimmed.toLowerCase())) {
      return { success: false, message: `"${trimmed}" already exists` };
    }
    const updated = [...list, trimmed];
    const { error } = await db().from('app_settings').update({ [column]: updated }).eq('id', 1);
    if (error) throw error;
    return { success: true };
  } catch (err) {
    logError('addNamedOption', err);
    return { success: false, message: err?.message || 'Failed to add' };
  }
}

async function renameNamedOption(column, field, oldValue, newValue) {
  try {
    const trimmed = (newValue || '').trim();
    if (!trimmed) return { success: false, message: 'Name is required' };
    const settings = await getSettings();
    const key = column === 'providers' ? 'providers' : 'connectionTypes';
    const list = settings[key];
    const idx = list.indexOf(oldValue);
    if (idx === -1) return { success: false, message: 'Not found' };
    if (trimmed !== oldValue && list.some((v) => v.toLowerCase() === trimmed.toLowerCase())) {
      return { success: false, message: `"${trimmed}" already exists` };
    }
    const updatedList = [...list];
    updatedList[idx] = trimmed;

    const { error: settingsErr } = await db().from('app_settings').update({ [column]: updatedList }).eq('id', 1);
    if (settingsErr) throw settingsErr;

    const { error: cascadeErr } = await db().from('connections').update({ [field]: trimmed }).eq(field, oldValue);
    if (cascadeErr) throw cascadeErr;

    return { success: true };
  } catch (err) {
    logError('renameNamedOption', err);
    return { success: false, message: err?.message || 'Rename failed' };
  }
}

async function deleteNamedOption(column, field, value) {
  try {
    const settings = await getSettings();
    const key = column === 'providers' ? 'providers' : 'connectionTypes';
    const list = settings[key];
    if (list.length <= 1) return { success: false, message: 'At least one option is required' };

    const { count, error: countErr } = await db().from('connections').select('id', { count: 'exact', head: true }).eq(field, value);
    if (countErr) throw countErr;
    if (count > 0) return { success: false, message: `Cannot remove "${value}" — it's used by existing subscribers` };

    const idx = list.indexOf(value);
    if (idx === -1) return { success: false, message: 'Not found' };
    const updated = list.filter((_, i) => i !== idx);
    const { error } = await db().from('app_settings').update({ [column]: updated }).eq('id', 1);
    if (error) throw error;
    return { success: true };
  } catch (err) {
    logError('deleteNamedOption', err);
    return { success: false, message: err?.message || 'Failed to remove' };
  }
}

export async function addProvider(name) {
  return addNamedOption('providers', name);
}
export async function renameProvider(oldName, newName) {
  return renameNamedOption('providers', 'provider', oldName, newName);
}
export async function deleteProvider(name) {
  return deleteNamedOption('providers', 'provider', name);
}

export async function addConnectionType(name) {
  return addNamedOption('connection_types', name);
}
export async function renameConnectionType(oldName, newName) {
  return renameNamedOption('connection_types', 'connection_type', oldName, newName);
}
export async function deleteConnectionType(name) {
  return deleteNamedOption('connection_types', 'connection_type', name);
}

export async function saveAlertTiers(rawTiers) {
  try {
    const cleaned = (rawTiers || [])
      .map((t) => ({ id: t.id, label: (t.label || '').trim(), days: parseInt(t.days, 10) }))
      .filter((t) => t.label && Number.isFinite(t.days) && t.days > 0)
      .sort((a, b) => a.days - b.days)
      .map((t, i) => ({
        id: t.id || generateId(),
        label: t.label,
        days: t.days,
        color: ALERT_COLOR_CYCLE[i % ALERT_COLOR_CYCLE.length],
      }));

    if (cleaned.length === 0) {
      return { success: false, message: 'Add at least one alert level with a label and a positive number of days' };
    }

    const { error } = await db().from('app_settings').update({ alert_tiers: cleaned }).eq('id', 1);
    if (error) throw error;
    return { success: true };
  } catch (err) {
    logError('saveAlertTiers', err);
    return { success: false, message: err?.message || 'Failed to save alert thresholds' };
  }
}

// ─── Business Profile Operations ───────────────────────────
export function getBusinessProfile() {
  try {
    const raw = localStorage.getItem(LOCAL_BUSINESS_PROFILE_KEY);
    if (raw) return { ...DEFAULT_BUSINESS_PROFILE, ...JSON.parse(raw) };
  } catch {}
  return { ...DEFAULT_BUSINESS_PROFILE };
}

export function saveBusinessProfile(profile) {
  try {
    const updated = { ...getBusinessProfile(), ...(profile || {}) };
    localStorage.setItem(LOCAL_BUSINESS_PROFILE_KEY, JSON.stringify(updated));
    return { success: true, data: updated };
  } catch (err) {
    logError('saveBusinessProfile', err);
    return { success: false, message: err?.message || 'Failed to save business profile' };
  }
}

// ─── Master Plans & Packages Operations ────────────────────
export function getMasterPlans() {
  try {
    const raw = localStorage.getItem(LOCAL_MASTER_PLANS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {}
  return [...DEFAULT_MASTER_PLANS];
}

export function saveMasterPlans(plans) {
  try {
    localStorage.setItem(LOCAL_MASTER_PLANS_KEY, JSON.stringify(plans || []));
    return { success: true };
  } catch (err) {
    logError('saveMasterPlans', err);
    return { success: false, message: err?.message || 'Failed to save plans' };
  }
}

export function addMasterPlan(plan) {
  const plans = getMasterPlans();
  const newPlan = {
    id: plan.id || generateId(),
    name: (plan.name || '').trim(),
    provider: (plan.provider || '').trim(),
    connection_type: (plan.connection_type || 'Broadband').trim(),
    rate: Number(plan.rate) || 500,
  };
  if (!newPlan.name) return { success: false, message: 'Plan name is required' };
  plans.push(newPlan);
  saveMasterPlans(plans);
  return { success: true, data: newPlan };
}

export function deleteMasterPlan(id) {
  const plans = getMasterPlans().filter((p) => p.id !== id);
  saveMasterPlans(plans);
  return { success: true };
}
