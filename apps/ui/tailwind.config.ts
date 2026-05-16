import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './src/**/*.{ts,tsx}'],
  darkMode: ['selector', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        surface: {
          0: 'var(--surface-0)',
          1: 'var(--surface-1)',
          2: 'var(--surface-2)',
          3: 'var(--surface-3)',
          tint: 'var(--surface-tint)',
          frost: 'var(--surface-frost)',
          'frost-2': 'var(--surface-frost-2)',
        },
        ink: {
          1: 'var(--ink-1)',
          2: 'var(--ink-2)',
          3: 'var(--ink-3)',
          4: 'var(--ink-4)',
          mesh: 'var(--ink-on-mesh)',
          'mesh-mute': 'var(--ink-on-mesh-mute)',
        },
        brand: {
          DEFAULT: 'var(--brand-indigo)',
          deep: 'var(--brand-indigo-deep)',
          soft: 'var(--brand-indigo-soft)',
        },
        ai: {
          DEFAULT: 'var(--ai-violet)',
          soft: 'var(--ai-violet-soft)',
          ink: 'var(--ai-violet-ink)',
        },
        pos: 'var(--pos)',
        'pos-soft': 'var(--pos-soft)',
        neg: 'var(--neg)',
        'neg-soft': 'var(--neg-soft)',
        warn: 'var(--warn)',
        'warn-soft': 'var(--warn-soft)',
        info: 'var(--info)',
        'info-soft': 'var(--info-soft)',
        line: {
          1: 'var(--line-1)',
          2: 'var(--line-2)',
          mesh: 'var(--line-mesh)',
          inner: 'var(--line-inner)',
        },
      },
      borderRadius: {
        xs: 'var(--r-xs)',
        sm: 'var(--r-sm)',
        md: 'var(--r-md)',
        lg: 'var(--r-lg)',
        xl: 'var(--r-xl)',
        '2xl': 'var(--r-2xl)',
        pill: 'var(--r-pill)',
      },
      spacing: {
        s1: 'var(--s-1)',
        s2: 'var(--s-2)',
        s3: 'var(--s-3)',
        s4: 'var(--s-4)',
        s5: 'var(--s-5)',
        s6: 'var(--s-6)',
        s7: 'var(--s-7)',
        s8: 'var(--s-8)',
        s9: 'var(--s-9)',
        s10: 'var(--s-10)',
      },
      boxShadow: {
        1: 'var(--e-1)',
        2: 'var(--e-2)',
        3: 'var(--e-3)',
        4: 'var(--e-4)',
        'glow-ai': 'var(--e-glow-ai)',
        'brand-glow': 'var(--brand-glow)',
      },
      fontFamily: {
        display: ['var(--font-display)', 'ui-sans-serif', 'system-ui'],
        mono: ['var(--font-mono)', 'ui-monospace', 'monospace'],
        editorial: ['var(--font-editorial)', 'serif'],
      },
      transitionTimingFunction: {
        out: 'var(--ease-out)',
        inout: 'var(--ease-in-out)',
        spring: 'var(--ease-spring)',
      },
      transitionDuration: {
        fast:    '140ms',
        base:    '260ms',
        slow:    '480ms',
        ambient: '1200ms',
      },
      animation: {
        'message-enter': 'message-enter 320ms var(--ease-spring) both',
        'sparkle-pulse': 'sparkle-pulse 1200ms var(--ease-spring) infinite',
        'thinking-dot':  'thinking-dot 1000ms var(--ease-in-out) infinite',
        'mesh-drift':    'mesh-drift 28s var(--ease-in-out) infinite',
      },
      backdropBlur: {
        1: '8px',
        2: '18px',
        3: '32px',
      },
      letterSpacing: {
        tight: 'var(--tracking-tight)',
        normal: 'var(--tracking-normal)',
        label: 'var(--tracking-label)',
        eyebrow: 'var(--tracking-eyebrow)',
      },
    },
  },
  plugins: [],
};

export default config;
