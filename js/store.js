/**
 * Data layer for GlobalVision — talks directly to Supabase (no local cache).
 * Every exported function does a live network call; read functions return
 * empty defaults on error (logged to console), write functions return
 * { success, message?, data? } so callers can surface a toast on failure.
 */
import { generateId, hashPin, todayISO, ALERT_COLOR_CYCLE } from './utils.js';
import { getSupabase } from './supabase.js';

const DEFAULT_PROVIDERS = ['Railwire', 'BSNL', 'K-Fone', 'Kerala Vision'];
const DEFAULT_CONNECTION_TYPES = ['Broadband', 'Cable TV'];
const DEFAULT_ALERT_TIERS = [
  { id: 'critical', label: 'Critical', days: 7, color: 'danger' },
  { id: 'medium', label: 'Medium', days: 30, color: 'warning' },
  { id: 'low', label: 'Low', days: 60, color: 'info' },
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

export async function updateConnection(id, updates) {
  try {
    const { data, error } = await db()
      .from('connections')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return { success: true, data };
  } catch (err) {
    logError('updateConnection', err);
    return { success: false, message: err?.message || 'Failed to update subscriber' };
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
export async function importConnections(newItems) {
  try {
    const [defaultProvider, defaultType] = await Promise.all([getProviders(), getConnectionTypes()]).then(([p, t]) => [p[0] || 'Railwire', t[0] || 'Broadband']);

    const rows = newItems
      .filter((item) => item.customer_name && item.expiry_date)
      .map((item) => ({
        customer_name: item.customer_name,
        phone: item.phone || '',
        provider: item.provider || defaultProvider,
        connection_type: item.connection_type || defaultType,
        connection_date: item.connection_date || todayISO(),
        expiry_date: item.expiry_date,
        status: item.status || 'Active',
        notes: item.notes || '',
      }));

    if (rows.length === 0) return { success: true, count: 0 };

    const { data, error } = await db().from('connections').insert(rows).select();
    if (error) throw error;
    return { success: true, count: data?.length || 0 };
  } catch (err) {
    logError('importConnections', err);
    return { success: false, message: err?.message || 'Import failed', count: 0 };
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
