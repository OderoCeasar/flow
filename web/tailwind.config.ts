import type { Config } from 'tailwindcss';
import { colors, fontSize, radius, spacing } from './src/design/tokens';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: colors as unknown as Record<string, string>,
      spacing,
      minHeight: { touch: spacing.touch },
      minWidth: { touch: spacing.touch },
      fontSize: fontSize as unknown as Record<string, [string, { lineHeight: string }]>,
      borderRadius: radius,
      fontFamily: {
        sans: ['system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'Noto Sans', 'sans-serif'],
      },
    },
  },
  plugins: [],
} satisfies Config;
