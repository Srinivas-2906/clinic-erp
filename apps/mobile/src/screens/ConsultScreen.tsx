import { useEffect, useRef, useState } from 'react';
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
import type { ClinicApiClient, ClinicAppointment, EncounterDetail } from '@clinic-erp/api-client';
import { validatePrescriptionLines, type PrescriptionLineInput } from '@clinic-erp/contracts';
import { colors, spacing, typography } from '@clinic-erp/design-tokens';

type Props = {
  client: ClinicApiClient;
  appointment: ClinicAppointment;
  canSignClinical: boolean;
  onBack: () => void;
  onDone: () => void;
  onError: (msg: string) => void;
  onMessage: (msg: string) => void;
};

const emptyRx = (): PrescriptionLineInput => ({
  drugName: '',
  dose: '',
  frequency: '',
  duration: '',
  instructions: '',
});

export function ConsultScreen({
  client,
  appointment,
  canSignClinical,
  onBack,
  onDone,
  onError,
  onMessage,
}: Props) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [encounter, setEncounter] = useState<EncounterDetail | null>(null);
  const [chiefComplaint, setChiefComplaint] = useState('');
  const [clinicalNote, setClinicalNote] = useState('');
  const [diagnosis, setDiagnosis] = useState('');
  const [rxLines, setRxLines] = useState<PrescriptionLineInput[]>([emptyRx()]);
  const [allergies, setAllergies] = useState<string[]>([]);
  const loadGen = useRef(0);

  useEffect(() => {
    const gen = ++loadGen.current;
    (async () => {
      setLoading(true);
      try {
        const allergyRes = await client.patientAllergies(appointment.patientId).catch(() => ({ allergies: [] }));
        if (gen !== loadGen.current) return;
        setAllergies((allergyRes.allergies || []).map((a) => a.substance).filter(Boolean));

        let enc: EncounterDetail;
        if (appointment.encounterId) {
          enc = await client.fetchEncounter(appointment.encounterId);
        } else {
          enc = await client.createEncounter(appointment.patientId, {
            appointmentId: appointment.id,
            doctorId: appointment.assignedDoctorId || undefined,
            chiefComplaint: appointment.notes || '',
          });
        }
        if (gen !== loadGen.current) return;
        applyEncounter(enc);
      } catch (e) {
        if (gen !== loadGen.current) return;
        onError(e instanceof Error ? e.message : 'Could not open consultation');
        onBack();
      } finally {
        if (gen === loadGen.current) setLoading(false);
      }
    })();
    return () => {
      loadGen.current += 1;
    };
  }, [appointment.id, appointment.encounterId, appointment.patientId, appointment.assignedDoctorId, appointment.notes, client, onBack, onError]);

  function applyEncounter(enc: EncounterDetail) {
    setEncounter(enc);
    setChiefComplaint(enc.chiefComplaint || '');
    setClinicalNote(enc.clinicalNote || '');
    setDiagnosis(enc.diagnoses?.[0]?.description || '');
    if (enc.prescription?.items?.length) {
      setRxLines(
        enc.prescription.items.map((i) => ({
          drugName: i.drugName,
          dose: i.dose || '',
          frequency: i.frequency || '',
          duration: i.duration || '',
          instructions: i.instructions || '',
        })),
      );
    }
  }

  function buildPayload() {
    const items = rxLines.filter((l) => l.drugName.trim());
    const rxErr = validatePrescriptionLines(items);
    if (rxErr) throw new Error(rxErr);
    return {
      chiefComplaint: chiefComplaint.trim(),
      clinicalNote: clinicalNote.trim(),
      diagnoses: diagnosis.trim() ? [{ description: diagnosis.trim(), isPrimary: true }] : [],
      prescriptionItems: items,
    };
  }

  async function saveDraft() {
    if (!encounter || saving || encounter.status === 'finalized') return;
    setSaving(true);
    try {
      const updated = await client.updateEncounter(encounter.id, buildPayload());
      setEncounter(updated);
      onMessage('Consultation saved');
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  async function finalize() {
    if (!encounter || saving || encounter.status === 'finalized') return;
    if (!canSignClinical) {
      onError('Link your login to a doctor profile to finalize consultations');
      return;
    }
    setSaving(true);
    try {
      await client.updateEncounter(encounter.id, buildPayload());
      await client.finalizeEncounter(encounter.id);
      onMessage('Consultation finalized');
      onDone();
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Finalize failed');
    } finally {
      setSaving(false);
    }
  }

  const readOnly = encounter?.status === 'finalized';
  const name = appointment.patientName || 'Patient';

  if (loading) {
    return (
      <View style={styles.centered} testID="consult-loading">
        <ActivityIndicator color={colors.brand} />
        <Text style={styles.muted}>Loading consultation…</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      testID="consult-screen"
    >
      <TouchableOpacity onPress={onBack} testID="consult-back">
        <Text style={styles.link}>← Today</Text>
      </TouchableOpacity>
      <Text style={styles.title}>{name}</Text>
      <Text style={styles.subtitle}>
        {appointment.service || 'Visit'} · {readOnly ? 'Finalized' : 'Draft'}
      </Text>
      {allergies.length > 0 ? (
        <Text style={styles.allergy}>Allergies: {allergies.join(', ')}</Text>
      ) : null}

      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.form}>
        <Text style={styles.label}>Chief complaint</Text>
        <TextInput
          style={styles.input}
          value={chiefComplaint}
          onChangeText={setChiefComplaint}
          editable={!readOnly}
          multiline
          testID="consult-complaint"
        />
        <Text style={styles.label}>Clinical note</Text>
        <TextInput
          style={styles.input}
          value={clinicalNote}
          onChangeText={setClinicalNote}
          editable={!readOnly}
          multiline
          testID="consult-note"
        />
        <Text style={styles.label}>Diagnosis</Text>
        <TextInput
          style={styles.input}
          value={diagnosis}
          onChangeText={setDiagnosis}
          editable={!readOnly}
          testID="consult-diagnosis"
        />
        <Text style={styles.label}>Prescription</Text>
        {rxLines.map((line, idx) => (
          <View key={`rx-${idx}`} style={styles.rxRow}>
            <TextInput
              style={[styles.input, styles.rxInput]}
              placeholder="Medicine"
              value={line.drugName}
              onChangeText={(v) => {
                const next = [...rxLines];
                next[idx] = { ...next[idx], drugName: v };
                setRxLines(next);
              }}
              editable={!readOnly}
              testID={idx === 0 ? 'consult-rx-drug' : undefined}
            />
            <TextInput
              style={[styles.input, styles.rxInput]}
              placeholder="Dose"
              value={line.dose}
              onChangeText={(v) => {
                const next = [...rxLines];
                next[idx] = { ...next[idx], dose: v };
                setRxLines(next);
              }}
              editable={!readOnly}
            />
          </View>
        ))}
        {!readOnly ? (
          <TouchableOpacity onPress={() => setRxLines([...rxLines, emptyRx()])}>
            <Text style={styles.link}>+ Add medicine</Text>
          </TouchableOpacity>
        ) : null}
      </ScrollView>

      {!readOnly ? (
        <View style={styles.footer}>
          <TouchableOpacity
            style={styles.secondaryBtn}
            onPress={() => void saveDraft()}
            disabled={saving}
            testID="consult-save"
          >
            <Text style={styles.secondaryBtnText}>{saving ? 'Saving…' : 'Save draft'}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.primaryBtn}
            onPress={() => void finalize()}
            disabled={saving || !canSignClinical}
            testID="consult-finalize"
          >
            <Text style={styles.primaryBtnText}>{saving ? '…' : 'Finalize visit'}</Text>
          </TouchableOpacity>
        </View>
      ) : null}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  link: { color: colors.brand, marginBottom: spacing.sm },
  title: { fontSize: typography.sizeXl, fontWeight: typography.weightSemibold, color: colors.brandDark },
  subtitle: { color: colors.muted, marginBottom: spacing.sm },
  allergy: { color: colors.danger, marginBottom: spacing.sm, fontSize: typography.sizeSm },
  form: { paddingBottom: spacing.xl },
  label: { fontWeight: typography.weightMedium, marginTop: spacing.sm, marginBottom: 4 },
  input: {
    backgroundColor: colors.surface,
    borderRadius: 10,
    padding: spacing.md,
    fontSize: typography.sizeMd,
    minHeight: 44,
  },
  rxRow: { gap: 6, marginBottom: 6 },
  rxInput: { marginTop: 4 },
  footer: { flexDirection: 'row', gap: spacing.sm, paddingVertical: spacing.sm },
  primaryBtn: {
    flex: 1,
    backgroundColor: colors.brand,
    padding: spacing.md,
    borderRadius: 10,
    alignItems: 'center',
  },
  primaryBtnText: { color: '#fff', fontWeight: typography.weightSemibold },
  secondaryBtn: {
    flex: 1,
    backgroundColor: colors.surface,
    padding: spacing.md,
    borderRadius: 10,
    alignItems: 'center',
  },
  secondaryBtnText: { color: colors.brand, fontWeight: typography.weightSemibold },
  muted: { color: colors.muted },
});
