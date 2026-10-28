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
import type { MeCapabilities } from '@clinic-erp/contracts';

const API_URL = process.env.EXPO_PUBLIC_CLINIC_API || 'http://127.0.0.1:3010';
const TENANT_KEY = 'clinic.tenant';
const TOKEN_KEY = 'clinic.token';

type Screen = 'today' | 'patients' | 'book';

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
  const [screen, setScreen] = useState<Screen>('today');
  const [today, setToday] = useState<{ appointments?: { id?: string; patientName?: string; service?: string; status?: string; scheduledAt?: string }[] } | null>(null);
  const [patients, setPatients] = useState<{ id: string; name: string; phone?: string }[]>([]);
  const [patientQuery, setPatientQuery] = useState('');
  const [selectedPatient, setSelectedPatient] = useState<{
    patient: { name: string; phone?: string; id?: string };
    appointments: { service?: string; status?: string; scheduledAt?: string }[];
    encounters?: { id?: string; status?: string; finalizedAt?: string | null }[];
  } | null>(null);
  const [error, setError] = useState('');
  const [meLabel, setMeLabel] = useState('');
  const [caps, setCaps] = useState<MeCapabilities>({});
  const [canSignClinical, setCanSignClinical] = useState(false);
  const [bookPatientId, setBookPatientId] = useState('');
  const [bookSlot, setBookSlot] = useState('');
  const [bookSlots, setBookSlots] = useState<string[]>([]);

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
    setError('');
    client.me().then((m) => {
      const role = m.user?.effectiveRole || m.user?.role || '';
      const name = m.user?.name || m.user?.email || '';
      setMeLabel(name ? `${name}${role ? ` · ${role}` : ''}` : role);
      setCaps(m.user?.capabilities || {});
      setCanSignClinical(!!m.user?.canSignClinical);
    }).catch(() => setMeLabel(''));

    if (screen === 'today') {
      client.today().then(setToday).catch((e) => setError(e.message));
    } else if (screen === 'patients') {
      client.patients(patientQuery.trim() || undefined)
        .then((rows) => setPatients(Array.isArray(rows) ? rows as { id: string; name: string; phone?: string }[] : []))
        .catch((e) => setError(e.message));
    } else if (screen === 'book' && caps.manageAppointments) {
      const date = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
      client.appointmentSlots(date)
        .then((s) => setBookSlots(s.slots || []))
        .catch((e) => setError(e.message));
    }
  }, [token, client, screen, patientQuery, caps.manageAppointments]);

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
    setSelectedPatient(null);
  }

  async function openPatient(id: string) {
    const detail = await client.patient(id);
    let encounters: { id?: string; status?: string; finalizedAt?: string | null }[] = [];
    if (canSignClinical) {
      try {
        const enc = await client.listEncounters(id);
        encounters = (enc.encounters || []) as typeof encounters;
      } catch {
        /* optional */
      }
    }
    setSelectedPatient({
      patient: { ...(detail.patient as { name: string; phone?: string; id?: string }), id },
      appointments: detail.appointments as { service?: string; status?: string; scheduledAt?: string }[],
      encounters,
    });
  }

  async function submitBooking() {
    if (!bookPatientId || !bookSlot) {
      setError('Select a patient and time slot');
      return;
    }
    setBusy(true);
    try {
      await client.createAppointment({
        patientId: bookPatientId,
        scheduledAt: bookSlot,
        service: 'Consultation',
        status: 'confirmed',
      });
      setBookPatientId('');
      setBookSlot('');
      setScreen('today');
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Booking failed');
    } finally {
      setBusy(false);
    }
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
  const showBook = !!caps.manageAppointments;

  if (selectedPatient) {
    const p = selectedPatient.patient;
    return (
      <SafeAreaView style={styles.screen}>
        <TouchableOpacity onPress={() => setSelectedPatient(null)}>
          <Text style={styles.link}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>{p.name}</Text>
        <Text style={styles.subtitle}>{p.phone || 'No phone'}</Text>
        {canSignClinical && (
          <Text style={styles.muted}>
            Consultations: {selectedPatient.encounters?.length ?? 0}
            {selectedPatient.encounters?.some((e) => e.status === 'draft') ? ' · draft in progress' : ''}
          </Text>
        )}
        <FlatList
          data={selectedPatient.appointments || []}
          keyExtractor={(_, i) => String(i)}
          ListHeaderComponent={<Text style={styles.sectionHead}>Appointments</Text>}
          ListEmptyComponent={<Text style={styles.muted}>No appointments on file.</Text>}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>{item.service || 'Visit'}</Text>
              <Text style={styles.muted}>{item.status} · {item.scheduledAt ? new Date(item.scheduledAt).toLocaleString() : ''}</Text>
            </View>
          )}
        />
      </SafeAreaView>
    );
  }

  if (screen === 'book' && showBook) {
    return (
      <SafeAreaView style={styles.screen}>
        <View style={styles.headerRow}>
          <Text style={styles.title}>Book appointment</Text>
          <TouchableOpacity onPress={() => setScreen('today')}>
            <Text style={styles.link}>Cancel</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.muted}>Tomorrow — pick patient and slot</Text>
        <FlatList
          data={patients.length ? patients : []}
          keyExtractor={(item) => item.id}
          ListHeaderComponent={(
            <>
              {!patients.length && (
                <Text style={styles.muted}>Load patients from Patients tab first, or search there.</Text>
              )}
              <Text style={styles.sectionHead}>Patient</Text>
            </>
          )}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[styles.card, bookPatientId === item.id && styles.cardSelected]}
              onPress={() => setBookPatientId(item.id)}
            >
              <Text style={styles.cardTitle}>{item.name}</Text>
              <Text style={styles.muted}>{item.phone || '—'}</Text>
            </TouchableOpacity>
          )}
        />
        <Text style={styles.sectionHead}>Available slots</Text>
        <View style={styles.slotRow}>
          {bookSlots.slice(0, 8).map((slot) => (
            <TouchableOpacity
              key={slot}
              style={[styles.slotChip, bookSlot === slot && styles.slotChipActive]}
              onPress={() => setBookSlot(slot)}
            >
              <Text style={bookSlot === slot ? styles.tabTextActive : styles.muted}>
                {new Date(slot).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <TouchableOpacity style={styles.primaryBtn} onPress={() => void submitBooking()} disabled={busy}>
          <Text style={styles.primaryBtnText}>{busy ? 'Booking…' : 'Confirm booking'}</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>{screen === 'today' ? 'Today' : 'Patients'}</Text>
        <TouchableOpacity onPress={onLogout}>
          <Text style={styles.link}>Logout</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.tabRow}>
        <TouchableOpacity style={[styles.tabBtn, screen === 'today' && styles.tabBtnActive]} onPress={() => setScreen('today')}>
          <Text style={screen === 'today' ? styles.tabTextActive : styles.muted}>Today</Text>
        </TouchableOpacity>
        {caps.managePatients !== false && (
          <TouchableOpacity style={[styles.tabBtn, screen === 'patients' && styles.tabBtnActive]} onPress={() => setScreen('patients')}>
            <Text style={screen === 'patients' ? styles.tabTextActive : styles.muted}>Patients</Text>
          </TouchableOpacity>
        )}
        {showBook && (
          <TouchableOpacity
            style={[styles.tabBtn, screen === 'book' && styles.tabBtnActive]}
            onPress={() => {
              setScreen('book');
              client.patients().then((rows) => setPatients(Array.isArray(rows) ? rows as typeof patients : [])).catch(() => {});
            }}
          >
            <Text style={screen === 'book' ? styles.tabTextActive : styles.muted}>Book</Text>
          </TouchableOpacity>
        )}
      </View>
      <Text style={styles.subtitle}>{tenant} · {meLabel || email || 'staff'}</Text>
      {screen === 'patients' && (
        <TextInput
          style={styles.input}
          placeholder="Search patients"
          value={patientQuery}
          onChangeText={setPatientQuery}
          autoCapitalize="none"
        />
      )}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <FlatList
        data={screen === 'today' ? appts : patients}
        keyExtractor={(item, i) => ('id' in item && item.id) ? item.id : String(i)}
        ListEmptyComponent={<Text style={styles.muted}>{screen === 'today' ? 'No appointments loaded.' : 'No patients found.'}</Text>}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.card}
            onPress={() => {
              if (screen === 'patients' && 'id' in item) {
                void openPatient(item.id).catch((e) => setError(e.message));
              }
            }}
          >
            <Text style={styles.cardTitle}>
              {'patientName' in item ? (item.patientName || 'Patient') : item.name}
            </Text>
            <Text style={styles.muted}>
              {'service' in item
                ? `${item.service || 'Visit'} · ${item.status}`
                : (item.phone || '—')}
            </Text>
            {screen === 'today' && 'id' in item && item.id && caps.manageAppointments && item.status === 'confirmed' && (
              <View style={styles.queueActions}>
                <TouchableOpacity
                  style={styles.inlineBtn}
                  onPress={() => {
                    client.updateAppointment(item.id!, { status: 'arrived' })
                      .then(() => client.today().then(setToday))
                      .catch((e) => setError(e.message));
                  }}
                >
                  <Text style={styles.link}>Mark arrived</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.inlineBtn}
                  onPress={() => {
                    client.updateAppointment(item.id!, { status: 'in_progress' })
                      .then(() => client.today().then(setToday))
                      .catch((e) => setError(e.message));
                  }}
                >
                  <Text style={styles.link}>In progress</Text>
                </TouchableOpacity>
              </View>
            )}
          </TouchableOpacity>
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
  sectionHead: { fontWeight: typography.weightSemibold, marginVertical: spacing.sm, color: colors.brandDark },
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
  tabRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm, flexWrap: 'wrap' },
  tabBtn: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 999, backgroundColor: colors.surface },
  tabBtnActive: { backgroundColor: '#e3f0fd' },
  tabTextActive: { color: colors.brand, fontWeight: typography.weightSemibold },
  link: { color: colors.brand },
  card: {
    backgroundColor: colors.surface,
    padding: spacing.md,
    borderRadius: 10,
    marginBottom: spacing.sm,
  },
  cardSelected: { borderWidth: 1, borderColor: colors.brand },
  cardTitle: { fontSize: typography.sizeLg, fontWeight: typography.weightMedium },
  muted: { color: colors.muted, fontSize: typography.sizeSm },
  inlineBtn: { marginTop: 8, marginRight: 16 },
  queueActions: { flexDirection: 'row', flexWrap: 'wrap' },
  slotRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: spacing.md },
  slotChip: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8, backgroundColor: colors.surface },
  slotChipActive: { backgroundColor: '#e3f0fd' },
});
