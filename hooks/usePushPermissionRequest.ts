import * as SecureStore from 'expo-secure-store';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { supabase } from '../lib/supabase';

export function usePushPermissionRequest() {
  /**
   * Determina si el usuario es elegible para ver el modal.
   * True únicamente si la clave 'lt_push_permission_asked' no ha sido creada.
   */
  const checkPushEligibility = async (): Promise<boolean> => {
    try {
      const asked = await SecureStore.getItemAsync('lt_push_permission_asked');
      return asked === null;
    } catch (error) {
      console.error('[PUSH v1] Error leyendo elegibilidad en SecureStore:', error);
      return false;
    }
  };

  /**
   * Gestiona la solicitud de permisos, guarda localmente y sincroniza con Supabase.
   * ASIMETRÍA DE CASO DE BORDE v1: En iOS, expo-secure-store guarda los datos en el Keychain,
   * el cual sobrevive a desinstalaciones de la app. Si un usuario de iPhone reinstala la app,
   * 'lt_push_permission_asked' seguirá siendo 'true' y no se volverá a mostrar el modal. 
   * En Android, EncryptedSharedPreferences se destruye al desinstalar, por lo que el flujo
   * se reiniciará. Se acepta este comportamiento asimétrico para la v1 de producción.
   */
  const requestPushPermission = async (): Promise<'granted' | 'denied' | 'skipped'> => {
    try {
      // 1. Guard obligatorio para simuladores y emuladores
      if (!Device.isDevice) {
        console.log('[PUSH v1] Ejecución en simulador. Flujo omitido.');
        return 'skipped';
      }

      // 2. Guard obligatorio para verificar el ID de proyecto en EAS Build
      const projectId: string | undefined = Constants.expoConfig?.extra?.eas?.projectId;
      if (!projectId) {
        console.error('[PUSH v1] Error: projectId de EAS no encontrado en Constants.');
        return 'denied';
      }

      // 3. Solicitar permisos nativos de forma unificada (POST_NOTIFICATIONS en Android 13+ / iOS)
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;

      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }

      if (finalStatus !== 'granted') {
        return 'denied';
      }

      // 4. Obtener el token oficial pasando el projectId requerido por EAS
      const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
      const token = tokenData.data;

      // 5. Almacenamiento local seguro
      await SecureStore.setItemAsync('lt_expo_push_token', token);

      // 6. Sincronización con Supabase replicando estrictamente el patrón del archivo cart.tsx
      // (async/await, try/catch, console.error sin interferir con la UX)
      try {
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (!authError && user?.id) {
          const { error: upsertError } = await supabase
            .from('profiles')
            .upsert({
              id: user.id,
              expo_push_token: token,
              updated_at: new Date().toISOString(),
            }, { onConflict: 'id' });

          if (upsertError) {
            console.error('[PUSH v1] Error guardando token en tabla profiles:', upsertError.message);
          }
        }
      } catch (supabaseError) {
        console.error('[PUSH v1] Excepción en persistencia remota de Supabase:', supabaseError);
      }

      return 'granted';
    } catch (globalError) {
      console.error('[PUSH v1] Excepción general en requestPushPermission:', globalError);
      return 'denied';
    }
  };

  return {
    checkPushEligibility,
    requestPushPermission,
  };
}
