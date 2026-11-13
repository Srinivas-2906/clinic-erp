import { describe, expect, it } from 'vitest';
import { chaptersForRole, stepsForChapter } from './filterSteps';
import type { UserCapabilities } from '../types';

const ownerCaps: Required<UserCapabilities> = {
  managePatients: true,
  manageAppointments: true,
  recordPayments: true,
  manageFinancials: true,
  manageSettings: true,
  viewReports: true,
};

const doctorCaps: Required<UserCapabilities> = {
  managePatients: true,
  manageAppointments: true,
  recordPayments: false,
  manageFinancials: false,
  manageSettings: false,
  viewReports: false,
};

describe('filterSteps', () => {
  it('includes owner setup and handoff chapters for owner', () => {
    const chapters = chaptersForRole('owner', ownerCaps);
    expect(chapters.map((c) => c.id)).toContain('owner-clinic-setup');
    expect(chapters.map((c) => c.id)).toContain('clinic-day-handoffs');
  });

  it('hides payments steps for doctor without recordPayments', () => {
    const steps = stepsForChapter('receptionist-front-desk', 'doctor', doctorCaps);
    expect(steps.some((s) => s.id === 'recv-payments-nav')).toBe(false);
  });

  it('keeps today queue steps for doctor', () => {
    const steps = stepsForChapter('doctor-clinical-day', 'doctor', doctorCaps);
    expect(steps.length).toBeGreaterThan(0);
    expect(steps[0]?.id).toBe('doc-today-nav');
  });
});
