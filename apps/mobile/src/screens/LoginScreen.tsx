import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { colors, spacing, typography } from '@clinic-erp/design-tokens';

type Props = {
  tenant: string;
  onTenantChange: (v: string) => void;
  email: string;
  onEmailChange: (v: string) => void;
  password: string;
  onPasswordChange: (v: string) => void;
  error: string;
  busy: boolean;
  onSubmit: () => void;
};

export function LoginScreen({
  tenant,
  onTenantChange,
  email,
  onEmailChange,
  password,
  onPasswordChange,
  error,
  busy,
  onSubmit,
}: Props) {
  return (
    <View style={styles.screen} testID="login-screen">
      <Text style={styles.title}>Clinic ERP</Text>
      <TextInput
        style={styles.input}
        placeholder="Workspace (tenant slug)"
        value={tenant}
        onChangeText={onTenantChange}
        autoCapitalize="none"
        testID="login-tenant"
      />
      <TextInput
        style={styles.input}
        placeholder="Email"
        value={email}
        onChangeText={onEmailChange}
        autoCapitalize="none"
        keyboardType="email-address"
        testID="login-email"
      />
      <TextInput
        style={styles.input}
        placeholder="Password"
        value={password}
        onChangeText={onPasswordChange}
        secureTextEntry
        testID="login-password"
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <TouchableOpacity style={styles.primaryBtn} onPress={onSubmit} disabled={busy} testID="login-submit">
        <Text style={styles.primaryBtnText}>{busy ? 'Signing in…' : 'Sign in'}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background, padding: spacing.lg, justifyContent: 'center' },
  title: { fontSize: typography.sizeXl, fontWeight: typography.weightSemibold, color: colors.brandDark, marginBottom: spacing.lg },
  input: {
    backgroundColor: colors.surface,
    borderRadius: 10,
    padding: spacing.md,
    marginBottom: spacing.sm,
    fontSize: typography.sizeMd,
  },
  primaryBtn: { backgroundColor: colors.brand, padding: spacing.md, borderRadius: 10, marginTop: spacing.sm },
  primaryBtnText: { color: '#fff', textAlign: 'center', fontWeight: typography.weightSemibold },
  error: { color: colors.danger, marginVertical: spacing.sm },
});
