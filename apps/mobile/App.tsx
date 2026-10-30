import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import type { ClinicAppointment, PatientInvoice } from '@clinic-erp/api-client';
import { colors, spacing, typography } from '@clinic-erp/design-tokens';
import { clinicTodayYmd } from './src/clinicTime';
import { useClinicSession } from './src/useClinicSession';
import { LoginScreen } from './src/screens/LoginScreen';
import { TodayScreen } from './src/screens/TodayScreen';
import { ConsultScreen } from './src/screens/ConsultScreen';
import { PatientsScreen } from './src/screens/PatientsScreen';
import { BookScreen } from './src/screens/BookScreen';
import { PaymentsScreen } from './src/screens/PaymentsScreen';
import { InvoiceDetailScreen } from './src/screens/InvoiceDetailScreen';
import { CreateInvoiceScreen } from './src/screens/CreateInvoiceScreen';

type Tab = 'today' | 'patients' | 'book' | 'payments';

export default function App() {
  const session = useClinicSession();
  const [tab, setTab] = useState<Tab>('today');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginBusy, setLoginBusy] = useState(false);
  const [banner, setBanner] = useState<{ text: string; kind: 'ok' | 'err' } | null>(null);
  const [consultAppt, setConsultAppt] = useState<ClinicAppointment | null>(null);
  const [bookPatientId, setBookPatientId] = useState<string | null>(null);
  const [invoiceId, setInvoiceId] = useState<string | null>(null);
  const [createInvoiceCtx, setCreateInvoiceCtx] = useState<{
    patientId?: string | null;
    appointmentId?: string | null;
    encounterId?: string | null;
  } | null>(null);
  const [scheduleDate, setScheduleDate] = useState(clinicTodayYmd());
  const [todayKey, setTodayKey] = useState(0);
  const [paymentsKey, setPaymentsKey] = useState(0);

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

  const showBookTab = session.canManageAppointments && session.canManagePatients;
  const showPaymentsTab = session.canRecordPayments;

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
            setTodayKey((k) => k + 1);
          }}
          onError={(msg) => flash(msg, 'err')}
          onMessage={(msg) => flash(msg, 'ok')}
        />
      </SafeAreaView>
    );
  }

  if (invoiceId) {
    return (
      <SafeAreaView style={styles.safe}>
        {banner ? (
          <Text style={banner.kind === 'err' ? styles.bannerErr : styles.bannerOk}>{banner.text}</Text>
        ) : null}
        <InvoiceDetailScreen
          client={session.client}
          invoiceId={invoiceId}
          canManageFinancials={session.canManageFinancials}
          onBack={() => setInvoiceId(null)}
          onError={(msg) => flash(msg, 'err')}
          onMessage={(msg) => flash(msg, 'ok')}
          onUpdated={() => setPaymentsKey((k) => k + 1)}
        />
      </SafeAreaView>
    );
  }

  if (createInvoiceCtx) {
    return (
      <SafeAreaView style={styles.safe}>
        {banner ? (
          <Text style={banner.kind === 'err' ? styles.bannerErr : styles.bannerOk}>{banner.text}</Text>
        ) : null}
        <CreateInvoiceScreen
          client={session.client}
          prefillPatientId={createInvoiceCtx.patientId}
          appointmentId={createInvoiceCtx.appointmentId}
          encounterId={createInvoiceCtx.encounterId}
          onBack={() => setCreateInvoiceCtx(null)}
          onCreated={(id) => {
            setCreateInvoiceCtx(null);
            setInvoiceId(id);
            setTab('payments');
            setPaymentsKey((k) => k + 1);
          }}
          onError={(msg) => flash(msg, 'err')}
          onMessage={(msg) => flash(msg, 'ok')}
        />
      </SafeAreaView>
    );
  }

  const tabTitle =
    tab === 'today' ? 'Today' : tab === 'patients' ? 'Patients' : tab === 'book' ? 'Book' : 'Payments';

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>{tabTitle}</Text>
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
        {showBookTab ? (
          <TouchableOpacity
            style={[styles.tabBtn, tab === 'book' && styles.tabBtnActive]}
            onPress={() => { setBookPatientId(null); setTab('book'); }}
            testID="tab-book"
          >
            <Text style={tab === 'book' ? styles.tabTextActive : styles.muted}>Book</Text>
          </TouchableOpacity>
        ) : null}
        {showPaymentsTab ? (
          <TouchableOpacity
            style={[styles.tabBtn, tab === 'payments' && styles.tabBtnActive]}
            onPress={() => setTab('payments')}
            testID="tab-payments"
          >
            <Text style={tab === 'payments' ? styles.tabTextActive : styles.muted}>Payments</Text>
          </TouchableOpacity>
        ) : null}
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
          key={todayKey}
          client={session.client}
          scheduleDate={scheduleDate}
          canManageAppointments={session.canManageAppointments}
          canSignClinical={session.canSignClinical}
          onConsult={setConsultAppt}
          onError={(msg) => flash(msg, 'err')}
        />
      ) : tab === 'patients' ? (
        <PatientsScreen
          client={session.client}
          canManageAppointments={session.canManageAppointments}
          canRecordPayments={session.canRecordPayments}
          onBookForPatient={(id) => { setBookPatientId(id); setTab('book'); }}
          onCreateInvoice={(patientId) => setCreateInvoiceCtx({ patientId })}
          onError={(msg) => flash(msg, 'err')}
          onMessage={(msg) => flash(msg, 'ok')}
        />
      ) : tab === 'book' && showBookTab ? (
        <BookScreen
          client={session.client}
          prefillPatientId={bookPatientId}
          onDone={() => {
            setBookPatientId(null);
            setTab('today');
            setTodayKey((k) => k + 1);
          }}
          onError={(msg) => flash(msg, 'err')}
          onMessage={(msg) => flash(msg, 'ok')}
        />
      ) : tab === 'payments' && showPaymentsTab ? (
        <PaymentsScreen
          key={paymentsKey}
          client={session.client}
          onOpenInvoice={(inv: PatientInvoice) => setInvoiceId(inv.id)}
          onCreateInvoice={() => setCreateInvoiceCtx({})}
          onError={(msg) => flash(msg, 'err')}
        />
      ) : null}
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
  tabRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.sm },
  tabBtn: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 999, backgroundColor: colors.surface },
  tabBtnActive: { backgroundColor: '#e3f0fd' },
  tabTextActive: { color: colors.brand, fontWeight: typography.weightSemibold },
  link: { color: colors.brand },
  muted: { color: colors.muted, fontSize: typography.sizeSm },
  bannerOk: { color: colors.brand, marginBottom: spacing.xs },
  bannerErr: { color: colors.danger, marginBottom: spacing.xs },
});
