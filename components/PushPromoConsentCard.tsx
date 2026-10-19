import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Linking, StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { supabase } from '@/lib/supabase';
import { usePushPermissionRequest } from '@/hooks/usePushPermissionRequest';

const API_BASE = process.env.EXPO_PUBLIC_API_BASE_URL ?? 'https://www.latortaria.com';

// Mismo texto que PUSH_CONSENT_COPY.label en el servidor (lib/consent/constants.ts).
const PUSH_CONSENT_LABEL =
  'Quiero recibir ofertas, cupones y novedades de La Tortaria por notificaciones en mi celular. Puedo retirar mi autorización cuando quiera.';

const C = { rose: '#C8745A', ink: '#2C2018', inkMid: '#6B5744', divider: '#EDE4D8', warn: '#B5451B' };

type Status = 'loading' | 'on' | 'off';

/** Interruptor de autorización de promociones por push (apagado por defecto, evidencia en el servidor). */
export function PushPromoConsentCard() {
  const { requestPushPermission } = usePushPermissionRequest();
  const [status, setStatus] = useState<Status>('loading');
  const [busy, setBusy] = useState(false);
  const [osDenied, setOsDenied] = useState(false);

  const call = useCallback(async (method: 'GET' | 'POST', body?: object) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('Sin sesión');
    return fetch(`${API_BASE}/api/consent/push`, {
      method,
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  }, []);

  const refresh = useCallback(async () => {
    try {
      const res = await call('GET');
      const json = res.ok ? await res.json() : null;
      setStatus(json?.subscribed === true ? 'on' : 'off');
    } catch {
      setStatus('off');
    }
    try {
      const { status: os } = await Notifications.getPermissionsAsync();
      setOsDenied(os !== 'granted');
    } catch {
      /* sin efecto */
    }
  }, [call]);

  useEffect(() => { void refresh(); }, [refresh]);

  const onToggle = async (next: boolean) => {
    if (busy) return;
    setBusy(true);
    try {
      if (next) {
        // 1) Permiso del sistema (necesario para poder entregar la notificación)
        // Solo en desarrollo (__DEV__) y emulador: se omite el permiso del sistema para poder probar
        // el flujo de consentimiento. En builds de producción __DEV__ es false y esto nunca aplica.
        const perm = __DEV__ && !Device.isDevice ? 'granted' : await requestPushPermission();
        if (perm !== 'granted') {
          Alert.alert(
            'Activa las notificaciones',
            'Para recibir ofertas, permite las notificaciones de La Tortaria en los ajustes de tu teléfono.',
            [{ text: 'Ahora no', style: 'cancel' }, { text: 'Abrir ajustes', onPress: () => Linking.openSettings() }],
          );
          return;
        }
        setOsDenied(false);
      }
      // 2) Evidencia de la autorización (o del retiro) en el servidor
      const res = await call('POST', { action: next ? 'opt_in' : 'opt_out', source: 'app_settings' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setStatus(next ? 'on' : 'off');
    } catch {
      Alert.alert('No se pudo guardar', 'Revisa tu conexión e inténtalo de nuevo.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={st.wrap}>
      <View style={st.header}>
        <Feather name="bell" size={16} color={C.rose} />
        <Text style={st.title}>Ofertas y novedades</Text>
        {status === 'loading' || busy ? (
          <ActivityIndicator size="small" color={C.rose} />
        ) : (
          <Switch
            value={status === 'on'}
            onValueChange={onToggle}
            trackColor={{ false: C.divider, true: C.rose }}
            thumbColor="#FFFFFF"
          />
        )}
      </View>
      <Text style={st.label}>{PUSH_CONSENT_LABEL}</Text>
      <TouchableOpacity onPress={() => Linking.openURL(`${API_BASE}/legal/privacidad`)} activeOpacity={0.7}>
        <Text style={st.link}>Política de tratamiento de datos</Text>
      </TouchableOpacity>
      {status === 'on' && osDenied && (
        <TouchableOpacity onPress={() => Linking.openSettings()} activeOpacity={0.7}>
          <Text style={st.warn}>
            Las notificaciones están desactivadas en los ajustes del teléfono. Toca para activarlas.
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const st = StyleSheet.create({
  wrap: { paddingVertical: 14, borderTopWidth: 1, borderTopColor: C.divider, marginTop: 12, gap: 6 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { flex: 1, fontSize: 15, fontWeight: '700', color: C.ink },
  label: { fontSize: 12.5, lineHeight: 18, color: C.inkMid },
  link: { fontSize: 12.5, color: C.rose, textDecorationLine: 'underline' },
  warn: { fontSize: 12.5, lineHeight: 18, color: C.warn, marginTop: 4 },
});
