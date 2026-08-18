import { nanoid } from 'nanoid';
import { getDb } from '../db/index.js';

export function logAudit(tenantId, userId, action, entityType, entityId, detail = {}) {
  getDb().prepare(`
    INSERT INTO audit_log (id, tenant_id, user_id, action, entity_type, entity_id, detail)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(nanoid(12), tenantId, userId || null, action, entityType, entityId || null, JSON.stringify(detail));
}

export function getAuditLog(tenantId, limit = 50) {
  return getDb().prepare(`
    SELECT * FROM audit_log WHERE tenant_id = ? ORDER BY created_at DESC LIMIT ?
  `).all(tenantId, limit).map((r) => ({
    id: r.id,
    action: r.action,
    entityType: r.entity_type,
    entityId: r.entity_id,
    detail: JSON.parse(r.detail || '{}'),
    createdAt: r.created_at,
  }));
}
