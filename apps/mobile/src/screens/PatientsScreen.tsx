import { useEffect, useState } from 'react';
import {
  FlatList,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import type { ClinicApiClient, ClinicPatient } from '@clinic-erp/api-client';
import { colors, spacing, typography } from '@clinic-erp/design-tokens';
import { PatientDetailScreen } from './PatientDetailScreen';

type Props = {
  client: ClinicApiClient;
  canManageAppointments: boolean;
  canRecordPayments: boolean;
  onBookForPatient: (patientId: string) => void;
  onCreateInvoice: (patientId: string) => void;
  onError: (msg: string) => void;
  onMessage: (msg: string) => void;
};

export function PatientsScreen({
  client,
  canManageAppointments,
  canRecordPayments,
  onBookForPatient,
  onCreateInvoice,
  onError,
  onMessage,
}: Props) {
  const [query, setQuery] = useState('');
  const [patients, setPatients] = useState<ClinicPatient[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      client.patients(query.trim().length >= 2 ? query.trim() : undefined)
        .then((rows) => setPatients(Array.isArray(rows) ? (rows as ClinicPatient[]) : []))
        .catch((e) => onError(e instanceof Error ? e.message : 'Search failed'));
    }, query.trim().length >= 2 ? 300 : 0);
    return () => clearTimeout(t);
  }, [client, query, onError]);

  if (selectedId) {
    return (
      <PatientDetailScreen
        client={client}
        patientId={selectedId}
        canManageAppointments={canManageAppointments}
        canRecordPayments={canRecordPayments}
        onBack={() => setSelectedId(null)}
        onBook={() => {
          onBookForPatient(selectedId);
        }}
        onCreateInvoice={() => onCreateInvoice(selectedId)}
        onError={onError}
        onMessage={onMessage}
      />
    );
  }

  return (
    <View style={styles.wrap} testID="patients-screen">
      <TextInput
        style={styles.input}
        placeholder="Search patients (min 2 chars)"
        value={query}
        onChangeText={setQuery}
        autoCapitalize="none"
        testID="patients-search"
      />
      <FlatList
        data={patients}
        keyExtractor={(item) => item.id}
        ListEmptyComponent={<Text style={styles.muted}>Search to find patients.</Text>}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.card}
            onPress={() => setSelectedId(item.id)}
            testID={`patients-row-${item.id}`}
          >
            <Text style={styles.cardTitle}>{item.name}</Text>
            <Text style={styles.muted}>{item.phone || '—'}</Text>
          </TouchableOpacity>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  input: {
    backgroundColor: colors.surface,
    borderRadius: 10,
    padding: spacing.md,
    marginBottom: spacing.sm,
    fontSize: typography.sizeMd,
  },
  card: {
    backgroundColor: colors.surface,
    padding: spacing.md,
    borderRadius: 10,
    marginBottom: spacing.sm,
  },
  cardTitle: { fontSize: typography.sizeLg, fontWeight: typography.weightMedium },
  muted: { color: colors.muted, fontSize: typography.sizeSm },
});
