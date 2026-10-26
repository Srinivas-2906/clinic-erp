import { getDb } from '../../db/index.js';
import { getPlanDefinition, normalizePlanId } from './plans.js';
import {
  canWriteTenantSubscription,
  normalizeSubscriptionStatus,
} from './subscription.js';

export function getTenantPlanRow(tenantId) {
  return getDb().prepare('SELECT id, plan, status, subscription_status, trial_ends_at FROM tenants WHERE id = ?').get(tenantId);
}

export function getTenantEntitlements(tenantId) {
  const row = getTenantPlanRow(tenantId);
  if (!row) {
    const err = new Error('Tenant not found');
    err.status = 404;
    throw err;
  }
  const planId = normalizePlanId(row.plan);
  const plan = getPlanDefinition(planId);
  const doctors = countActiveDoctors(tenantId);
  const staff = countStaffUsers(tenantId);
  const subscriptionStatus = normalizeSubscriptionStatus(row.subscription_status);
  return {
    tenantId,
    planId,
    planLabel: plan.label,
    status: row.status,
    subscriptionStatus,
    subscription: {
      status: subscriptionStatus,
      trialEndsAt: row.trial_ends_at || null,
      canWrite: canWriteTenantSubscription(subscriptionStatus),
    },
    limits: {
      maxDoctors: plan.maxDoctors,
      maxStaff: plan.maxStaff,
    },
    usage: {
      doctors,
      staff,
    },
    features: { ...plan.features },
  };
}

export function countActiveDoctors(tenantId) {
  const row = getDb().prepare(
    'SELECT COUNT(*) AS c FROM doctors WHERE tenant_id = ? AND is_active = 1',
  ).get(tenantId);
  return row?.c ?? 0;
}

export function countStaffUsers(tenantId) {
  const row = getDb().prepare(
    `SELECT COUNT(*) AS c FROM users WHERE tenant_id = ? AND role IN ('staff', 'receptionist', 'doctor')`,
  ).get(tenantId);
  return row?.c ?? 0;
}

function limitError(resource, limit) {
  const err = new Error(`Plan limit reached: maximum ${limit} ${resource}. Upgrade your plan to add more.`);
  err.status = 403;
  err.code = 'PLAN_LIMIT';
  return err;
}

export function assertCanAddDoctor(tenantId, additional = 1) {
  const ent = getTenantEntitlements(tenantId);
  const { maxDoctors } = ent.limits;
  if (maxDoctors == null) return ent;
  if (ent.usage.doctors + additional > maxDoctors) {
    throw limitError('active doctors', maxDoctors);
  }
  return ent;
}

export function assertCanAddStaff(tenantId, additional = 1) {
  const ent = getTenantEntitlements(tenantId);
  const { maxStaff } = ent.limits;
  if (maxStaff == null) return ent;
  if (ent.usage.staff + additional > maxStaff) {
    throw limitError('staff members', maxStaff);
  }
  return ent;
}

export function canExportAudit(tenantId) {
  return !!getTenantEntitlements(tenantId).features.auditExport;
}
