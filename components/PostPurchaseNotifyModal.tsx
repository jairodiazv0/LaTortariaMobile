import React, { useEffect, useState } from 'react';
import { Linking, Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Feather } from '@expo/vector-icons';

const POLICY_URL = 'https://www.latortaria.com/legal/privacidad';

// Mismos textos que MARKETING_CONSENT_COPY / PUSH_CONSENT_COPY en el servidor (lib/consent/constants.ts).
const LABEL_PUSH =
  'Quiero recibir ofertas, cupones y novedades de La Tortaria por notificaciones en mi celular. Puedo retirar mi autorización cuando quiera.';
const LABEL_EMAIL_PUSH =
  'Quiero recibir ofertas, cupones y novedades de La Tortaria por correo electrónico y por notificaciones en mi celular. Puedo retirar mi autorización cuando quiera.';

export type NotifyMarketing = 'none' | 'push' | 'email_push';

interface Props {
  visible: boolean;
  /** true si aún no se ha pedido el permiso del sistema (avisos de pedido). */
  needOs: boolean;
  /** Qué autorización comercial ofrecer. La casilla SIEMPRE inicia desmarcada. */
  marketing: NotifyMarketing;
  onAccept: (wantsOffers: boolean) => void;
  onDecline: () => void;
}

export function PostPurchaseNotifyModal({ visible, needOs, marketing, onAccept, onDecline }: Props) {
  const [checked, setChecked] = useState(false);
  useEffect(() => { if (visible) setChecked(false); }, [visible]);

  const offer = marketing !== 'none';
  const primaryDisabled = !needOs && !checked; // sin permiso que pedir, el botón solo tiene sentido si marcó la casilla
  const primaryLabel = needOs ? 'Activar notificaciones' : 'Quiero recibirlas';

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDecline}>
      <View style={st.overlay}>
        <View style={st.card}>
          <Text style={st.title}>
            {needOs ? '¿Te avisamos cuando llegue tu pedido?' : 'Ofertas y novedades'}
          </Text>
          {needOs && (
            <Text style={st.body}>
              Activa las notificaciones para recibir el estado de tu entrega en tiempo real.
            </Text>
          )}

          {offer && (
            <TouchableOpacity
              style={st.consentRow}
              activeOpacity={0.8}
              onPress={() => setChecked((v) => !v)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked }}
            >
              <View style={[st.checkbox, checked && st.checkboxChecked]}>
                {checked && <Feather name="check" size={14} color="#FFFFFF" />}
              </View>
              <Text style={st.consentText}>
                {marketing === 'email_push' ? LABEL_EMAIL_PUSH : LABEL_PUSH}{' '}
                <Text style={st.link} onPress={() => Linking.openURL(POLICY_URL)}>
                  Política de tratamiento de datos
                </Text>
              </Text>
            </TouchableOpacity>
          )}

          <View style={st.buttons}>
            <TouchableOpacity
              style={[st.button, st.primary, primaryDisabled && st.primaryDisabled]}
              activeOpacity={0.85}
              disabled={primaryDisabled}
              onPress={() => onAccept(offer && checked)}
            >
              <Text style={st.primaryText}>{primaryLabel}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={st.button} activeOpacity={0.85} onPress={onDecline}>
              <Text style={st.secondaryText}>Ahora no</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const st = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 24 },
  card: { backgroundColor: '#FFFFFF', borderRadius: 18, padding: 24, width: '100%', maxWidth: 340, borderWidth: 1, borderColor: '#E5E5EA', elevation: 2 },
  title: { fontSize: 16, fontWeight: '800', color: '#1A1A1A', textAlign: 'center', marginBottom: 10, lineHeight: 22 },
  body: { fontSize: 13, color: '#8E8E93', textAlign: 'center', lineHeight: 18, marginBottom: 16 },
  consentRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, backgroundColor: '#F7F7FA', borderRadius: 12, borderWidth: 1, borderColor: '#E5E5EA', padding: 12, marginBottom: 16 },
  checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: '#C7C7CC', alignItems: 'center', justifyContent: 'center', marginTop: 1, backgroundColor: '#FFFFFF' },
  checkboxChecked: { backgroundColor: '#FF6B00', borderColor: '#FF6B00' },
  consentText: { flex: 1, fontSize: 12.5, color: '#3A3A3C', lineHeight: 18 },
  link: { color: '#FF6B00', textDecorationLine: 'underline', fontWeight: '600' },
  buttons: { gap: 8 },
  button: { width: '100%', height: 46, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  primary: { backgroundColor: '#FF6B00' },
  primaryDisabled: { opacity: 0.4 },
  primaryText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
  secondaryText: { color: '#8E8E93', fontSize: 13, fontWeight: '600' },
});
