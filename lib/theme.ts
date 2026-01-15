export const theme = {
  colors: {
    primary: '#60a5fa',
    primaryDark: '#3b82f6',
    background: '#0f172a',
    surface: '#071023',
    surfaceLight: '#1e293b',
    border: '#0b1220',
    text: {
      primary: '#e6eef8',
      secondary: '#94a3b8',
      muted: '#7ea8c9',
    },
    danger: '#ef4444',
  },
  spacing: {
    xs: 4,
    sm: 8,
    md: 16,
    lg: 24,
    xl: 32,
  },
  borderRadius: {
    sm: 8,
    md: 12,
    lg: 16,
  },
  fontSize: {
    sm: 12,
    base: 14,
    md: 16,
    lg: 18,
    xl: 20,
    '2xl': 24,
  },
} as const;
