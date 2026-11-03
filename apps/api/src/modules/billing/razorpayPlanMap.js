import { normalizePlanId, PLAN_DEFINITIONS } from '../identity/plans.js';

/** Razorpay plan_id per Clinic ERP plan — set in dashboard test mode. */
export function getRazorpayPlanIdForClinicPlan(planId) {
  const id = normalizePlanId(planId);
  const envKey = `CLINIC_RAZORPAY_PLAN_${id.toUpperCase()}`;
  const mapped = process.env[envKey]?.trim();
  if (mapped) return mapped;
  if (process.env.CLINIC_RAZORPAY_MOCK === '1' || process.env.NODE_ENV === 'test') {
    return `plan_mock_${id}`;
  }
  return null;
}

export function assertRazorpayPlanConfigured(planId) {
  const rpPlan = getRazorpayPlanIdForClinicPlan(planId);
  if (!rpPlan) {
    const err = new Error(`Razorpay plan not configured for ${planId} (set CLINIC_RAZORPAY_PLAN_${normalizePlanId(planId).toUpperCase()})`);
    err.status = 501;
    err.code = 'RAZORPAY_PLAN_NOT_CONFIGURED';
    throw err;
  }
  if (!PLAN_DEFINITIONS[normalizePlanId(planId)]) {
    const err = new Error('Invalid clinic plan');
    err.status = 400;
    throw err;
  }
  return rpPlan;
}
