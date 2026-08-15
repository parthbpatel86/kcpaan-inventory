// KC Paan — modern paan-themed palette. Clean, warm, simple.
export const colors = {
  // Brand
  primary: '#0F7B5A',       // deep paan green
  primaryDark: '#0A5C43',
  primaryLight: '#E3F3ED',
  accent: '#E8553D',        // warm terracotta (catechu/kattha tone)
  gold: '#D9A441',          // saffron/gold accent

  // Health / demand colors
  healthy: '#2BA84A',       // green — stock healthy
  low: '#F2B01E',           // amber — getting low
  order: '#E0473B',         // red — order ASAP

  // Neutrals
  bg: '#F6F7F5',
  surface: '#FFFFFF',
  surfaceAlt: '#F0F2EF',
  border: '#E2E6E1',
  text: '#1C2620',
  textMuted: '#6B7770',
  textLight: '#9AA59E',

  // Payment chips — one distinct colour per payment button so staff can pick
  // by colour + icon without reading the label.
  card: '#3D6FE0',
  cash: '#2BA84A',
  instore: '#8B5CF6',
  employee: '#C2571E',

  danger: '#E0473B',

  white: '#FFFFFF',
};

export const HEALTH = {
  healthy: { color: colors.healthy, label: 'Healthy', dot: '🟢' },
  low: { color: colors.low, label: 'Low', dot: '🟡' },
  order: { color: colors.order, label: 'Order ASAP', dot: '🔴' },
};

export const radius = { sm: 8, md: 14, lg: 20, xl: 28 };
export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 };

export const shadow = {
  card: {
    shadowColor: '#1C2620',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
};
