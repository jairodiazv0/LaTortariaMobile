import React from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

interface PushPermissionModalProps {
  visible: boolean;
  onAccept: () => void;
  onDecline: () => void;
}

export function PushPermissionModal({ visible, onAccept, onDecline }: PushPermissionModalProps) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onDecline}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <Text style={styles.title}>¿Te avisamos cuando llegue tu pedido?</Text>
          <Text style={styles.body}>
            Activa las notificaciones para recibir el estado de tu entrega en tiempo real.
          </Text>

          <View style={styles.buttonContainer}>
            <TouchableOpacity 
              style={[styles.button, styles.primaryButton]} 
              activeOpacity={0.85} 
              onPress={onAccept}>
              <Text style={styles.primaryButtonText}>Sí, quiero saber</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={[styles.button, styles.secondaryButton]} 
              activeOpacity={0.85} 
              onPress={onDecline}>
              <Text style={styles.secondaryButtonText}>Ahora no</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)', // Fondo atenuado neutro
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  card: {
    backgroundColor: '#FFFFFF', // BRAND.surface
    borderRadius: 18, // Coherente con styles.card del carrito
    padding: 24,
    width: '100%',
    maxWidth: 320,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E5E5EA', // BRAND.border
    shadowColor: '#000000', // Sombra idéntica a styles.card
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2,
  },
  title: {
    fontSize: 16,
    fontWeight: '800',
    color: '#1A1A1A', // BRAND.textPrimary
    textAlign: 'center',
    marginBottom: 10,
    lineHeight: 22,
  },
  body: {
    fontSize: 13,
    color: '#8E8E93', // BRAND.textSecondary
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 20,
    paddingHorizontal: 6,
  },
  buttonContainer: {
    width: '100%',
    gap: 8,
  },
  button: {
    width: '100%',
    height: 46,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButton: {
    backgroundColor: '#FF6B00', // BRAND.orange oficial de acento
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  secondaryButton: {
    backgroundColor: 'transparent',
  },
  secondaryButtonText: {
    color: '#8E8E93', // BRAND.textSecondary
    fontSize: 13,
    fontWeight: '600',
  },
});
