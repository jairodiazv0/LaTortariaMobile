import { StyleSheet, Text, View } from 'react-native';

export default function ExploreScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.label}>Pantalla de Explorar — Próximamente</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F5F7FA',
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: '#3A3A3C',
    textAlign: 'center',
    paddingHorizontal: 24,
  },
});
