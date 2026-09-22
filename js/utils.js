// ─── Date Helpers ──────────────────────────────────────────
export function daysUntil(dateStr) {
  if (!dateStr) return Infinity;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr);
  target.setHours(0, 0, 0, 0);
  return Math.ceil((target - today) / (1000 * 60 * 60 * 24));
}

export function formatDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export function formatDateRelative(dateStr) {
  const days = daysUntil(dateStr);
  if (days < 0) return `${Math.abs(days)} days ago`;
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  if (days <= 7) return `In ${days} days`;
  if (days <= 30) return `In ${days} days`;
  return formatDate(dateStr);
}

export function todayISO() {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function currentMonthISO() {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

export function formatMonthYear(isoMonth) {
  if (!isoMonth) return '—';
  const parts = isoMonth.split('-');
  if (parts.length < 2) return isoMonth;
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1;
  const d = new Date(year, month, 1);
  return d.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
}

export function formatMonthShort(isoMonth) {
  if (!isoMonth) return '—';
  const parts = isoMonth.split('-');
  if (parts.length < 2) return isoMonth;
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1;
  const d = new Date(year, month, 1);
  return d.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
}

export function shiftMonth(isoMonth, delta) {
  const current = isoMonth || currentMonthISO();
  const parts = current.split('-');
  let year = parseInt(parts[0], 10);
  let month = parseInt(parts[1], 10) - 1 + delta;
  const d = new Date(year, month, 1);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

export function formatCurrency(amount) {
  const num = Number(amount) || 0;
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(num);
}

// ─── PIN Hashing ───────────────────────────────────────────
export async function hashPin(pin) {
  const encoder = new TextEncoder();
  const data = encoder.encode(pin + '_globalvision_salt');
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// ─── UUID Generator ────────────────────────────────────────
export function generateId() {
  return crypto.randomUUID();
}

// ─── Status Helpers ────────────────────────────────────────
export const STATUSES = [
  'Active',
  'Pending Disconnection',
  'Disconnected',
  'Expired',
  'Renewed',
];

export const STATUS_COLORS = {
  Active: { bg: 'rgba(16, 185, 129, 0.15)', text: '#10b981', glow: 'rgba(16, 185, 129, 0.4)' },
  'Pending Disconnection': { bg: 'rgba(245, 158, 11, 0.15)', text: '#f59e0b', glow: 'rgba(245, 158, 11, 0.4)' },
  Disconnected: { bg: 'rgba(239, 68, 68, 0.15)', text: '#ef4444', glow: 'rgba(239, 68, 68, 0.4)' },
  Expired: { bg: 'rgba(100, 116, 139, 0.15)', text: '#94a3b8', glow: 'rgba(100, 116, 139, 0.4)' },
  Renewed: { bg: 'rgba(6, 182, 212, 0.15)', text: '#06b6d4', glow: 'rgba(6, 182, 212, 0.4)' },
};

// Providers and connection types are now user-managed (see store.js
// getProviders/getConnectionTypes) rather than fixed here.

// ─── Alert Tiers (Critical / Medium / Low / …) ─────────────
// Tiers are user-configurable (see store.js getAlertTiers). Each tier is
// { id, label, days, color } where color cycles through this palette in
// ascending day order, so the most urgent tier is always red.
export const ALERT_COLOR_CYCLE = ['danger', 'warning', 'info', 'accent'];

const ALERT_COLOR_VARS = {
  danger: { bg: 'var(--danger-bg)', border: 'var(--danger-border)', color: 'var(--danger)' },
  warning: { bg: 'var(--warning-bg)', border: 'var(--warning-border)', color: 'var(--warning)' },
  info: { bg: 'var(--info-bg)', border: 'var(--info-border)', color: 'var(--info)' },
  accent: { bg: 'var(--accent-subtle)', border: 'var(--accent-border)', color: 'var(--accent)' },
};

export function getTierColorVars(colorName) {
  return ALERT_COLOR_VARS[colorName] || ALERT_COLOR_VARS.info;
}

// tiers must be pre-sorted ascending by `days`.
export function findTier(days, tiers) {
  if (days < 0) return null;
  return tiers.find((t) => days <= t.days) || null;
}

export function daysBadgeInfo(days, tiers) {
  if (days < 0) {
    const c = getTierColorVars('danger');
    return { label: `${Math.abs(days)}d OVERDUE`, ...c };
  }
  const tier = findTier(days, tiers);
  if (!tier) {
    return { label: `${days}d`, bg: 'transparent', border: 'transparent', color: 'var(--text-dim)' };
  }
  let label = `${days}d left`;
  if (days === 0) label = 'TODAY';
  else if (days === 1) label = 'TOMORROW';
  return { label, ...getTierColorVars(tier.color) };
}

// ─── HTML Escaping (user-editable free text rendered into templates) ──
export function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[ch]));
}

// ─── Add Months to Date Helper ─────────────────────────────
export function addMonths(dateStr, count = 1) {
  const base = dateStr ? new Date(dateStr) : new Date();
  if (isNaN(base.getTime())) return todayISO();
  const day = base.getDate();
  base.setMonth(base.getMonth() + count);
  // If month overflowed (e.g. 31st to 28th), clamp to last day of intended month
  if (base.getDate() !== day) {
    base.setDate(0);
  }
  const y = base.getFullYear();
  const m = String(base.getMonth() + 1).padStart(2, '0');
  const d = String(base.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function shiftDays(dateStr, days = 0) {
  const base = dateStr ? new Date(dateStr) : new Date();
  if (isNaN(base.getTime())) return todayISO();
  base.setDate(base.getDate() + days);
  const y = base.getFullYear();
  const m = String(base.getMonth() + 1).padStart(2, '0');
  const d = String(base.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// ─── Icons (SVG) ───────────────────────────────────────────
export const ICONS = {
  dashboard: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>`,
  connections: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>`,
  settings: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`,
  logout: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>`,
  plus: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`,
  search: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>`,
  alert: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
  wifi: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.55a11 11 0 0 1 14.08 0"/><path d="M1.42 9a16 16 0 0 1 21.16 0"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><line x1="12" y1="20" x2="12.01" y2="20"/></svg>`,
  tv: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="15" rx="2" ry="2"/><polyline points="17 2 12 7 7 2"/></svg>`,
  edit: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`,
  trash: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>`,
  close: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
  calendar: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`,
  phone: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>`,
  check: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`,
  clock: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`,
  user: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`,
  lock: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`,
  filter: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>`,
  eye: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`,
  eyeOff: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`,
  whatsapp: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>`,
  database: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg>`,
  download: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`,
  upload: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>`,
  copy: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`,
  users: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
  receipt: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1-2-1z"/><line x1="8" y1="6" x2="16" y2="6"/><line x1="8" y1="10" x2="16" y2="10"/><line x1="8" y1="14" x2="12" y2="14"/></svg>`,
  creditCard: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>`,
  cash: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2"/><path d="M6 12h.01M18 12h.01"/></svg>`,
  history: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>`,
  checkCircle: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`,
  clockPending: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 15 15"/></svg>`,
  printer: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>`,
  sun: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>`,
  moon: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`,
  briefcase: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>`,
  tag: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>`,
  layers: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>`,
  chevronRight: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>`,
  chevronDown: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>`,
  zap: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>`,
  building: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="2" width="16" height="20" rx="2" ry="2"/><line x1="9" y1="22" x2="9" y2="2"/><line x1="9" y1="6" x2="15" y2="6"/><line x1="9" y1="10" x2="15" y2="10"/><line x1="9" y1="14" x2="15" y2="14"/><line x1="9" y1="18" x2="15" y2="18"/></svg>`,
};

// ─── Receipt & Message Formatters ──────────────────────────
export function generateReceiptSlipHTML(payment, connection, business = {}) {
  const bName = escapeHtml(business.name || 'GlobalVision Broadband & Cable TV');
  const bPhone = escapeHtml(business.phone || '');
  const bAddr = escapeHtml(business.address || '');
  const bUpi = escapeHtml(business.upiId || '');
  const receiptNo = (payment.reference_id || `GV-${(payment.id || '').substring(0, 8)}`).toUpperCase();
  const cName = escapeHtml(payment.customer_name || connection?.customer_name || 'Subscriber');
  const cPhone = escapeHtml(payment.phone || connection?.phone || '—');
  const prov = escapeHtml(payment.provider || connection?.provider || '—');
  const svc = escapeHtml(payment.connection_type || connection?.connection_type || '—');
  const month = formatMonthYear(payment.billing_month);
  const amt = formatCurrency(payment.amount);
  const paidDate = formatDate(payment.payment_date || todayISO());
  const mode = escapeHtml(payment.payment_method || 'Cash');
  const notes = escapeHtml(payment.notes || '');

  return `
    <div class="gv-receipt-slip">
      <div class="gv-receipt-header">
        <div class="gv-receipt-brand">${bName}</div>
        ${bAddr ? `<div class="gv-receipt-sub">${bAddr}</div>` : ''}
        ${bPhone ? `<div class="gv-receipt-sub">Ph: ${bPhone}</div>` : ''}
        <div class="gv-receipt-title">PAYMENT RECEIPT</div>
      </div>
      <div class="gv-receipt-divider"></div>
      <div class="gv-receipt-row">
        <span>Receipt No:</span>
        <strong class="mono">${receiptNo}</strong>
      </div>
      <div class="gv-receipt-row">
        <span>Date:</span>
        <span>${paidDate}</span>
      </div>
      <div class="gv-receipt-divider"></div>
      <div class="gv-receipt-row">
        <span>Subscriber:</span>
        <strong>${cName}</strong>
      </div>
      <div class="gv-receipt-row">
        <span>Phone:</span>
        <span>${cPhone}</span>
      </div>
      <div class="gv-receipt-row">
        <span>Service:</span>
        <span>${prov} (${svc})</span>
      </div>
      <div class="gv-receipt-row">
        <span>Billing Month:</span>
        <strong>${month}</strong>
      </div>
      <div class="gv-receipt-row">
        <span>Payment Mode:</span>
        <span>${mode}</span>
      </div>
      ${notes ? `<div class="gv-receipt-row"><span>Remarks:</span><span>${notes}</span></div>` : ''}
      <div class="gv-receipt-divider"></div>
      <div class="gv-receipt-row gv-receipt-total">
        <span>AMOUNT PAID:</span>
        <span>${amt}</span>
      </div>
      <div class="gv-receipt-divider"></div>
      <div class="gv-receipt-footer">
        <div class="gv-receipt-status-stamp">✓ RECEIVED &amp; CLEARED</div>
        ${bUpi ? `<div class="gv-receipt-upi">UPI: ${bUpi}</div>` : ''}
        <div class="gv-receipt-note">Thank you for your payment!</div>
      </div>
    </div>
  `;
}

export function generateWhatsAppReceiptText(payment, connection, business = {}) {
  const bName = business.name || 'GlobalVision';
  const cName = payment.customer_name || connection?.customer_name || 'Subscriber';
  const month = formatMonthYear(payment.billing_month);
  const amt = formatCurrency(payment.amount);
  const paidDate = formatDate(payment.payment_date || todayISO());
  const mode = payment.payment_method || 'Cash';
  const ref = payment.reference_id ? `\n*Ref/Txn:* ${payment.reference_id}` : '';
  const prov = payment.provider || connection?.provider || '';
  const bPhone = business.phone ? `\n*Helpline:* ${business.phone}` : '';

  return `*${bName} - Payment Receipt*\n\n` +
    `Dear *${cName}*,\n` +
    `Thank you! We have received your payment for *${month}*.\n\n` +
    `*Service:* ${prov}\n` +
    `*Amount Paid:* ${amt}\n` +
    `*Payment Mode:* ${mode}\n` +
    `*Date:* ${paidDate}${ref}\n` +
    `*Status:* Confirmed & Cleared\n` +
    `${bPhone}\n\n` +
    `_Thank you for choosing ${bName}!_`;
}

export function generateWhatsAppReminderText(connection, overdueSummary, business = {}) {
  const bName = business.name || 'GlobalVision';
  const cName = connection.customer_name || 'Subscriber';
  const prov = connection.provider || '';
  const duesCount = overdueSummary?.unpaidDuesCount || 1;
  const totalAmt = formatCurrency(overdueSummary?.totalOverdue || 500);
  const monthsStr = (overdueSummary?.unpaidMonths || []).map(m => m.label).join(', ');
  const upiId = business.upiId ? `\n*Pay via UPI:* \`${business.upiId}\`` : '';
  const bPhone = business.phone ? `\n*Support:* ${business.phone}` : '';

  return `*Reminder: Bill Payment Due - ${bName}*\n\n` +
    `Dear *${cName}*,\n` +
    `This is a gentle reminder regarding your *${prov}* connection.\n\n` +
    `*Outstanding Dues:* ${duesCount} Month(s) (${monthsStr})\n` +
    `*Total Due:* ${totalAmt}\n` +
    `${upiId}${bPhone}\n\n` +
    `Kindly clear the pending dues to ensure uninterrupted service.\n` +
    `_If already paid, please ignore this message._`;
}

// ─── Export / Import Helpers ───────────────────────────────
export function downloadFile(content, filename, contentType) {
  const blob = new Blob([content], { type: contentType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function exportConnectionsCSV(connections) {
  const headers = ['Customer Name', 'Phone', 'Provider', 'Connection Type', 'Connection Date', 'Expiry Date', 'Status', 'Notes'];
  const rows = connections.map(c => [
    `"${(c.customer_name || '').replace(/"/g, '""')}"`,
    `"${(c.phone || '').replace(/"/g, '""')}"`,
    `"${(c.provider || '').replace(/"/g, '""')}"`,
    `"${(c.connection_type || '').replace(/"/g, '""')}"`,
    `"${c.connection_date || ''}"`,
    `"${c.expiry_date || ''}"`,
    `"${(c.status || '').replace(/"/g, '""')}"`,
    `"${(c.notes || '').replace(/"/g, '""')}"`,
  ]);
  const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  downloadFile(csvContent, `globalvision_connections_${todayISO()}.csv`, 'text/csv;charset=utf-8;');
}

export function exportMonthlyBillingCSV(records, billingMonth) {
  const headers = ['Customer Name', 'Phone', 'Provider', 'Connection Type', 'Billing Month', 'Status', 'Bill Amount', 'Amount Paid', 'Payment Date', 'Payment Method', 'Reference ID', 'Notes'];
  const rows = records.map(r => [
    `"${(r.customer_name || '').replace(/"/g, '""')}"`,
    `"${(r.phone || '').replace(/"/g, '""')}"`,
    `"${(r.provider || '').replace(/"/g, '""')}"`,
    `"${(r.connection_type || '').replace(/"/g, '""')}"`,
    `"${billingMonth}"`,
    `"${r.isPaid ? 'Paid' : 'Yet to Pay'}"`,
    r.amount || 0,
    r.isPaid ? (r.amount_paid || r.amount || 0) : 0,
    `"${r.payment_date || ''}"`,
    `"${(r.payment_method || '').replace(/"/g, '""')}"`,
    `"${(r.reference_id || '').replace(/"/g, '""')}"`,
    `"${(r.notes || '').replace(/"/g, '""')}"`,
  ]);
  const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  downloadFile(csvContent, `globalvision_billing_${billingMonth}.csv`, 'text/csv;charset=utf-8;');
}

export function exportOverdueLedgerCSV(records) {
  const headers = ['Customer Name', 'Phone', 'Provider', 'Connection Type', 'Normal Monthly Bill', 'Unpaid Dues Count', 'Unpaid Months', 'Total Overdue Amount', 'Severity', 'Last Payment'];
  const rows = records.map(r => [
    `"${(r.customer_name || '').replace(/"/g, '""')}"`,
    `"${(r.phone || '').replace(/"/g, '""')}"`,
    `"${(r.provider || '').replace(/"/g, '""')}"`,
    `"${(r.connection_type || '').replace(/"/g, '""')}"`,
    r.normalBill || 0,
    r.unpaidDuesCount || 0,
    `"${(r.unpaidMonths || []).map(m => m.label).join('; ')}"`,
    r.totalOverdue || 0,
    `"${r.duesSeverity || ''}"`,
    `"${r.lastPayment ? `${r.lastPayment.payment_date} (${r.lastPayment.amount})` : 'None'}"`,
  ]);
  const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  downloadFile(csvContent, `globalvision_overdue_ledger_${todayISO()}.csv`, 'text/csv;charset=utf-8;');
}

// ─── Toast Notifications ───────────────────────────────────
let toastTimeout = null;
export function showToast(message, type = 'success') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `
    <span class="toast-icon">${type === 'success' ? ICONS.check : type === 'error' ? ICONS.close : ICONS.alert}</span>
    <span class="toast-message">${escapeHtml(message)}</span>
  `;

  container.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('toast-show'));

  setTimeout(() => {
    toast.classList.remove('toast-show');
    toast.classList.add('toast-hide');
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// ─── Debounce ──────────────────────────────────────────────
export function debounce(fn, ms = 300) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

// ─── Animate Counter ───────────────────────────────────────
export function animateCounter(element, target, duration = 600) {
  const start = parseInt(element.textContent) || 0;
  const range = target - start;
  if (range === 0) { element.textContent = target; return; }
  
  const startTime = performance.now();
  function step(currentTime) {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);
    // ease out
    const eased = 1 - Math.pow(1 - progress, 3);
    element.textContent = Math.round(start + range * eased);
    if (progress < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

