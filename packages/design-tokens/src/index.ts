/** Design tokens aligned with apps/crm/src/styles.css — shared by web and Expo. */

export const colors = {
  brand: '#1565C0',
  brandDark: '#0D47A1',
  success: '#059669',
  warning: '#b45309',
  danger: '#be185d',
  muted: '#64748b',
  surface: '#ffffff',
  background: '#f1f5f9',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const typography = {
  fontFamily: 'Inter, system-ui, sans-serif',
  sizeSm: 12,
  sizeMd: 14,
  sizeLg: 16,
  sizeXl: 20,
  weightMedium: '500' as const,
  weightSemibold: '600' as const,
};

export const radii = {
  sm: 6,
  md: 10,
  lg: 16,
} as const;
