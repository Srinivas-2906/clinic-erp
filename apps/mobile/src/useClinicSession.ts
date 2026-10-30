import { useCallback, useEffect, useMemo, useState } from 'react';
import type { MeResponse } from '@clinic-erp/contracts';
import {
  createClinicApiClient,
  type ClinicApiClient,
} from '@clinic-erp/api-client';
import { TOKEN_KEY, TENANT_KEY, clearStored, getStored, setStored } from './session';

const API_URL = process.env.EXPO_PUBLIC_CLINIC_API || 'http://127.0.0.1:3010';

export type StaffSession = {
  token: string;
  tenant: string;
  me: MeResponse | null;
  meLabel: string;
  canManageAppointments: boolean;
  canSignClinical: boolean;
  canRecordPayments: boolean;
  role: string;
};

export function useClinicSession() {
  const [token, setToken] = useState<string | null>(null);
  const [tenant, setTenant] = useState('dentacare');
  const [booting, setBooting] = useState(true);
  const [me, setMe] = useState<MeResponse | null>(null);

  const client = useMemo(
    () =>
      createClinicApiClient({
        baseUrl: API_URL,
        auth: {
          getToken: () => token,
          getTenantSlug: () => tenant,
          onUnauthorized: () => {
            setToken(null);
            setMe(null);
            void clearStored(TOKEN_KEY);
          },
        },
      }),
    [token, tenant],
  );

  useEffect(() => {
    (async () => {
      const [t, tok] = await Promise.all([getStored(TENANT_KEY), getStored(TOKEN_KEY)]);
      if (t) setTenant(t);
      if (tok) setToken(tok);
      setBooting(false);
    })();
  }, []);

  const refreshMe = useCallback(async () => {
    if (!token) {
      setMe(null);
      return;
    }
    try {
      const profile = await client.me();
      setMe(profile);
    } catch {
      setMe(null);
    }
  }, [client, token]);

  useEffect(() => {
    void refreshMe();
  }, [refreshMe]);

  async function login(email: string, password: string, tenantSlug: string) {
    const { token: tok } = await client.login(email.trim(), password, tenantSlug.trim());
    await setStored(TOKEN_KEY, tok);
    await setStored(TENANT_KEY, tenantSlug.trim());
    setTenant(tenantSlug.trim());
    setToken(tok);
  }

  async function logout() {
    await clearStored(TOKEN_KEY);
    setToken(null);
    setMe(null);
  }

  const role = me?.user?.effectiveRole || me?.user?.role || '';
  const caps = me?.user?.capabilities;

  return {
    booting,
    token,
    tenant,
    setTenant,
    client,
    me,
    meLabel: me?.user?.name || me?.user?.email || '',
    role,
    canManageAppointments: !!(caps?.manageAppointments ?? (role === 'owner' || role === 'receptionist')),
    canManagePatients: !!(caps?.managePatients ?? (role === 'owner' || role === 'receptionist')),
    canSignClinical: !!me?.user?.canSignClinical,
    canRecordPayments: !!caps?.recordPayments,
    login,
    logout,
    refreshMe,
  };
}

export type { ClinicApiClient };
