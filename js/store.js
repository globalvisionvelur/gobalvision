/**
 * LocalStorage-based data store for GlobalVision.
 * Designed to be easily replaceable with Supabase.
 */
import { generateId, hashPin, todayISO, ALERT_COLOR_CYCLE } from './utils.js';

const STORE_KEY = 'globalvision_store';

const DEFAULT_PROVIDERS = ['Railwire', 'BSNL', 'K-Fone', 'Kerala Vision'];
const DEFAULT_CONNECTION_TYPES = ['Broadband', 'Cable TV'];
const DEFAULT_ALERT_TIERS = [
  { id: 'critical', label: 'Critical', days: 7, color: 'danger' },
  { id: 'medium', label: 'Medium', days: 30, color: 'warning' },
  { id: 'low', label: 'Low', days: 60, color: 'info' },
];

function defaultSettings() {
  return {
    providers: [...DEFAULT_PROVIDERS],
    connectionTypes: [...DEFAULT_CONNECTION_TYPES],
    alertTiers: DEFAULT_ALERT_TIERS.map((t) => ({ ...t })),
  };
}

function getStore() {
  const raw = localStorage.getItem(STORE_KEY);
  if (raw) return JSON.parse(raw);
  return null;
}

function saveStore(store) {
  localStorage.setItem(STORE_KEY, JSON.stringify(store));
}

// ─── Initialize Default Data ──────────────────────────────
export async function initStore() {
  let store = getStore();
  if (!store) {
    const defaultPinHash = await hashPin('2026');
    store = {
      users: [
        {
          id: generateId(),
          name: 'Thanu',
          pin_hash: defaultPinHash,
          created_at: new Date().toISOString(),
        },
      ],
      connections: [],
      settings: defaultSettings(),
    };
    saveStore(store);
    return store;
  }

  // Backfill settings for stores created before this feature existed.
  let changed = false;
  if (!store.settings) {
    store.settings = defaultSettings();
    changed = true;
  } else {
    if (!Array.isArray(store.settings.providers) || store.settings.providers.length === 0) {
      store.settings.providers = [...DEFAULT_PROVIDERS];
      changed = true;
    }
    if (!Array.isArray(store.settings.connectionTypes) || store.settings.connectionTypes.length === 0) {
      store.settings.connectionTypes = [...DEFAULT_CONNECTION_TYPES];
      changed = true;
    }
    if (!Array.isArray(store.settings.alertTiers) || store.settings.alertTiers.length === 0) {
      store.settings.alertTiers = DEFAULT_ALERT_TIERS.map((t) => ({ ...t }));
      changed = true;
    }
  }
  if (changed) saveStore(store);
  return store;
}

// ─── App Settings: Providers, Connection Types, Alert Tiers ───────
export function getSettings() {
  const store = getStore();
  return store?.settings || defaultSettings();
}

export function getProviders() {
  return getSettings().providers;
}

export function getConnectionTypes() {
  return getSettings().connectionTypes;
}

export function getAlertTiers() {
  return [...getSettings().alertTiers].sort((a, b) => a.days - b.days);
}

// Overdue + the most urgent (first) alert tier — used for top-bar / sidebar counts.
export function getUrgentConnections() {
  const tiers = getAlertTiers();
  const criticalDays = tiers.length ? tiers[0].days : 7;
  return [...getOverdueConnections(), ...getAlertConnections(criticalDays)];
}

function addNamedOption(kind, name) {
  const store = getStore();
  if (!store) return { success: false, message: 'Store not ready' };
  const trimmed = (name || '').trim();
  if (!trimmed) return { success: false, message: 'Name is required' };
  const list = store.settings[kind];
  if (list.some((v) => v.toLowerCase() === trimmed.toLowerCase())) {
    return { success: false, message: `"${trimmed}" already exists` };
  }
  list.push(trimmed);
  saveStore(store);
  return { success: true };
}

