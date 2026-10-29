import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import type { ClinicAppointment } from '@clinic-erp/api-client';
import { colors, spacing, typography } from '@clinic-erp/design-tokens';
import { clinicTodayYmd } from './src/clinicTime';
import { useClinicSession } from './src/useClinicSession';
import { LoginScreen } from './src/screens/LoginScreen';
import { TodayScreen } from './src/screens/TodayScreen';
import { ConsultScreen } from './src/screens/ConsultScreen';
import { PatientsScreen } from './src/screens/PatientsScreen';

type Tab = 'today' | 'patients';

export default function App() {
  const session = useClinicSession();
  const [tab, setTab] = useState<Tab>('today');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginBusy, setLoginBusy] = useState(false);
  const [banner, setBanner] = useState<{ text: string; kind: 'ok' | 'err' } | null>(null);
  const [consultAppt, setConsultAppt] = useState<ClinicAppointment | null>(null);
  const [scheduleDate, setScheduleDate] = useState(clinicTodayYmd());

  useEffect(() => {
    if (!session.token) return;
    session.client
      .today()
      .then((t) => setScheduleDate(t.date || clinicTodayYmd()))
      .catch(() => setScheduleDate(clinicTodayYmd()));
  }, [session.token, session.client]);

  function flash(text: string, kind: 'ok' | 'err' = 'ok') {
    setBanner({ text, kind });
    setTimeout(() => setBanner(null), 4000);
  }

  if (session.booting) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.brand} />
      </View>
    );
  }

  if (!session.token) {
    return (
      <SafeAreaView style={styles.safe}>
        <LoginScreen
          tenant={session.tenant}
          onTenantChange={session.setTenant}
          email={email}
          onEmailChange={setEmail}
          password={password}
          onPasswordChange={setPassword}
          error={banner?.kind === 'err' ? banner.text : ''}
          busy={loginBusy}
          onSubmit={async () => {
            setLoginBusy(true);
            try {
              await session.login(email, password, session.tenant);
              flash('Signed in');
            } catch (e) {
              flash(e instanceof Error ? e.message : 'Login failed', 'err');
            } finally {
              setLoginBusy(false);
            }
          }}
        />
      </SafeAreaView>
    );
  }

  if (consultAppt) {
    return (
      <SafeAreaView style={styles.safe}>
        {banner ? (
          <Text style={banner.kind === 'err' ? styles.bannerErr : styles.bannerOk}>{banner.text}</Text>
        ) : null}
        <ConsultScreen
          client={session.client}
          appointment={consultAppt}
          canSignClinical={session.canSignClinical}
          onBack={() => setConsultAppt(null)}
          onDone={() => {
            setConsultAppt(null);
            setTab('today');
          }}
          onError={(msg) => flash(msg, 'err')}
          onMessage={(msg) => flash(msg, 'ok')}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>{tab === 'today' ? 'Today' : 'Patients'}</Text>
        <TouchableOpacity onPress={() => void session.logout()} testID="logout-btn">
          <Text style={styles.link}>Logout</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.tabRow}>
        <TouchableOpacity
          style={[styles.tabBtn, tab === 'today' && styles.tabBtnActive]}
          onPress={() => setTab('today')}
          testID="tab-today"
        >
          <Text style={tab === 'today' ? styles.tabTextActive : styles.muted}>Today</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabBtn, tab === 'patients' && styles.tabBtnActive]}
          onPress={() => setTab('patients')}
          testID="tab-patients"
        >
          <Text style={tab === 'patients' ? styles.tabTextActive : styles.muted}>Patients</Text>
        </TouchableOpacity>
      </View>
      <Text style={styles.subtitle}>
        {session.tenant} · {session.meLabel || email}{session.role ? ` · ${session.role}` : ''}
      </Text>
      {tab === 'today' ? (
        <Text style={styles.dateLine}>Schedule · {scheduleDate}</Text>
      ) : null}
      {banner ? (
        <Text style={banner.kind === 'err' ? styles.bannerErr : styles.bannerOk}>{banner.text}</Text>
      ) : null}
      {tab === 'today' ? (
        <TodayScreen
          client={session.client}
          scheduleDate={scheduleDate}
          canManageAppointments={session.canManageAppointments}
          canSignClinical={session.canSignClinical}
          onConsult={setConsultAppt}
          onError={(msg) => flash(msg, 'err')}
        />
      ) : (
        <PatientsScreen client={session.client} onError={(msg) => flash(msg, 'err')} />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background, padding: spacing.lg },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: typography.sizeXl, fontWeight: typography.weightSemibold, color: colors.brandDark },
  subtitle: { color: colors.muted, marginBottom: spacing.xs, fontSize: typography.sizeMd },
  dateLine: { color: colors.muted, marginBottom: spacing.sm, fontSize: typography.sizeSm },
  tabRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm },
  tabBtn: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 999, backgroundColor: colors.surface },
  tabBtnActive: { backgroundColor: '#e3f0fd' },
  tabTextActive: { color: colors.brand, fontWeight: typography.weightSemibold },
  link: { color: colors.brand },
  muted: { color: colors.muted, fontSize: typography.sizeSm },
  bannerOk: { color: colors.brand, marginBottom: spacing.xs },
  bannerErr: { color: colors.danger, marginBottom: spacing.xs },
});
