import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import type { ClinicApiClient, PatientInvoice } from '@clinic-erp/api-client';
import { colors, spacing, typography } from '@clinic-erp/design-tokens';
import { formatRs, invoiceStatusLabel } from '../lib/billingUi';

type Props = {
  client: ClinicApiClient;
  onOpenInvoice: (invoice: PatientInvoice) => void;
  onCreateInvoice: () => void;
  onError: (msg: string) => void;
};

export function PaymentsScreen({ client, onOpenInvoice, onCreateInvoice, onError }: Props) {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<'due' | 'all'>('due');
  const [invoices, setInvoices] = useState<PatientInvoice[]>([]);
  const loadGen = useRef(0);

  const load = useCallback(async () => {
    const gen = ++loadGen.current;
    try {
      const res = await client.fetchInvoices();
      if (gen !== loadGen.current) return;
      let list = res.invoices || [];
      if (filter === 'due') {
        list = list.filter((i) => i.status === 'open' || i.status === 'partial');
      }
      setInvoices(list);
    } catch (e) {
      if (gen !== loadGen.current) return;
      onError(e instanceof Error ? e.message : 'Could not load invoices');
    } finally {
      if (gen === loadGen.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [client, filter, onError]);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

  return (
    <View style={styles.wrap} testID="payments-screen">
      <View style={styles.toolbar}>
        <TouchableOpacity
          style={[styles.chip, filter === 'due' && styles.chipActive]}
          onPress={() => setFilter('due')}
          testID="payments-filter-due"
        >
          <Text style={filter === 'due' ? styles.chipTextActive : styles.muted}>Due</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.chip, filter === 'all' && styles.chipActive]}
          onPress={() => setFilter('all')}
          testID="payments-filter-all"
        >
          <Text style={filter === 'all' ? styles.chipTextActive : styles.muted}>All</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.newBtn} onPress={onCreateInvoice} testID="payments-new-invoice">
          <Text style={styles.newBtnText}>New invoice</Text>
        </TouchableOpacity>
      </View>
      {loading ? (
        <ActivityIndicator color={colors.brand} style={styles.loader} />
      ) : (
        <FlatList
          data={invoices}
          keyExtractor={(item) => item.id}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(); }} />}
          ListEmptyComponent={<Text style={styles.muted}>No invoices</Text>}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.card}
              onPress={() => onOpenInvoice(item)}
              testID={`payments-invoice-${item.id}`}
            >
              <Text style={styles.cardTitle}>{invoiceStatusLabel(item.status)} · {formatRs(item.balanceDue)} due</Text>
              <Text style={styles.muted}>Total {formatRs(item.total)} · Paid {formatRs(item.amountPaid)}</Text>
            </TouchableOpacity>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  toolbar: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.sm, alignItems: 'center' },
  chip: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 999, backgroundColor: colors.surface },
  chipActive: { backgroundColor: '#e3f0fd' },
  chipTextActive: { color: colors.brand, fontWeight: typography.weightSemibold },
  newBtn: { marginLeft: 'auto', paddingVertical: 6, paddingHorizontal: 10 },
  newBtnText: { color: colors.brand, fontWeight: typography.weightSemibold },
  loader: { marginTop: spacing.lg },
  card: { backgroundColor: colors.surface, padding: spacing.md, borderRadius: 10, marginBottom: spacing.sm },
  cardTitle: { fontWeight: typography.weightSemibold, color: colors.brandDark, marginBottom: 4 },
  muted: { color: colors.muted, fontSize: typography.sizeSm },
});
