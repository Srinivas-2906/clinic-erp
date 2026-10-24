import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { colors, spacing, typography } from '@clinic-erp/design-tokens';
import { createClinicApiClient } from '@clinic-erp/api-client';

const API_URL = process.env.EXPO_PUBLIC_CLINIC_API || 'http://127.0.0.1:3010';
const TENANT_KEY = 'clinic.tenant';
const TOKEN_KEY = 'clinic.token';

async function getStored(key: string) {
  try {
    return await SecureStore.getItemAsync(key);
  } catch {
    return null;
  }
}

async function setStored(key: string, value: string) {
  await SecureStore.setItemAsync(key, value);
}

async function clearStored(key: string) {
  await SecureStore.deleteItemAsync(key);
}

export default function App() {
  const [token, setToken] = useState<string | null>(null);
  const [tenant, setTenant] = useState('dentacare');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [today, setToday] = useState<{ appointments?: { patientName?: string; service?: string; status?: string }[] } | null>(null);
  const [error, setError] = useState('');

  const client = useMemo(
    () =>
      createClinicApiClient({
        baseUrl: API_URL,
        auth: {
          getToken: () => token,
          getTenantSlug: () => tenant,
          onUnauthorized: () => setToken(null),
        },
      }),
    [token, tenant],
  );

  useEffect(() => {
    (async () => {
      const [t, tok] = await Promise.all([getStored(TENANT_KEY), getStored(TOKEN_KEY)]);
      if (t) setTenant(t);
      if (tok) setToken(tok);
      setLoading(false);
    })();
  }, []);

  useEffect(() => {
    if (!token) return;
    client.today().then(setToday).catch((e) => setError(e.message));
  }, [token, client]);

  async function onLogin() {
    setBusy(true);
    setError('');
    try {
      const { token: tok } = await client.login(email.trim(), password, tenant.trim());
      await setStored(TOKEN_KEY, tok);
      await setStored(TENANT_KEY, tenant.trim());
      setToken(tok);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Login failed');
    } finally {
      setBusy(false);
    }
  }

  async function onLogout() {
    await clearStored(TOKEN_KEY);
    setToken(null);
    setToday(null);
  }

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.brand} />
      </View>
    );
  }

  if (!token) {
    return (
      <SafeAreaView style={styles.screen}>
        <Text style={styles.title}>Clinic ERP</Text>
        <TextInput style={styles.input} placeholder="Workspace (tenant slug)" value={tenant} onChangeText={setTenant} autoCapitalize="none" />
        <TextInput style={styles.input} placeholder="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />
        <TextInput style={styles.input} placeholder="Password" value={password} onChangeText={setPassword} secureTextEntry />
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <TouchableOpacity style={styles.primaryBtn} onPress={onLogin} disabled={busy}>
          <Text style={styles.primaryBtnText}>{busy ? 'Signing in…' : 'Sign in'}</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  const appts = today?.appointments || [];

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Today</Text>
        <TouchableOpacity onPress={onLogout}>
          <Text style={styles.link}>Logout</Text>
        </TouchableOpacity>
      </View>
      <Text style={styles.subtitle}>{tenant} · {email || 'staff'}</Text>
      <FlatList
        data={appts}
        keyExtractor={(_, i) => String(i)}
        ListEmptyComponent={<Text style={styles.muted}>No appointments loaded.</Text>}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{item.patientName || 'Patient'}</Text>
            <Text style={styles.muted}>{item.service || 'Visit'} · {item.status}</Text>
          </View>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background, padding: spacing.lg },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: typography.sizeXl, fontWeight: typography.weightSemibold, color: colors.brandDark },
  subtitle: { color: colors.muted, marginBottom: spacing.md, fontSize: typography.sizeMd },
  input: {
    backgroundColor: colors.surface,
    borderRadius: 10,
    padding: spacing.md,
    marginBottom: spacing.sm,
    fontSize: typography.sizeMd,
  },
  primaryBtn: { backgroundColor: colors.brand, padding: spacing.md, borderRadius: 10, marginTop: spacing.sm },
  primaryBtnText: { color: '#fff', textAlign: 'center', fontWeight: typography.weightSemibold },
  error: { color: colors.danger, marginVertical: spacing.sm },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  link: { color: colors.brand },
  card: {
    backgroundColor: colors.surface,
    padding: spacing.md,
    borderRadius: 10,
    marginBottom: spacing.sm,
  },
  cardTitle: { fontSize: typography.sizeLg, fontWeight: typography.weightMedium },
  muted: { color: colors.muted, fontSize: typography.sizeSm },
});
