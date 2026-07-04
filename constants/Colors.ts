export const BRAND = {
  cream: '#FAF7F0',
  paper: '#FFFFFF',
  mist: '#EEF2F7',
  ink: '#111827',
  slate: '#6B7280',
  lime: '#B8F28A',
  citron: '#9BEA6A',
  moss: '#2F6B4F',
  border: '#E5E7EB',
  divider: '#F3F4F6',
} as const;

const tintColorLight = BRAND.moss;
const tintColorDark = '#fff';

export default {
  light: {
    text: BRAND.ink,
    background: BRAND.cream,
    tint: tintColorLight,
    tabIconDefault: '#ccc',
    tabIconSelected: tintColorLight,
  },
  dark: {
    text: '#fff',
    background: '#000',
    tint: tintColorDark,
    tabIconDefault: '#ccc',
    tabIconSelected: tintColorDark,
  },
};
