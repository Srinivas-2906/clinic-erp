/** Server-authoritative plan definitions and limits. */

export const PLAN_IDS = {
  ESSENTIAL: 'essential',
  PROFESSIONAL: 'professional',
  ENTERPRISE: 'enterprise',
};

/** Legacy tenant.plan values map to commercial tiers. */
const LEGACY_PLAN_MAP = {
  growth: PLAN_IDS.PROFESSIONAL,
  starter: PLAN_IDS.ESSENTIAL,
  pro: PLAN_IDS.PROFESSIONAL,
  enterprise: PLAN_IDS.ENTERPRISE,
};

export const PLAN_DEFINITIONS = {
  [PLAN_IDS.ESSENTIAL]: {
    id: PLAN_IDS.ESSENTIAL,
    label: 'Essential',
    maxDoctors: 1,
    maxStaff: 2,
    features: { auditExport: false, multiBranch: false },
  },
  [PLAN_IDS.PROFESSIONAL]: {
    id: PLAN_IDS.PROFESSIONAL,
    label: 'Professional',
    maxDoctors: 10,
    maxStaff: 15,
    features: { auditExport: true, multiBranch: false },
  },
  [PLAN_IDS.ENTERPRISE]: {
    id: PLAN_IDS.ENTERPRISE,
    label: 'Enterprise',
    maxDoctors: null,
    maxStaff: null,
    features: { auditExport: true, multiBranch: true },
  },
};

export function normalizePlanId(rawPlan) {
  const key = String(rawPlan || PLAN_IDS.PROFESSIONAL).toLowerCase();
  if (PLAN_DEFINITIONS[key]) return key;
  return LEGACY_PLAN_MAP[key] || PLAN_IDS.PROFESSIONAL;
}

export function getPlanDefinition(planId) {
  const id = normalizePlanId(planId);
  return PLAN_DEFINITIONS[id];
}
