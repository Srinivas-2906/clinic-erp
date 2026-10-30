import { useEffect, useMemo, useState } from 'react';
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
import type { CatalogItem, ClinicApiClient, ClinicPatient } from '@clinic-erp/api-client';
import { colors, spacing, typography } from '@clinic-erp/design-tokens';
import { formatRs } from '../lib/billingUi';

type LineDraft = { key: string; description: string; quantity: string; unitPrice: string; catalogItemId?: string };

type Props = {
  client: ClinicApiClient;
  prefillPatientId?: string | null;
  appointmentId?: string | null;
  encounterId?: string | null;
  onBack: () => void;
  onCreated: (invoiceId: string) => void;
  onError: (msg: string) => void;
  onMessage: (msg: string) => void;
};

function newLine(): LineDraft {
  return { key: Math.random().toString(36).slice(2), description: '', quantity: '1', unitPrice: '' };
}

export function CreateInvoiceScreen({
  client,
  prefillPatientId,
  appointmentId,
  encounterId,
  onBack,
  onCreated,
  onError,
  onMessage,
}: Props) {
  const [patientId, setPatientId] = useState(prefillPatientId || '');
  const [search, setSearch] = useState('');
  const [patients, setPatients] = useState<ClinicPatient[]>([]);
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [lines, setLines] = useState<LineDraft[]>([newLine()]);
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [loadingPatients, setLoadingPatients] = useState(false);

  useEffect(() => {
    client
      .fetchCatalog()
      .then((data) => {
        const items = Array.isArray(data) ? data : data.items || [];
        setCatalog(items);
      })
      .catch(() => {});
  }, [client]);

  useEffect(() => {
    if (!search.trim()) return;
    setLoadingPatients(true);
    const t = setTimeout(() => {
      client
        .patients(search.trim())
        .then((rows) => setPatients((rows as ClinicPatient[]) || []))
        .catch(() => setPatients([]))
        .finally(() => setLoadingPatients(false));
    }, 300);
    return () => clearTimeout(t);
  }, [search, client]);

  useEffect(() => {
    if (prefillPatientId) setPatientId(prefillPatientId);
  }, [prefillPatientId]);

  const totalPreview = useMemo(() => {
    return lines.reduce((sum, li) => {
      const q = Number(li.quantity) || 0;
      const u = Number(li.unitPrice) || 0;
      return sum + q * u;
    }, 0);
  }, [lines]);

  function addCatalog(item: CatalogItem) {
    setLines((prev) => [
      ...prev,
      {
        key: Math.random().toString(36).slice(2),
        description: item.title,
        quantity: '1',
        unitPrice: String(item.priceNum ?? item.price ?? ''),
        catalogItemId: item.id,
      },
    ]);
  }

  async function submit() {
    if (!patientId) {
      onError('Select a patient');
      return;
    }
    const lineItems = lines
      .map((li) => ({
        description: li.description.trim(),
        quantity: Number(li.quantity) > 0 ? Number(li.quantity) : 1,
        unitPrice: Number(li.unitPrice),
        catalogItemId: li.catalogItemId,
      }))
      .filter((li) => li.description && li.unitPrice > 0);
    if (!lineItems.length) {
      onError('Add at least one line with amount');
      return;
    }
    setBusy(true);
    try {
      const inv = await client.createInvoice({
        patientId,
        notes: notes.trim() || undefined,
        lineItems,
        ...(appointmentId ? { appointmentId } : {}),
        ...(encounterId ? { encounterId } : {}),
      });
      onMessage('Invoice created');
      onCreated(inv.id);
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Could not create invoice');
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined} testID="create-invoice">
      <TouchableOpacity onPress={onBack} testID="create-invoice-back">
        <Text style={styles.link}>← Cancel</Text>
      </TouchableOpacity>
      <Text style={styles.title}>New invoice</Text>
      <ScrollView keyboardShouldPersistTaps="handled">
        {!prefillPatientId ? (
          <>
            <TextInput
              style={styles.input}
              placeholder="Search patient"
              value={search}
              onChangeText={setSearch}
              testID="create-invoice-search"
            />
            {loadingPatients ? <ActivityIndicator color={colors.brand} /> : null}
            {patients.slice(0, 8).map((p) => (
              <TouchableOpacity
                key={p.id}
                style={[styles.pickRow, patientId === p.id && styles.pickRowActive]}
                onPress={() => setPatientId(p.id)}
                testID={`create-invoice-patient-${p.id}`}
              >
                <Text>{p.name}</Text>
              </TouchableOpacity>
            ))}
          </>
        ) : (
          <Text style={styles.muted}>Patient selected</Text>
        )}
        {catalog.length > 0 ? (
          <View style={styles.catalogRow}>
            {catalog.slice(0, 6).map((c) => (
              <TouchableOpacity key={c.id} style={styles.chip} onPress={() => addCatalog(c)} testID={`create-invoice-catalog-${c.id}`}>
                <Text style={styles.chipText}>{c.title}</Text>
              </TouchableOpacity>
            ))}
          </View>
        ) : null}
        {lines.map((li, idx) => (
          <View key={li.key} style={styles.lineBlock}>
            <TextInput
              style={styles.input}
              placeholder="Description"
              value={li.description}
              onChangeText={(v) => setLines((prev) => prev.map((x, i) => (i === idx ? { ...x, description: v } : x)))}
              testID={idx === 0 ? 'create-invoice-line-desc' : undefined}
            />
            <View style={styles.lineMeta}>
              <TextInput
                style={[styles.input, styles.qty]}
                placeholder="Qty"
                value={li.quantity}
                onChangeText={(v) => setLines((prev) => prev.map((x, i) => (i === idx ? { ...x, quantity: v } : x)))}
                keyboardType="number-pad"
              />
              <TextInput
                style={[styles.input, styles.price]}
                placeholder="Price"
                value={li.unitPrice}
                onChangeText={(v) => setLines((prev) => prev.map((x, i) => (i === idx ? { ...x, unitPrice: v } : x)))}
                keyboardType="decimal-pad"
                testID={idx === 0 ? 'create-invoice-line-price' : undefined}
              />
            </View>
          </View>
        ))}
        <TouchableOpacity onPress={() => setLines((p) => [...p, newLine()])} testID="create-invoice-add-line">
          <Text style={styles.link}>+ Add line</Text>
        </TouchableOpacity>
        <TextInput
          style={styles.input}
          placeholder="Notes (optional)"
          value={notes}
          onChangeText={setNotes}
          testID="create-invoice-notes"
        />
        <Text style={styles.preview}>Preview total {formatRs(totalPreview)}</Text>
        <TouchableOpacity style={styles.primaryBtn} onPress={() => void submit()} disabled={busy} testID="create-invoice-submit">
          <Text style={styles.primaryBtnText}>{busy ? 'Creating…' : 'Create invoice'}</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  link: { color: colors.brand, marginBottom: spacing.sm },
  title: { fontSize: typography.sizeLg, fontWeight: typography.weightSemibold, marginBottom: spacing.md },
  input: { backgroundColor: colors.surface, borderRadius: 10, padding: spacing.md, marginBottom: spacing.sm },
  pickRow: { padding: spacing.sm, backgroundColor: colors.surface, marginBottom: 4, borderRadius: 8 },
  pickRowActive: { borderWidth: 1, borderColor: colors.brand },
  catalogRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginVertical: spacing.sm },
  chip: { backgroundColor: '#e3f0fd', paddingVertical: 6, paddingHorizontal: 10, borderRadius: 999 },
  chipText: { color: colors.brand, fontSize: typography.sizeSm },
  lineBlock: { marginBottom: spacing.sm },
  lineMeta: { flexDirection: 'row', gap: spacing.sm },
  qty: { flex: 1 },
  price: { flex: 2 },
  preview: { marginVertical: spacing.sm, fontWeight: typography.weightSemibold },
  primaryBtn: { backgroundColor: colors.brand, padding: spacing.md, borderRadius: 10, marginTop: spacing.sm },
  primaryBtnText: { color: '#fff', textAlign: 'center', fontWeight: typography.weightSemibold },
  muted: { color: colors.muted, marginBottom: spacing.sm },
});
