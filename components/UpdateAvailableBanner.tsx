import React from 'react';
import { View, Text, TouchableOpacity, Linking, StyleSheet, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface UpdateAvailableBannerProps {
  visible: boolean;
  storeUrl: string | null;
  onDismiss: () => void;
}

export function UpdateAvailableBanner({ visible, storeUrl, onDismiss }: UpdateAvailableBannerProps) {
  if (!visible) return null;

  const handleUpdate = () => {
    if (storeUrl) {
      Linking.openURL(storeUrl);
    }
  };

  return (
    <View style={styles.container} pointerEvents="box-none">
      <View style={styles.banner}>
        <View style={styles.content}>
          <Text style={styles.title}>Nueva versión disponible</Text>
          <Text style={styles.body}>Actualiza para disfrutar de las últimas novedades.</Text>
        </View>

        <View style={styles.actions}>
          <TouchableOpacity style={styles.updateButton} activeOpacity={0.85} onPress={handleUpdate}>
            <Text style={styles.updateButtonText}>Actualizar</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.closeButton}
            activeOpacity={0.7}
            onPress={onDismiss}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="close" size={20} color="#666666" />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: Platform.OS === 'ios' ? 34 : 24,
    left: 16,
    right: 16,
    zIndex: 9999,
  },
  banner: {
    backgroundColor: '#FAF7F2',
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#E8E0D5',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 6,
  },
  content: {
    flex: 1,
    marginRight: 10,
  },
  title: {
    fontSize: 14,
    fontWeight: '700',
    color: '#2C1810',
    marginBottom: 2,
  },
  body: {
    fontSize: 12,
    color: '#666666',
    lineHeight: 16,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  updateButton: {
    backgroundColor: '#C0392B',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
  },
  updateButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13,
  },
  closeButton: {
    padding: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
