import * as SecureStore from 'expo-secure-store';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { supabase } from '@/lib/supabase';

const TOKEN_KEY = 'lt_expo_push_token';
let lastSynced: string | null = null; // evita escrituras repetidas en la misma ejecución

/**
 * Si el permiso del sistema ya está concedido, asocia el token de ESTE dispositivo al usuario
 * que acaba de iniciar sesión. Nunca pide permiso. Usa UPDATE (no crea filas en profiles).
 */
export async function syncPushTokenIfGranted(userId: string): Promise<void> {
  try {
    if (!Device.isDevice) return;
    const projectId: string | undefined = Constants.expoConfig?.extra?.eas?.projectId;
    if (!projectId) return;
    const { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') return;

    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    const key = `${userId}:${token}`;
    if (lastSynced === key) return;

    const { error } = await supabase
      .from('profiles')
      .update({ expo_push_token: token, updated_at: new Date().toISOString() })
      .eq('id', userId);
    if (error) {
      console.error('[PUSH] No se pudo sincronizar el token:', error.message);
      return;
    }
    lastSynced = key;
    await SecureStore.setItemAsync(TOKEN_KEY, token);
  } catch (e) {
    console.error('[PUSH] Excepción sincronizando token:', e);
  }
}

/** Desvincula el token de este dispositivo del usuario. Llamar ANTES de signOut (sesión aún válida). */
export async function clearPushToken(userId: string | undefined): Promise<void> {
  try {
    if (userId) {
      await supabase
        .from('profiles')
        .update({ expo_push_token: null, updated_at: new Date().toISOString() })
        .eq('id', userId);
    }
  } catch (e) {
    console.error('[PUSH] Error limpiando token remoto:', e);
  } finally {
    lastSynced = null;
    try {
      await SecureStore.deleteItemAsync(TOKEN_KEY);
    } catch {
      /* sin efecto */
    }
  }
}
