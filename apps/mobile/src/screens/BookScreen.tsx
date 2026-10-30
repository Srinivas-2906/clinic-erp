import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import type { ClinicApiClient, ClinicDoctor, ClinicPatient, SlotOption } from '@clinic-erp/api-client';
import { colors, spacing, typography } from '@clinic-erp/design-tokens';
import { clinicTodayYmd } from '../clinicTime';
import { pickSlotOptions, scheduledAtFromDateAndSlot } from '../lib/slots';

type Props = {
  client: ClinicApiClient;
  prefillPatientId?: string | null;
  onDone: () => void;
  onError: (msg: string) => void;
  onMessage: (msg: string) => void;
};

export function BookScreen({ client, prefillPatientId, onDone, onError, onMessage }: Props) {
  const [step, setStep] = useState<'patient' | 'doctor' | 'slot' | 'confirm'>(prefillPatientId ? 'doctor' : 'patient');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ClinicPatient[]>([]);
  const [patient, setPatient] = useState<ClinicPatient | null>(null);
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [doctors, setDoctors] = useState<ClinicDoctor[]>([]);
  const [doctorId, setDoctorId] = useState<string | null>(null);
  const [dateYmd, setDateYmd] = useState(clinicTodayYmd());
  const [slots, setSlots] = useState<SlotOption[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<SlotOption | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (prefillPatientId) {
      client.patient(prefillPatientId).then((d) => {
        const p = d.patient as ClinicPatient;
        setPatient(p);
      }).catch((e) => onError(e instanceof Error ? e.message : 'Patient not found'));
    }
  }, [client, prefillPatientId, onError]);

  useEffect(() => {
    if (step !== 'patient' || query.trim().length < 2) {
      setResults([]);
      return;
    }
    const t = setTimeout(() => {
      client.patients(query.trim())
        .then((rows) => setResults(Array.isArray(rows) ? (rows as ClinicPatient[]) : []))
        .catch(() => setResults([]));
    }, 300);
    return () => clearTimeout(t);
  }, [client, query, step]);

  useEffect(() => {
    if (step !== 'doctor' && step !== 'slot') return;
    setLoading(true);
    client.doctors()
      .then((d) => {
        const active = (d.doctors || []).filter((doc) => doc.isActive !== false);
        setDoctors(active);
        if (active.length === 1) setDoctorId(active[0].id);
      })
      .catch((e) => onError(e instanceof Error ? e.message : 'Could not load doctors'))
      .finally(() => setLoading(false));
  }, [client, step, onError]);

  useEffect(() => {
    if (step !== 'slot' && step !== 'confirm') return;
    if (!doctorId) return;
    setLoading(true);
    setSelectedSlot(null);
    client.appointmentSlots(dateYmd, { doctorId })
      .then((body) => setSlots(pickSlotOptions(body.slots || [], body.slotOptions, doctorId)))
      .catch((e) => onError(e instanceof Error ? e.message : 'Could not load slots'))
      .finally(() => setLoading(false));
  }, [client, dateYmd, doctorId, step, onError]);

  async function registerPatient() {
    if (busy) return;
    setBusy(true);
    try {
      const p = await client.createPatient({
        name: newName.trim(),
        phone: newPhone.trim(),
      });
      setPatient(p);
      setStep('doctor');
      onMessage('Patient registered');
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Registration failed');
    } finally {
      setBusy(false);
    }
  }

  async function confirmBooking() {
    if (!patient || !selectedSlot || busy) return;
    const scheduledAt = scheduledAtFromDateAndSlot(dateYmd, selectedSlot);
    if (!scheduledAt) {
      onError('Invalid slot time');
      return;
    }
    setBusy(true);
    try {
      await client.createAppointment({
        patientId: patient.id,
        scheduledAt,
        service: 'Consultation',
        status: 'confirmed',
        assignedDoctorId: selectedSlot.doctorId || doctorId || undefined,
      });
      onMessage('Appointment booked');
      onDone();
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Booking failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined} testID="book-screen">
      <ScrollView keyboardShouldPersistTaps="handled">
        {step === 'patient' && (
          <>
            <Text style={styles.heading}>Find patient</Text>
            <TextInput
              style={styles.input}
              placeholder="Search name or phone"
              value={query}
              onChangeText={setQuery}
              testID="book-search"
            />
            {results.map((p) => (
              <TouchableOpacity
                key={p.id}
                style={styles.card}
                onPress={() => { setPatient(p); setStep('doctor'); }}
                testID={`book-patient-${p.id}`}
              >
                <Text style={styles.cardTitle}>{p.name}</Text>
                <Text style={styles.muted}>{p.phone}</Text>
              </TouchableOpacity>
            ))}
            <Text style={styles.heading}>New patient</Text>
            <TextInput style={styles.input} placeholder="Name" value={newName} onChangeText={setNewName} testID="book-new-name" />
            <TextInput style={styles.input} placeholder="Phone" value={newPhone} onChangeText={setNewPhone} keyboardType="phone-pad" testID="book-new-phone" />
            <TouchableOpacity style={styles.primaryBtn} onPress={() => void registerPatient()} disabled={busy} testID="book-register">
              <Text style={styles.primaryBtnText}>{busy ? 'Saving…' : 'Register & continue'}</Text>
            </TouchableOpacity>
          </>
        )}

        {step === 'doctor' && patient && (
          <>
            <Text style={styles.heading}>{patient.name}</Text>
            <Text style={styles.muted}>Choose doctor</Text>
            {loading ? <ActivityIndicator color={colors.brand} /> : doctors.map((d) => (
              <TouchableOpacity
                key={d.id}
                style={[styles.card, doctorId === d.id && styles.cardSelected]}
                onPress={() => setDoctorId(d.id)}
                testID={`book-doctor-${d.id}`}
              >
                <Text style={styles.cardTitle}>{d.displayName || d.name}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity
              style={styles.primaryBtn}
              disabled={!doctorId}
              onPress={() => setStep('slot')}
              testID="book-next-slot"
            >
              <Text style={styles.primaryBtnText}>Pick time</Text>
            </TouchableOpacity>
          </>
        )}

        {(step === 'slot' || step === 'confirm') && patient && doctorId && (
          <>
            <Text style={styles.heading}>Date & time</Text>
            <TextInput style={styles.input} value={dateYmd} onChangeText={setDateYmd} testID="book-date" />
            {loading ? <ActivityIndicator color={colors.brand} /> : (
              <View style={styles.slotGrid}>
                {slots.map((opt, i) => {
                  const key = `${opt.label}-${opt.time}-${i}`;
                  const selected = selectedSlot === opt;
                  return (
                    <TouchableOpacity
                      key={key}
                      style={[styles.chip, selected && styles.chipOn]}
                      onPress={() => { setSelectedSlot(opt); setStep('confirm'); }}
                      testID={`book-slot-${i}`}
                    >
                      <Text style={selected ? styles.chipOnText : styles.chipText}>{opt.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
            {step === 'confirm' && selectedSlot ? (
              <TouchableOpacity style={styles.primaryBtn} onPress={() => void confirmBooking()} disabled={busy} testID="book-confirm">
                <Text style={styles.primaryBtnText}>{busy ? 'Booking…' : 'Confirm appointment'}</Text>
              </TouchableOpacity>
            ) : null}
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  heading: { fontSize: typography.sizeLg, fontWeight: typography.weightSemibold, marginVertical: spacing.sm },
  input: { backgroundColor: colors.surface, borderRadius: 10, padding: spacing.md, marginBottom: spacing.sm },
  card: { backgroundColor: colors.surface, padding: spacing.md, borderRadius: 10, marginBottom: spacing.sm },
  cardSelected: { borderWidth: 2, borderColor: colors.brand },
  cardTitle: { fontWeight: typography.weightMedium },
  muted: { color: colors.muted, fontSize: typography.sizeSm },
  primaryBtn: { backgroundColor: colors.brand, padding: spacing.md, borderRadius: 10, marginTop: spacing.md },
  primaryBtnText: { color: '#fff', textAlign: 'center', fontWeight: typography.weightSemibold },
  slotGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8, backgroundColor: colors.surface },
  chipOn: { backgroundColor: colors.brand },
  chipText: { color: colors.brandDark },
  chipOnText: { color: '#fff' },
});
