import React from 'react';
import { View, ActivityIndicator, Text, StyleSheet, Platform } from 'react-native';

export default function AuthCallbackScreen() {
  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color="#C8745A" />
      <Text style={styles.text}>Autenticando con la pastelería...</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAF7F2', // Tu color BRAND.cream premium
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  text: {
    fontFamily: Platform.select({ ios: 'System', android: 'sans-serif' }),
    fontSize: 16,
    color: '#2C2018', // Tu color BRAND.ink
    fontWeight: '600',
  },
});
