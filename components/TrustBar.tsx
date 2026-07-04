import { Feather } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';

import { BRAND } from '@/constants/Colors';

const ITEMS = [
  { icon: 'truck' as const, label: 'Mismo día' },
  { icon: 'award' as const, label: 'Artesanal' },
  { icon: 'edit-2' as const, label: 'Personalizable' },
  { icon: 'shield' as const, label: 'Pago seguro' },
];

export function TrustBar() {
  return (
    <View style={styles.container}>
      {ITEMS.map(({ icon, label }) => (
        <View key={label} style={styles.item}>
          <Feather name={icon} size={16} color={BRAND.moss} />
          <Text style={styles.label}>{label}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: BRAND.paper,
    borderRadius: 16,
    padding: 12,
    marginHorizontal: 12,
    marginTop: 12,
    shadowColor: BRAND.ink,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  item: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  label: {
    fontSize: 11,
    fontWeight: '600',
    color: BRAND.ink,
    textAlign: 'center',
  },
});
