// Design tokens: the single source for colours, spacing and type sizes.
// tailwind.config.ts reads this file, so components use token names, never raw hex.
// Every text/background pair here meets WCAG 2.2 AA (4.5:1 or better).

export const colors = {
  brand: {
    50: '#eef6ff',
    100: '#d9eaff',
    200: '#b3d4ff',
    300: '#8fbcf0',
    500: '#1668c7',
    600: '#0b5cad', // primary buttons: 6.6:1 against white text
    700: '#094a8c',
    800: '#073a6e',
    900: '#06305c',
  },
  ink: {
    DEFAULT: '#111827', // body text
    heading: '#0f2c4a', // citizen headings: deep navy, 14:1 on white
    muted: '#4b5563', // secondary text: 7.6:1 on white
    subtle: '#5b6472', // tertiary text: 6.1:1 on white
    inverse: '#ffffff',
  },
  surface: {
    DEFAULT: '#ffffff',
    muted: '#f3f4f6',
    sunken: '#e5e7eb',
    line: '#d1d5db',
  },
  danger: { 50: '#fef2f2', 600: '#b91c1c', 700: '#991b1b' },
  success: { 50: '#f0fdf4', 700: '#15803d' },
  warning: { 50: '#fffbeb', 800: '#92400e' },
  // Teal accent for progress and "found it" confirmations.
  accent: { 50: '#e8f6f3', 600: '#0d8a7d', 700: '#0f6b61', 800: '#115e59' },
  // Page background around the phone frame on wide screens.
  canvas: '#edf2f6',
  focus: '#f59e0b',
} as const;

// One colour pair per status, used everywhere a status appears.
export const statusColors = {
  received: { bg: '#f1f5f9', fg: '#334155', dot: '#64748b' },
  verified: { bg: '#dbeafe', fg: '#1e40af', dot: '#2563eb' },
  scheduled: { bg: '#ede9fe', fg: '#5b21b6', dot: '#7c3aed' },
  in_progress: { bg: '#fef3c7', fg: '#92400e', dot: '#d97706' },
  fixed: { bg: '#dcfce7', fg: '#166534', dot: '#16a34a' },
  invalid: { bg: '#f3f4f6', fg: '#374151', dot: '#6b7280' },
} as const;

// Severity always pairs colour with an icon and a word, never colour alone.
export const severityColors = {
  low: { bg: '#ccfbf1', fg: '#115e59', dot: '#0d9488' },
  medium: { bg: '#fef9c3', fg: '#854d0e', dot: '#ca8a04' },
  high: { bg: '#ffedd5', fg: '#9a3412', dot: '#ea580c' },
  critical: { bg: '#fee2e2', fg: '#991b1b', dot: '#dc2626' },
} as const;

export const spacing = {
  touch: '44px', // minimum touch target (WCAG 2.5.8 / Fitts's law)
  gutter: '16px',
} as const;

export const fontSize = {
  xs: ['0.75rem', { lineHeight: '1rem' }],
  sm: ['0.875rem', { lineHeight: '1.25rem' }],
  base: ['1rem', { lineHeight: '1.5rem' }],
  lg: ['1.125rem', { lineHeight: '1.75rem' }],
  xl: ['1.25rem', { lineHeight: '1.75rem' }],
  '2xl': ['1.5rem', { lineHeight: '2rem' }],
  '3xl': ['1.875rem', { lineHeight: '2.25rem' }],
} as const;

export const radius = { DEFAULT: '0.5rem', lg: '0.75rem', xl: '1rem' } as const;
