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
import type { ClinicApiClient, PatientInvoice } from '@clinic-erp/api-client';
import { colors, spacing, typography } from '@clinic-erp/design-tokens';
import { formatRs, invoiceStatusLabel, newIdempotencyKey, PAYMENT_METHODS } from '../lib/billingUi';

type Props = {
  client: ClinicApiClient;
  invoiceId: string;
  canManageFinancials: boolean;
  onBack: () => void;
  onError: (msg: string) => void;
  onMessage: (msg: string) => void;
  onUpdated: () => void;
};

export function InvoiceDetailScreen({
  client,
  invoiceId,
  canManageFinancials,
  onBack,
  onError,
  onMessage,
  onUpdated,
}: Props) {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [invoice, setInvoice] = useState<PatientInvoice | null>(null);
  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState<string>(PAYMENT_METHODS[0]);
  const [showPayForm, setShowPayForm] = useState(false);
  const loadGen = useRef(0);

  async function reload() {
    const gen = ++loadGen.current;
    setLoading(true);
    try {
      const inv = await client.fetchInvoice(invoiceId);
      if (gen !== loadGen.current) return;
      setInvoice(inv);
      if (inv.balanceDue > 0) setPayAmount(String(inv.balanceDue));
    } catch (e) {
      if (gen !== loadGen.current) return;
      onError(e instanceof Error ? e.message : 'Invoice not found');
      onBack();
    } finally {
      if (gen === loadGen.current) setLoading(false);
    }
  }

  useEffect(() => {
    void reload();
  }, [invoiceId]);

  const canPay =
    invoice &&
    invoice.status !== 'void' &&
    invoice.status !== 'paid' &&
    invoice.balanceDue > 0;

  async function submitPayment(full: boolean) {
    if (!invoice || busy) return;
    const balance = invoice.balanceDue;
    const value = full ? balance : Number(payAmount);
    if (!value || value <= 0) {
      onError('Enter a valid amount');
      return;
    }
    if (value > balance + 0.001) {
      onError(`Amount cannot exceed balance (${formatRs(balance)})`);
      return;
    }
    setBusy(true);
    try {
      await client.recordPayment({
        patientId: invoice.patientId,
        amount: value,
        method: payMethod,
        invoiceId: invoice.id,
        idempotencyKey: newIdempotencyKey(`inv-${invoice.id}`),
      });
      onMessage(full ? 'Paid in full' : 'Payment recorded');
      setShowPayForm(false);
      await reload();
      onUpdated();
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Payment failed');
    } finally {
      setBusy(false);
    }
  }

  async function voidInvoice() {
    if (!invoice || busy || !canManageFinancials) return;
    setBusy(true);
    try {
      await client.voidInvoice(invoice.id, 'Voided from mobile');
      onMessage('Invoice voided');
      await reload();
      onUpdated();
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Could not void');
    } finally {
      setBusy(false);
    }
  }

  if (loading || !invoice) {
    return (
      <View style={styles.centered} testID="invoice-loading">
        <ActivityIndicator color={colors.brand} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined} testID="invoice-detail">
      <TouchableOpacity onPress={onBack} testID="invoice-back">
        <Text style={styles.link}>← Back</Text>
      </TouchableOpacity>
      <Text style={styles.title}>{invoiceStatusLabel(invoice.status)}</Text>
      <ScrollView keyboardShouldPersistTaps="handled">
        {invoice.lineItems.map((li) => (
          <View key={li.id || li.description} style={styles.lineRow}>
            <Text style={styles.lineDesc}>{li.description}</Text>
            <Text>{formatRs(li.amount)}</Text>
          </View>
        ))}
        <View style={styles.totals}>
          <Text>Total {formatRs(invoice.total)}</Text>
          <Text>Paid {formatRs(invoice.amountPaid)}</Text>
          <Text style={styles.balance}>Balance {formatRs(invoice.balanceDue)}</Text>
        </View>
        {canPay ? (
          <>
            {!showPayForm ? (
              <View style={styles.actions}>
                <TouchableOpacity style={styles.primaryBtn} onPress={() => setShowPayForm(true)} testID="invoice-record-pay">
                  <Text style={styles.primaryBtnText}>Record payment</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.secondaryBtn}
                  onPress={() => void submitPayment(true)}
                  disabled={busy}
                  testID="invoice-pay-full"
                >
                  <Text style={styles.secondaryBtnText}>Pay full balance</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.payForm}>
                <TextInput
                  style={styles.input}
                  value={payAmount}
                  onChangeText={setPayAmount}
                  keyboardType="decimal-pad"
                  placeholder="Amount"
                  testID="invoice-pay-amount"
                />
                <View style={styles.methodRow}>
                  {PAYMENT_METHODS.slice(0, 3).map((m) => (
                    <TouchableOpacity
                      key={m}
                      style={[styles.chip, payMethod === m && styles.chipActive]}
                      onPress={() => setPayMethod(m)}
                      testID={`invoice-pay-method-${m}`}
                    >
                      <Text style={payMethod === m ? styles.chipActiveText : styles.muted}>{m}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <TouchableOpacity
                  style={styles.primaryBtn}
                  onPress={() => void submitPayment(false)}
                  disabled={busy}
                  testID="invoice-pay-submit"
                >
                  <Text style={styles.primaryBtnText}>{busy ? 'Saving…' : 'Submit payment'}</Text>
                </TouchableOpacity>
              </View>
            )}
          </>
        ) : null}
        {canManageFinancials && invoice.status !== 'void' && invoice.amountPaid <= 0 ? (
          <TouchableOpacity style={styles.dangerBtn} onPress={() => void voidInvoice()} disabled={busy} testID="invoice-void">
            <Text style={styles.dangerBtnText}>Void invoice</Text>
          </TouchableOpacity>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  link: { color: colors.brand, marginBottom: spacing.sm },
  title: { fontSize: typography.sizeLg, fontWeight: typography.weightSemibold, marginBottom: spacing.md },
  lineRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: '#eee' },
  lineDesc: { flex: 1, marginRight: spacing.sm },
  totals: { marginTop: spacing.md, gap: 4 },
  balance: { fontWeight: typography.weightSemibold, marginTop: spacing.sm },
  actions: { marginTop: spacing.lg, gap: spacing.sm },
  primaryBtn: { backgroundColor: colors.brand, padding: spacing.md, borderRadius: 10 },
  primaryBtnText: { color: '#fff', textAlign: 'center', fontWeight: typography.weightSemibold },
  secondaryBtn: { borderWidth: 1, borderColor: colors.brand, padding: spacing.md, borderRadius: 10 },
  secondaryBtnText: { color: colors.brand, textAlign: 'center' },
  payForm: { marginTop: spacing.lg, gap: spacing.sm },
  input: { backgroundColor: colors.surface, borderRadius: 10, padding: spacing.md },
  methodRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: { paddingVertical: 6, paddingHorizontal: 10, borderRadius: 999, backgroundColor: colors.surface },
  chipActive: { backgroundColor: '#e3f0fd' },
  chipActiveText: { color: colors.brand, fontWeight: typography.weightSemibold },
  muted: { color: colors.muted },
  dangerBtn: { marginTop: spacing.lg, padding: spacing.md },
  dangerBtnText: { color: colors.danger, textAlign: 'center' },
});
