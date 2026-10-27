import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeRole,
  canRecordPayments,
  canManageFinancials,
  canViewReports,
  ROLES,
} from './rolePolicy.js';

describe('rolePolicy', () => {
  it('maps legacy staff to receptionist permissions', () => {
    assert.equal(normalizeRole('staff'), ROLES.RECEPTIONIST);
    const user = { tenantId: 't1', role: 'staff', isPlatformAdmin: false };
    assert.equal(canRecordPayments(user), true);
    assert.equal(canManageFinancials(user), false);
  });

  it('doctor cannot record payments or manage financials', () => {
    const user = { tenantId: 't1', role: 'doctor', isPlatformAdmin: false };
    assert.equal(canRecordPayments(user), false);
    assert.equal(canManageFinancials(user), false);
    assert.equal(canViewReports(user), false);
  });

  it('owner can manage financials', () => {
    const user = { tenantId: 't1', role: 'owner', isPlatformAdmin: false };
    assert.equal(canManageFinancials(user), true);
  });
});
