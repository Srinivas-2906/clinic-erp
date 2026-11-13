import { describe, expect, it, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ClinicGuideProvider } from './ClinicGuideContext';
import { ClinicGuideWelcome } from '../components/ClinicGuideWelcome';
import type { UserCapabilities } from '../types';

const caps: Required<UserCapabilities> = {
  managePatients: true,
  manageAppointments: true,
  recordPayments: true,
  manageFinancials: true,
  manageSettings: true,
  viewReports: true,
};

function shell() {
  return (
    <ClinicGuideProvider
      tenantSlug="dentacare"
      userId="test-user"
      userRole="owner"
      userCaps={caps}
      tab="overview"
      onTabChange={() => {}}
    >
      <ClinicGuideWelcome userRole="owner" userCaps={caps} />
    </ClinicGuideProvider>
  );
}

describe('ClinicGuideWelcome', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('shows first-login choices', () => {
    render(shell());
    expect(screen.getByTestId('clinic-guide-welcome')).toBeInTheDocument();
    expect(screen.getByTestId('guide-start-journey')).toBeInTheDocument();
    expect(screen.getByTestId('guide-explore-own')).toBeInTheDocument();
  });

  it('dismisses welcome on explore own', () => {
    render(shell());
    fireEvent.click(screen.getByTestId('guide-explore-own'));
    expect(screen.queryByTestId('clinic-guide-welcome')).not.toBeInTheDocument();
  });
});
