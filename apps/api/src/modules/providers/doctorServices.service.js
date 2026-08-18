import { getDb } from '../../db/index.js';
import { assertDoctorBelongsToTenant } from './doctors.service.js';
import { requireManageDoctors } from '../identity/permissions.js';

export function listDoctorServiceIds(doctorId, tenantId) {
  assertDoctorBelongsToTenant(doctorId, tenantId);
  return getDb().prepare(`
    SELECT catalog_item_id FROM doctor_services
    WHERE doctor_id = ? AND tenant_id = ?
  `).all(doctorId, tenantId).map((r) => r.catalog_item_id);
}

/**
 * Replace linked catalog items for a doctor.
 * Empty list means the doctor can perform all services (open policy).
 */
export function replaceDoctorServices(doctorId, tenantId, user, catalogItemIds) {
  requireManageDoctors(user);
  assertDoctorBelongsToTenant(doctorId, tenantId);

  if (!Array.isArray(catalogItemIds)) throw new Error('catalogItemIds array required');

  const db = getDb();
  const replace = db.transaction(() => {
    db.prepare('DELETE FROM doctor_services WHERE doctor_id = ? AND tenant_id = ?').run(doctorId, tenantId);
    const insert = db.prepare(`
      INSERT INTO doctor_services (tenant_id, doctor_id, catalog_item_id) VALUES (?, ?, ?)
    `);
    for (const catalogItemId of catalogItemIds) {
      const item = db.prepare(
        'SELECT id FROM catalog_items WHERE id = ? AND tenant_id = ?',
      ).get(catalogItemId, tenantId);
      if (!item) throw new Error(`Catalog item not found: ${catalogItemId}`);
      insert.run(tenantId, doctorId, catalogItemId);
    }
  });

  replace();
  return listDoctorServiceIds(doctorId, tenantId);
}

/** Doctors who can perform a service. Empty doctor_services rows = all active doctors. */
export function listDoctorsForService(tenantId, catalogItemId) {
  const linked = getDb().prepare(`
    SELECT doctor_id FROM doctor_services
    WHERE tenant_id = ? AND catalog_item_id = ?
  `).all(tenantId, catalogItemId);

  if (linked.length === 0) {
    return getDb().prepare(`
      SELECT id FROM doctors WHERE tenant_id = ? AND is_active = 1 ORDER BY sort_order ASC
    `).all(tenantId).map((r) => r.id);
  }

  return linked.map((r) => r.doctor_id);
}
