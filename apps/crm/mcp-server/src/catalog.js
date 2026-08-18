/**
 * Clinic Desk — screen inventory and feature catalog for Playwright MCP.
 */

export const E2E_CREDENTIALS = {
  email: process.env.CLINIC_E2E_EMAIL || 'e2e-owner@dentacare.in',
  password: process.env.CLINIC_E2E_PASSWORD || 'E2eTest@2026',
  tenant: process.env.CLINIC_TENANT || 'dentacare',
};

export const FEATURES = {
  auth: {
    summary: 'JWT login, access requests, password setup invites',
    capabilities: [
      'Email/password login per tenant',
      'Staff access request from login screen',
      'Owner approves team in Team tab',
      'Set-password link for new staff',
    ],
  },
  today: {
    summary: 'Daily appointment workflow board',
    capabilities: [
      'Kanban columns: Not confirmed → Confirmed → Arrived → Completed',
      'List and board views',
      'Confirm / Arrived / Complete actions',
      'Call and WhatsApp shortcuts',
      'Complete visit with optional payment',
    ],
  },
  patients: {
    summary: 'Patient directory and records',
    capabilities: [
      'Search by name or phone',
      'Add/edit patient with photo upload',
      'Patient detail: visits, notes, payments',
      'Book follow-up from patient',
    ],
  },
  book: {
    summary: 'Schedule or walk-in booking wizard',
    capabilities: [
      'Patient lookup by phone/name',
      'Register new patient inline',
      'Service catalog picker',
      'Slot picker (morning/evening sessions)',
      'Walk-in mode (books as arrived now)',
    ],
  },
  payments: {
    summary: 'Payment tracking and receipts',
    capabilities: [
      'Today/month totals',
      'Record payment per patient',
      'Share receipt via WhatsApp',
    ],
  },
  reports: {
    summary: 'Date-range operational reports',
    capabilities: [
      'Appointments + payments for date range',
      'CSV export and print',
    ],
  },
  publicBooking: {
    summary: 'Website booking API (no auth)',
    capabilities: [
      'List services and slots',
      'Submit booking → CRM Not confirmed column',
    ],
  },
};

export function buildScreens() {
  const tenant = E2E_CREDENTIALS.tenant;
  const q = `?tenant=${tenant}`;

  return [
    { id: 'login', name: 'Login', path: `/${q}`, authRequired: false, description: 'Sign in + access request' },
    { id: 'home', name: 'Home', path: `/${q}`, authRequired: true, tab: 'overview', description: 'Daily dashboard' },
    { id: 'today', name: 'Today', path: `/${q}`, authRequired: true, tab: 'today', description: 'Appointment board' },
    { id: 'patients', name: 'Patients', path: `/${q}`, authRequired: true, tab: 'patients', description: 'Patient directory' },
    { id: 'book', name: 'Book', path: `/${q}`, authRequired: true, tab: 'book', description: 'New booking wizard' },
    { id: 'payments', name: 'Payments', path: `/${q}`, authRequired: true, tab: 'payments', description: 'Payments list' },
    { id: 'reports', name: 'Reports', path: `/${q}`, authRequired: true, tab: 'reports', description: 'Reports' },
    { id: 'team', name: 'Team', path: `/${q}`, authRequired: true, tab: 'team', description: 'Staff access approvals' },
  ];
}

export function getFullCatalog() {
  return {
    product: 'Clinic Desk (clinic-crm)',
    api: 'clinic-api',
    localDev: {
      crm: 'http://localhost:5185',
      api: 'http://localhost:3010',
    },
    e2eCredentials: E2E_CREDENTIALS,
    features: FEATURES,
    screens: buildScreens(),
    screenshotDir: process.env.CLINIC_SCREENSHOT_DIR || './screenshots',
    testDir: '../e2e/tests',
  };
}
