import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import type { ClinicApiClient, ClinicAppointment } from '@clinic-erp/api-client';
import { colors, spacing, typography } from '@clinic-erp/design-tokens';
import { formatApptTime } from '../clinicTime';
import {
  queueActionLabel,
  queueStatusLabel,
  statusTone,
  QUEUE_NEXT,
} from '../appointmentUi';

type StatusFilter = 'all' | 'active' | 'waiting';

type Props = {
  client: ClinicApiClient;
  scheduleDate: string;
  canManageAppointments: boolean;
  canSignClinical: boolean;
  onConsult: (appt: ClinicAppointment) => void;
  onError: (msg: string) => void;
};

export function TodayScreen({
  client,
  scheduleDate,
  canManageAppointments,
  canSignClinical,
  onConsult,
  onError,
}: Props) {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [appointments, setAppointments] = useState<ClinicAppointment[]>([]);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [actionBusyId, setActionBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const rows = await client.appointments({ date: scheduleDate });
      const sorted = [...rows].sort(
        (a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime(),
      );
      setAppointments(sorted);
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Could not load schedule');
    }
  }, [client, scheduleDate, onError]);

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load]);

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  const filtered = useMemo(() => {
    const active = appointments.filter((a) => a.status !== 'cancelled' && a.status !== 'no_show');
    if (statusFilter === 'all') return active;
    if (statusFilter === 'waiting') {
      return active.filter((a) => a.status === 'arrived' || a.status === 'visited');
    }
    return active.filter((a) => ['requested', 'confirmed'].includes(a.status));
  }, [appointments, statusFilter]);

  async function advanceStatus(appt: ClinicAppointment) {
    const next = QUEUE_NEXT[appt.status];
    if (!next || !canManageAppointments || actionBusyId) return;
    setActionBusyId(appt.id);
    try {
      await client.updateAppointment(appt.id, { status: next });
      await load();
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Could not update appointment');
    } finally {
      setActionBusyId(null);
    }
  }

  function renderItem({ item }: { item: ClinicAppointment }) {
    const tone = statusTone(item.status);
    const action = queueActionLabel(item.status);
    const showConsult = canSignClinical && item.status === 'arrived';
    const busy = actionBusyId === item.id;

    return (
      <View style={styles.card} testID={`today-appt-${item.id}`}>
        <View style={styles.cardTop}>
          <Text style={styles.time}>{formatApptTime(item.scheduledAt)}</Text>
          <View style={[styles.badge, { backgroundColor: tone.bg }]}>
            <Text style={[styles.badgeText, { color: tone.fg }]}>{queueStatusLabel(item)}</Text>
          </View>
        </View>
        <Text style={styles.name}>{item.patientName || 'Patient'}</Text>
        <Text style={styles.meta}>
          {item.service || 'Visit'}
          {item.assignedDoctor ? ` · ${item.assignedDoctor}` : ''}
        </Text>
        <View style={styles.actions}>
          {action && canManageAppointments ? (
            <TouchableOpacity
              style={styles.actionBtn}
              onPress={() => advanceStatus(item)}
              disabled={busy}
              testID={`today-action-${item.id}`}
            >
              <Text style={styles.actionText}>{busy ? '…' : action}</Text>
            </TouchableOpacity>
          ) : null}
          {showConsult ? (
            <TouchableOpacity
              style={[styles.actionBtn, styles.actionPrimary]}
              onPress={() => onConsult(item)}
              testID={`today-consult-${item.id}`}
            >
              <Text style={styles.actionPrimaryText}>Consult</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>
    );
  }

  return (
    <View style={styles.wrap} testID="today-screen">
      <View style={styles.filterRow}>
        {(['all', 'scheduled', 'waiting'] as const).map((id) => {
          const key = id === 'scheduled' ? 'active' : id === 'waiting' ? 'waiting' : 'all';
          const label = id === 'all' ? 'All' : id === 'scheduled' ? 'Scheduled' : 'Waiting';
          const selected = statusFilter === key;
          return (
            <TouchableOpacity
              key={id}
              style={[styles.chip, selected && styles.chipOn]}
              onPress={() => setStatusFilter(key)}
              testID={`today-filter-${id}`}
            >
              <Text style={selected ? styles.chipTextOn : styles.chipText}>{label}</Text>
            </TouchableOpacity>
          );
        })}
        <TouchableOpacity style={styles.refreshBtn} onPress={() => void onRefresh()} testID="today-refresh">
          <Text style={styles.refreshText}>Refresh</Text>
        </TouchableOpacity>
      </View>
      {loading ? (
        <ActivityIndicator color={colors.brand} style={{ marginTop: 24 }} />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} />}
          ListEmptyComponent={
            <Text style={styles.empty}>No appointments for {scheduleDate}.</Text>
          }
          renderItem={renderItem}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: spacing.sm, alignItems: 'center' },
  chip: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 999, backgroundColor: colors.surface },
  chipOn: { backgroundColor: '#e3f0fd' },
  chipText: { color: colors.muted, fontSize: typography.sizeSm },
  chipTextOn: { color: colors.brand, fontWeight: typography.weightSemibold, fontSize: typography.sizeSm },
  refreshBtn: { marginLeft: 'auto' },
  refreshText: { color: colors.brand, fontWeight: typography.weightMedium },
  card: {
    backgroundColor: colors.surface,
    padding: spacing.md,
    borderRadius: 10,
    marginBottom: spacing.sm,
  },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  time: { fontWeight: typography.weightSemibold, color: colors.brandDark },
  badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  badgeText: { fontSize: typography.sizeSm, fontWeight: typography.weightMedium },
  name: { fontSize: typography.sizeLg, fontWeight: typography.weightMedium },
  meta: { color: colors.muted, fontSize: typography.sizeSm, marginTop: 2 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 10, flexWrap: 'wrap' },
  actionBtn: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 8, backgroundColor: '#eef2ff' },
  actionText: { color: colors.brand, fontWeight: typography.weightSemibold },
  actionPrimary: { backgroundColor: colors.brand },
  actionPrimaryText: { color: '#fff', fontWeight: typography.weightSemibold },
  empty: { color: colors.muted, textAlign: 'center', marginTop: 32 },
});