function renameNamedOption(kind, field, oldValue, newValue) {
  const store = getStore();
  if (!store) return { success: false, message: 'Store not ready' };
  const trimmed = (newValue || '').trim();
  if (!trimmed) return { success: false, message: 'Name is required' };
  const list = store.settings[kind];
  const idx = list.indexOf(oldValue);
  if (idx === -1) return { success: false, message: 'Not found' };
  if (trimmed !== oldValue && list.some((v) => v.toLowerCase() === trimmed.toLowerCase())) {
    return { success: false, message: `"${trimmed}" already exists` };
  }
  list[idx] = trimmed;
  store.connections.forEach((c) => {
    if (c[field] === oldValue) c[field] = trimmed;
  });
  saveStore(store);
  return { success: true };
}

function deleteNamedOption(kind, field, value) {
  const store = getStore();
  if (!store) return { success: false, message: 'Store not ready' };
  const list = store.settings[kind];
  if (list.length <= 1) return { success: false, message: 'At least one option is required' };
  const inUse = store.connections.some((c) => c[field] === value);
  if (inUse) return { success: false, message: `Cannot remove "${value}" — it's used by existing subscribers` };
  const idx = list.indexOf(value);
  if (idx === -1) return { success: false, message: 'Not found' };
  list.splice(idx, 1);
  saveStore(store);
  return { success: true };
}

export function addProvider(name) {
  return addNamedOption('providers', name);
}
export function renameProvider(oldName, newName) {
  return renameNamedOption('providers', 'provider', oldName, newName);
}
export function deleteProvider(name) {
  return deleteNamedOption('providers', 'provider', name);
}

export function addConnectionType(name) {
  return addNamedOption('connectionTypes', name);
}
export function renameConnectionType(oldName, newName) {
  return renameNamedOption('connectionTypes', 'connection_type', oldName, newName);
}
export function deleteConnectionType(name) {
  return deleteNamedOption('connectionTypes', 'connection_type', name);
}

export function saveAlertTiers(rawTiers) {
  const store = getStore();
  if (!store) return { success: false, message: 'Store not ready' };

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

  store.settings.alertTiers = cleaned;
  saveStore(store);
  return { success: true };
}

// ─── User Operations ──────────────────────────────────────
export function getUsers() {
  const store = getStore();
  return store ? store.users : [];
}

export async function verifyPin(userId, pin) {
  const store = getStore();
  if (!store) return false;
  const user = store.users.find((u) => u.id === userId);
  if (!user) return false;
  const pinHash = await hashPin(pin);
  return user.pin_hash === pinHash;
}

export function getUserById(userId) {
  const store = getStore();
  if (!store) return null;
  return store.users.find((u) => u.id === userId) || null;
}

export async function changePin(userId, newPin) {
  const store = getStore();
  if (!store) return false;
  const user = store.users.find((u) => u.id === userId);
  if (!user) return false;
  user.pin_hash = await hashPin(newPin);
  saveStore(store);
  return true;
}

export async function addUser(name, pin) {
  const store = getStore();
  if (!store) return null;
  const newUser = {
    id: generateId(),
    name,
    pin_hash: await hashPin(pin),
    created_at: new Date().toISOString(),
  };
  store.users.push(newUser);
  saveStore(store);
  return newUser;
}

export function updateUserName(userId, newName) {
  const store = getStore();
  if (!store) return false;
  const user = store.users.find((u) => u.id === userId);
  if (!user) return false;
  user.name = newName;
  saveStore(store);
  return true;
}

export function deleteUser(userId) {
  const store = getStore();
  if (!store) return false;
  if (store.users.length <= 1) {
    return { success: false, message: 'Cannot delete the only remaining user.' };
  }
  const idx = store.users.findIndex((u) => u.id === userId);
  if (idx === -1) return { success: false, message: 'User not found' };
  store.users.splice(idx, 1);
  saveStore(store);
  return { success: true };
}


