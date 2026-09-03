import React from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Ionicons } from '@expo/vector-icons';
import { useCouponStore } from '@/store/useCouponStore';
import { BRAND } from '@/constants/Colors';

export function WelcomeCouponModal() {
  const { welcomeCouponData, clearWelcomeCoupon } = useCouponStore();
  const [copied, setCopied] = React.useState(false);

  if (!welcomeCouponData) return null;

  const handleCopy = async () => {
    await Clipboard.setStringAsync(welcomeCouponData.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Cálculo Dinámico de Días de Urgencia
  const daysLeft = Math.max(1, Math.ceil((new Date(welcomeCouponData.expires_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24)));
  
  // Formatear el valor según el tipo: 'percentage' → "10%", 'fixed'/'amount'/otros → "$10.000 COP"
  const isPercentage = welcomeCouponData.discount_type === 'percentage';
  const discountValue = welcomeCouponData.discount_value ?? 0;
  const formattedDiscount = isPercentage
    ? `${discountValue}%`
    : `$${discountValue.toLocaleString('es-CO')} COP`;
    
  const formattedMinOrder = `$${(welcomeCouponData.min_order_amount ?? 0).toLocaleString('es-CO')} COP`;

  return (
    <Modal
      visible={!!welcomeCouponData}
      transparent
      animationType="slide"
      onRequestClose={clearWelcomeCoupon}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <TouchableOpacity style={styles.closeButton} onPress={clearWelcomeCoupon}>
            <Ionicons name="close" size={24} color={BRAND.slate} />
          </TouchableOpacity>

          <View style={styles.iconContainer}>
             <Ionicons name="gift-outline" size={32} color={BRAND.moss} />
          </View>

          <Text style={styles.title}>¡Bienvenido al Club LaTortaria!</Text>
          
          <Text style={styles.body}>
            Tu regalo de <Text style={styles.highlight}>{formattedDiscount}</Text> ha sido asegurado con éxito.
          </Text>

          <View style={styles.ticket}>
            <View style={[styles.cutout, styles.cutoutLeft]} />
            <View style={[styles.cutout, styles.cutoutRight]} />
            
            <Text style={styles.ticketLabel}>CÓDIGO DE REGALO</Text>
            <Text style={styles.ticketCode}>{welcomeCouponData.code}</Text>

            <TouchableOpacity
              style={styles.copyButton}
              activeOpacity={0.8}
              onPress={handleCopy}>
              <Ionicons name={copied ? "checkmark-circle" : "copy-outline"} size={18} color={copied ? BRAND.moss : BRAND.slate} />
              <Text style={[styles.copyButtonText, copied && { color: BRAND.moss }]}>
                {copied ? '¡Copiado!' : 'Copiar código'}
              </Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.footerText}>
            Válido por los próximos <Text style={{ fontWeight: 'bold' }}>{daysLeft} días</Text> en pedidos superiores a <Text style={{ fontWeight: 'bold' }}>{formattedMinOrder}</Text>. Tu código también fue enviado a tu correo electrónico.
          </Text>

          <TouchableOpacity 
            style={styles.primaryButton} 
            activeOpacity={0.85} 
            onPress={clearWelcomeCoupon}>
            <Text style={styles.primaryButtonText}>Continuar explorando pasteles</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  card: {
    backgroundColor: BRAND.cream,
    borderRadius: 24,
    padding: 24,
    width: '100%',
    maxWidth: 340,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 5,
    position: 'relative',
  },
  closeButton: {
    position: 'absolute',
    top: 16,
    right: 16,
    zIndex: 10,
    padding: 4,
  },
  iconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: BRAND.mist,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: '900',
    color: BRAND.ink,
    textAlign: 'center',
    marginBottom: 8,
  },
  body: {
    fontSize: 14,
    color: BRAND.slate,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 20,
  },
  highlight: {
    fontWeight: 'bold',
    color: BRAND.moss,
  },
  ticket: {
    width: '100%',
    backgroundColor: BRAND.paper,
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#FCD34D', // amber-300 from web
    padding: 20,
    alignItems: 'center',
    marginBottom: 20,
    position: 'relative',
  },
  cutout: {
    position: 'absolute',
    top: '50%',
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: BRAND.cream,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#FCD34D',
    marginTop: -12,
  },
  cutoutLeft: {
    left: -13,
    borderRightColor: 'transparent',
    borderTopColor: 'transparent',
    borderBottomColor: 'transparent',
    transform: [{ rotate: '45deg' }],
  },
  cutoutRight: {
    right: -13,
    borderLeftColor: 'transparent',
    borderTopColor: 'transparent',
    borderBottomColor: 'transparent',
    transform: [{ rotate: '-45deg' }],
  },
  ticketLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#9CA3AF', // gray-400
    letterSpacing: 1.5,
    marginBottom: 8,
  },
  ticketCode: {
    fontSize: 26,
    fontWeight: '900',
    color: BRAND.ink,
    letterSpacing: 2,
    marginBottom: 16,
    fontFamily: 'SpaceMono', // Usando la fuente mono cargada en _layout.tsx
  },
  copyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: BRAND.mist,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    width: '100%',
  },
  copyButtonText: {
    marginLeft: 8,
    fontSize: 14,
    fontWeight: '700',
    color: BRAND.slate,
  },
  footerText: {
    fontSize: 12,
    color: BRAND.slate,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 24,
  },
  primaryButton: {
    backgroundColor: BRAND.ink,
    width: '100%',
    height: 50,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    color: BRAND.paper,
    fontSize: 15,
    fontWeight: '700',
  },
});
