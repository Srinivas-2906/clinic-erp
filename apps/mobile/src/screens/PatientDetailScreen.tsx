import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import type { ClinicApiClient, ClinicAppointment, ClinicPatient } from '@clinic-erp/api-client';
import { colors, spacing, typography } from '@clinic-erp/design-tokens';
import { clinicTodayYmd, formatApptTime } from '../clinicTime';
import { pickSlotOptions, scheduledAtFromDateAndSlot } from '../lib/slots';
import { statusLabel } from '../appointmentUi';

type Props = {
  client: ClinicApiClient;
  patientId: string;
  canManageAppointments: boolean;
  onBack: () => void;
  onBook: () => void;
  onError: (msg: string) => void;
  onMessage: (msg: string) => void;
};

export function PatientDetailScreen({
  client,
  patientId,
  canManageAppointments,
  onBack,
  onBook,
  onError,
  onMessage,
}: Props) {
  const [loading, setLoading] = useState(true);
  const [patient, setPatient] = useState<ClinicPatient | null>(null);
  const [appointments, setAppointments] = useState<ClinicAppointment[]>([]);
  const [rescheduleId, setRescheduleId] = useState<string | null>(null);
  const [rescheduleDate, setRescheduleDate] = useState(clinicTodayYmd());
  const [rescheduleSlots, setRescheduleSlots] = useState<{ label: string; time?: string; doctorId?: string }[]>([]);
  const [busy, setBusy] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const detail = await client.patient(patientId);
      setPatient(detail.patient as ClinicPatient);
      setAppointments((detail.appointments || []) as ClinicAppointment[]);
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Could not load patient');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [patientId]);

  useEffect(() => {
    if (!rescheduleId) return;
    const appt = appointments.find((a) => a.id === rescheduleId);
    if (!appt?.assignedDoctorId) return;
    client.appointmentSlots(rescheduleDate, { doctorId: appt.assignedDoctorId })
      .then((body) => setRescheduleSlots(pickSlotOptions(body.slots || [], body.slotOptions, appt.assignedDoctorId || undefined)))
      .catch((e) => onError(e instanceof Error ? e.message : 'Slots unavailable'));
  }, [rescheduleId, rescheduleDate, appointments, client, onError]);

  async function cancelAppt(id: string) {
    if (busy) return;
    setBusy(true);
    try {
      await client.updateAppointment(id, { status: 'cancelled' });
      onMessage('Appointment cancelled');
      await load();
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Cancel failed');
    } finally {
      setBusy(false);
    }
  }

  async function applyReschedule(appt: ClinicAppointment, slot: { label: string; time?: string; doctorId?: string }) {
    if (busy) return;
    const scheduledAt = scheduledAtFromDateAndSlot(rescheduleDate, slot);
    if (!scheduledAt) {
      onError('Invalid slot');
      return;
    }
    setBusy(true);
    try {
      const patch: { scheduledAt: string; status?: string } = { scheduledAt };
      if (appt.status === 'requested') patch.status = 'confirmed';
      await client.updateAppointment(appt.id, patch);
      onMessage('Appointment rescheduled');
      setRescheduleId(null);
      await load();
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Reschedule failed');
    } finally {
      setBusy(false);
    }
  }

  if (loading || !patient) {
    return <ActivityIndicator color={colors.brand} style={{ marginTop: 24 }} />;
  }

  const rescheduleAppt = rescheduleId ? appointments.find((a) => a.id === rescheduleId) : null;

  return (
    <View style={styles.flex} testID="patient-detail">
      <TouchableOpacity onPress={onBack} testID="patient-back">
        <Text style={styles.link}>← Back</Text>
      </TouchableOpacity>
      <Text style={styles.title}>{patient.name}</Text>
      <Text style={styles.muted}>{patient.phone || 'No phone'}</Text>
      {canManageAppointments ? (
        <TouchableOpacity style={styles.bookBtn} onPress={onBook} testID="patient-book">
          <Text style={styles.bookBtnText}>Book appointment</Text>
        </TouchableOpacity>
      ) : null}

      {rescheduleAppt ? (
        <View style={styles.panel}>
          <Text style={styles.panelTitle}>Reschedule</Text>
          <TextInput style={styles.input} value={rescheduleDate} onChangeText={setRescheduleDate} />
          {rescheduleSlots.map((slot, i) => (
            <TouchableOpacity key={`${slot.label}-${i}`} style={styles.chip} onPress={() => void applyReschedule(rescheduleAppt, slot)}>
              <Text style={styles.chipText}>{slot.label}</Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity onPress={() => setRescheduleId(null)}>
            <Text style={styles.link}>Cancel</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      <FlatList
        data={appointments}
        keyExtractor={(item) => item.id}
        ListEmptyComponent={<Text style={styles.muted}>No appointments on file.</Text>}
        renderItem={({ item }) => {
          const canAct = canManageAppointments && !['cancelled', 'visited', 'no_show'].includes(item.status);
          return (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>{item.service || 'Visit'}</Text>
              <Text style={styles.muted}>
                {statusLabel(item.status)} · {formatApptTime(item.scheduledAt)}
              </Text>
              {canAct ? (
                <View style={styles.row}>
                  <TouchableOpacity onPress={() => setRescheduleId(item.id)} testID={`patient-reschedule-${item.id}`}>
                    <Text style={styles.link}>Reschedule</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => void cancelAppt(item.id)} testID={`patient-cancel-${item.id}`}>
                    <Text style={[styles.link, styles.danger]}>Cancel</Text>
                  </TouchableOpacity>
                </View>
              ) : null}
            </View>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  link: { color: colors.brand, marginBottom: spacing.sm },
  danger: { color: colors.danger },
  title: { fontSize: typography.sizeXl, fontWeight: typography.weightSemibold },
  muted: { color: colors.muted, marginBottom: spacing.sm },
  bookBtn: { backgroundColor: colors.brand, padding: spacing.sm, borderRadius: 8, marginBottom: spacing.md, alignSelf: 'flex-start' },
  bookBtnText: { color: '#fff', fontWeight: typography.weightSemibold },
  card: { backgroundColor: colors.surface, padding: spacing.md, borderRadius: 10, marginBottom: spacing.sm },
  cardTitle: { fontWeight: typography.weightMedium },
  row: { flexDirection: 'row', gap: 16, marginTop: 8 },
  panel: { backgroundColor: colors.surface, padding: spacing.md, borderRadius: 10, marginBottom: spacing.sm },
  panelTitle: { fontWeight: typography.weightSemibold, marginBottom: 8 },
  input: { backgroundColor: colors.background, borderRadius: 8, padding: spacing.sm, marginBottom: 8 },
  chip: { padding: 8, backgroundColor: '#e3f0fd', borderRadius: 8, marginBottom: 6, alignSelf: 'flex-start' },
  chipText: { color: colors.brand },
});