// ─── Connection Operations ─────────────────────────────────
export function getConnections() {
  const store = getStore();
  return store ? store.connections : [];
}

export function getConnectionById(id) {
  const store = getStore();
  if (!store) return null;
  return store.connections.find((c) => c.id === id) || null;
}

export function addConnection(connection) {
  const store = getStore();
  if (!store) return null;
  const newConn = {
    id: generateId(),
    ...connection,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  store.connections.push(newConn);
  saveStore(store);
  return newConn;
}

export function updateConnection(id, updates) {
  const store = getStore();
  if (!store) return false;
  const idx = store.connections.findIndex((c) => c.id === id);
  if (idx === -1) return false;
  store.connections[idx] = {
    ...store.connections[idx],
    ...updates,
    updated_at: new Date().toISOString(),
  };
  saveStore(store);
  return store.connections[idx];
}

export function deleteConnection(id) {
  const store = getStore();
  if (!store) return false;
  const idx = store.connections.findIndex((c) => c.id === id);
  if (idx === -1) return false;
  store.connections.splice(idx, 1);
  saveStore(store);
  return true;
}

// ─── Filtered / Sorted Queries ─────────────────────────────
export function queryConnections({ search, provider, connectionType, status, sortBy = 'expiry_date', sortDir = 'asc' } = {}) {
  let connections = getConnections();

  if (search) {
    const q = search.toLowerCase();
    connections = connections.filter(
      (c) =>
        c.customer_name.toLowerCase().includes(q) ||
        c.phone.toLowerCase().includes(q)
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
export function getAlertConnections(withinDays) {
  const connections = getConnections();
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

export function getOverdueConnections() {
  const connections = getConnections();
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

export function getStatusCounts() {
  const connections = getConnections();
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

// ─── Bulk Import ───────────────────────────────────────────
export function importConnections(newItems) {
  const store = getStore();
  if (!store) return 0;
  let count = 0;
  const defaultProvider = store.settings?.providers?.[0] || 'Railwire';
  const defaultType = store.settings?.connectionTypes?.[0] || 'Broadband';
  for (const item of newItems) {
    if (item.customer_name && item.expiry_date) {
      store.connections.push({
        id: item.id || generateId(),
        customer_name: item.customer_name,
        phone: item.phone || '',
        provider: item.provider || defaultProvider,
        connection_type: item.connection_type || defaultType,
        connection_date: item.connection_date || todayISO(),
        expiry_date: item.expiry_date,
        status: item.status || 'Active',
        notes: item.notes || '',
        created_at: item.created_at || new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
      count++;
    }
  }
  saveStore(store);
  return count;
}

// ─── Supabase Cloud Sync ───────────────────────────────────
import { getSupabase } from './supabase.js';

export async function pullFromSupabase() {
  const sb = getSupabase();
  if (!sb) return { success: false, message: 'Supabase is not configured' };

  try {
    const { data: conns, error: connErr } = await sb.from('connections').select('*');
    if (connErr) throw connErr;

    const store = getStore() || { users: [], connections: [] };
    if (conns && conns.length > 0) {
      store.connections = conns;
      saveStore(store);
    }
    return { success: true, count: conns ? conns.length : 0 };
  } catch (err) {
    return { success: false, message: err.message || 'Failed to sync with Supabase' };
  }
}

export async function pushToSupabase() {
  const sb = getSupabase();
  if (!sb) return { success: false, message: 'Supabase is not configured' };

  try {
    const store = getStore();
    if (!store || store.connections.length === 0) {
      return { success: true, count: 0, message: 'No connections to push' };
    }

    const { error } = await sb.from('connections').upsert(store.connections, { onConflict: 'id' });
    if (error) throw error;

    return { success: true, count: store.connections.length };
  } catch (err) {
    return { success: false, message: err.message || 'Failed to push to Supabase' };
  }
}

