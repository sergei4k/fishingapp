// StrikeFeed design tokens — the "fishfinder" direction.
// The neutral ladder goes canvas < surface < surfaceRaised so cards LIFT off the
// background (previously surfaces were darker than the canvas and receded).
export const theme = {
  colors: {
    // Interactive accent — the one committed water-cyan. Use for links,
    // small active indicators, and icon accents.
    primary: '#00a6fb',
    // Filled primary action buttons (Sign in, Join, Save, Confirm, Upload, …).
    // Deep enough to carry white text; the single blue every CTA now uses.
    primaryDark: '#0582ca',
    // Active / selected segmented states (map toggle, switches, filter pills).
    // Muted so it reads as "selected" without competing with CTAs.
    primaryMuted: '#0c4a6e',

    // Structural neutrals (deep-water ladder).
    background: '#0d1a2d',    // app canvas / full-screen containers (darkest)
    surface: '#16233b',       // raised cards, inputs, rows — lighter than canvas
    surfaceRaised: '#1e293b', // segments, insets, active states (lightest)
    border: '#807f7f',        // visible hairline

    text: {
      primary: '#e6eef8',
      secondary: '#94a3b8',
      muted: '#64748b',
    },

    // Semantic signals — kept separate from the accent so state reads at a glance.
    bite: '#34d399',   // good conditions / active bite
    heat: '#f59e0b',   // temperature, Pro, heads-up
    danger: '#ef4444', // errors, destructive actions, unread
  },
  // Typeface roles. Body is Inter (full Cyrillic, loaded per-weight and applied
  // automatically by the Text wrapper). Display is Oswald — condensed and
  // instrument-like, used with restraint on hero numbers and titles.
  fonts: {
    body: 'Inter_400Regular',
    bodyMedium: 'Inter_500Medium',
    bodySemibold: 'Inter_600SemiBold',
    bodyBold: 'Inter_700Bold',
    display: 'Oswald_500Medium',
    displaySemibold: 'Oswald_600SemiBold',
    displayBold: 'Oswald_700Bold',
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
  // One radius scale for rectangular surfaces, so corners stop varying ad hoc.
  // (Circular elements like avatars still use half their own width.)
  radius: {
    chip: 8,     // thumbnails, small chips
    control: 12, // inputs, buttons
    card: 16,    // cards, sheets, modals
    pill: 999,   // fully rounded pills / toggles
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
