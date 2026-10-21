import { nanoid } from 'nanoid';
import { getDb } from '../db/index.js';

const SENSITIVE_KEYS = new Set(['password', 'passwordHash', 'token', 'secret', 'jwt']);

export function logAudit(tenantId, userId, action, entityType, entityId, detail = {}) {
  getDb().prepare(`
    INSERT INTO audit_log (id, tenant_id, user_id, action, entity_type, entity_id, detail)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(nanoid(12), tenantId, userId || null, action, entityType, entityId || null, JSON.stringify(detail));
}

function redactDetail(detail) {
  if (!detail || typeof detail !== 'object') return detail;
  const out = {};
  for (const [k, v] of Object.entries(detail)) {
    if (SENSITIVE_KEYS.has(k)) {
      out[k] = '[redacted]';
    } else if (v && typeof v === 'object' && !Array.isArray(v)) {
      out[k] = redactDetail(v);
    } else {
      out[k] = v;
    }
  }
  return out;
}

function rowToAuditEntry(row, { includeUserEmail = false } = {}) {
  let detail = {};
  try {
    detail = redactDetail(JSON.parse(row.detail || '{}'));
  } catch {
    detail = {};
  }
  const entry = {
    id: row.id,
    action: row.action,
    entityType: row.entity_type,
    entityId: row.entity_id,
    detail,
    userId: row.user_id || null,
    createdAt: row.created_at,
  };
  if (includeUserEmail && row.user_id) {
    entry.userEmail = row.user_email || null;
    entry.userName = row.user_name || null;
  }
  return entry;
}

export function queryAuditLog(tenantId, {
  limit = 50,
  offset = 0,
  action,
  entityType,
  from,
  to,
} = {}) {
  const safeLimit = Math.min(Math.max(1, Number(limit) || 50), 200);
  const safeOffset = Math.max(0, Number(offset) || 0);
  const clauses = ['a.tenant_id = ?'];
  const params = [tenantId];

  if (action) {
    clauses.push('a.action = ?');
    params.push(String(action));
  }
  if (entityType) {
    clauses.push('a.entity_type = ?');
    params.push(String(entityType));
  }
  if (from) {
    clauses.push('a.created_at >= ?');
    params.push(String(from));
  }
  if (to) {
    clauses.push('a.created_at <= ?');
    params.push(String(to));
  }

  const where = clauses.join(' AND ');
  const rows = getDb().prepare(`
    SELECT a.*, u.email AS user_email, u.name AS user_name
    FROM audit_log a
    LEFT JOIN users u ON u.id = a.user_id
    WHERE ${where}
    ORDER BY a.created_at DESC
    LIMIT ? OFFSET ?
  `).all(...params, safeLimit, safeOffset);

  const totalRow = getDb().prepare(`
    SELECT COUNT(*) AS c FROM audit_log a WHERE ${where}
  `).get(...params);

  return {
    items: rows.map((r) => rowToAuditEntry(r, { includeUserEmail: true })),
    total: totalRow?.c ?? 0,
    limit: safeLimit,
    offset: safeOffset,
  };
}

export function formatAuditCsv(tenantId, options = {}) {
  const exportLimit = Math.min(Number(options.limit) || 1000, 1000);
  const { items } = queryAuditLog(tenantId, { ...options, limit: exportLimit, offset: 0 });
  const header = ['createdAt', 'action', 'entityType', 'entityId', 'userEmail', 'detail'];
  const lines = [header.join(',')];
  for (const row of items) {
    const cols = [
      row.createdAt,
      row.action,
      row.entityType || '',
      row.entityId || '',
      row.userEmail || '',
      JSON.stringify(row.detail).replace(/"/g, '""'),
    ];
    lines.push(cols.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','));
  }
  return lines.join('\n');
}

/** @deprecated use queryAuditLog */
export function getAuditLog(tenantId, limit = 50) {
  return queryAuditLog(tenantId, { limit }).items;
}
