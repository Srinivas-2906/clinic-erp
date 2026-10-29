import { useEffect, useState } from 'react';
import {
  FlatList,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import type { ClinicApiClient } from '@clinic-erp/api-client';
import { colors, spacing, typography } from '@clinic-erp/design-tokens';

type Props = {
  client: ClinicApiClient;
  onError: (msg: string) => void;
};

export function PatientsScreen({ client, onError }: Props) {
  const [query, setQuery] = useState('');
  const [patients, setPatients] = useState<{ id: string; name: string; phone?: string }[]>([]);
  const [selected, setSelected] = useState<{
    patient: { name: string; phone?: string };
    appointments: { service?: string; status?: string; scheduledAt?: string }[];
  } | null>(null);

  useEffect(() => {
    client
      .patients(query.trim() || undefined)
      .then((rows) => setPatients(Array.isArray(rows) ? (rows as typeof patients) : []))
      .catch((e) => onError(e instanceof Error ? e.message : 'Search failed'));
  }, [client, query, onError]);

  if (selected) {
    const p = selected.patient;
    return (
      <View testID="patient-detail">
        <TouchableOpacity onPress={() => setSelected(null)}>
          <Text style={styles.link}>← Patients</Text>
        </TouchableOpacity>
        <Text style={styles.title}>{p.name}</Text>
        <Text style={styles.muted}>{p.phone || 'No phone'}</Text>
        <FlatList
          data={selected.appointments || []}
          keyExtractor={(_, i) => String(i)}
          ListEmptyComponent={<Text style={styles.muted}>No appointments on file.</Text>}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>{item.service || 'Visit'}</Text>
              <Text style={styles.muted}>
                {item.status} · {item.scheduledAt ? new Date(item.scheduledAt).toLocaleString() : ''}
              </Text>
            </View>
          )}
        />
      </View>
    );
  }

  return (
    <View style={styles.wrap} testID="patients-screen">
      <TextInput
        style={styles.input}
        placeholder="Search patients"
        value={query}
        onChangeText={setQuery}
        autoCapitalize="none"
        testID="patients-search"
      />
      <FlatList
        data={patients}
        keyExtractor={(item) => item.id}
        ListEmptyComponent={<Text style={styles.muted}>No patients found.</Text>}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.card}
            onPress={() => {
              client
                .patient(item.id)
                .then((detail) => {
                  const p = detail.patient as { name: string; phone?: string };
                  setSelected({
                    patient: p,
                    appointments: detail.appointments as { service?: string; status?: string; scheduledAt?: string }[],
                  });
                })
                .catch((e) => onError(e instanceof Error ? e.message : 'Could not load patient'));
            }}
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
  link: { color: colors.brand, marginBottom: spacing.sm },
  title: { fontSize: typography.sizeXl, fontWeight: typography.weightSemibold, color: colors.brandDark },
  muted: { color: colors.muted, fontSize: typography.sizeSm },
  card: {
    backgroundColor: colors.surface,
    padding: spacing.md,
    borderRadius: 10,
    marginBottom: spacing.sm,
  },
  cardTitle: { fontSize: typography.sizeLg, fontWeight: typography.weightMedium },
});
