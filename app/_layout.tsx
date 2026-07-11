import { useFonts } from 'expo-font';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider, useRouter, useRootNavigationState } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState } from 'react';
import * as Linking from 'expo-linking';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import 'react-native-reanimated';

import { useColorScheme } from '@/components/useColorScheme';
import { useCartStore } from '@/store/useCartStore';
import { supabase } from '@/lib/supabase';
import { useCartAbandonmentNotification } from '@/hooks/useCartAbandonmentNotification';
import { PushPermissionModal } from '@/components/PushPermissionModal';
import { useNotificationStore } from '@/store/useNotificationStore';

export {
  ErrorBoundary,
} from 'expo-router';

export const unstable_settings = {
  initialRouteName: '(tabs)',
};

export const ANDROID_NOTIFICATION_CHANNEL_ID = 'latortaria-notifications';

SplashScreen.preventAutoHideAsync();

// API vigente de expo-notifications (v0.27+): shouldShowAlert está deprecado,
// se separa en shouldShowBanner (banner emergente) y shouldShowList (centro
// de notificaciones), porque iOS 14+ dividió esos dos comportamientos.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

// ─── HELPER — Extrae parámetros del fragmento hash de una URL ─────────────────
function extractParamsFromHash(urlStr: string): Record<string, string> | null {
  const hash = urlStr.split('#')[1];
  if (!hash) return null;
  return Object.fromEntries(new URLSearchParams(hash).entries());
}

export default function RootLayout() {
  const [loaded, error] = useFonts({
    // Al estar en app/ usamos un solo nivel hacia atrás para llegar a la raíz
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
  });

  useEffect(() => {
    if (error) throw error;
  }, [error]);

  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync();
    }
  }, [loaded]);

  if (!loaded) {
    return null;
  }

  return <RootLayoutNav />;
}

// ─── OBSERVADOR DE NOTIFICACIONES — navegación al presionar una alerta ───────
// Separado en su propio hook para no mezclar la lógica de deep links de auth/
// pago (arriba) con la de push notifications (independiente en su origen:
// una viene de Linking con esquema custom, la otra del sistema operativo).
function useNotificationObserver() {
  const router = useRouter();
  const rootNavigationState = useRootNavigationState();
  const isNavigationReady = !!rootNavigationState?.key;
  const [pendingUrl, setPendingUrl] = useState<string | null>(null);

  const handleRedirect = (notification: Notifications.Notification) => {
    const url = notification.request.content.data?.url;
    if (typeof url === 'string' && url.trim() !== '') {
      if (isNavigationReady) {
        router.push(url as any);
      } else {
        setPendingUrl(url);
      }
    }
  };

  useEffect(() => {
    let isMounted = true;

    // Cold start: la app estaba cerrada y el tap en la notificación la abrió
    Notifications.getLastNotificationResponseAsync().then((response) => {
      if (!isMounted || !response?.notification) return;
      handleRedirect(response.notification);
    });

    // App ya abierta (foreground o background)
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      handleRedirect(response.notification);
    });

    return () => {
      isMounted = false;
      subscription.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isNavigationReady]);

  useEffect(() => {
    if (isNavigationReady && pendingUrl) {
      router.push(pendingUrl as any);
      setPendingUrl(null);
    }
  }, [isNavigationReady, pendingUrl]);
}

// ─── CONFIGURACIÓN NATIVA — canal Android + permisos ─────────────────────────
function useNativeNotificationSetup() {
  useEffect(() => {
    async function configureNativeChannels() {
      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync(ANDROID_NOTIFICATION_CHANNEL_ID, {
          name: 'Alertas Comerciales',
          importance: Notifications.AndroidImportance.MAX,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: '#C8745A',
        });
      }
      // NOTA: si ya tienes hooks/usePushPermissionRequest.ts + components/
      // PushPermissionModal.tsx manejando el permiso de push en otro lugar,
      // NO dupliques la solicitud aquí — ver el mensaje de abajo.
    }
    configureNativeChannels();
  }, []);
}

function RootLayoutNav() {
  const colorScheme = useColorScheme();
  const router = useRouter();
  const setVerifyingPayment = useCartStore((s) => s.setVerifyingPayment);

  // 2. Extrae los métodos de inicialización y limpieza del Store
  const fetchNotifications = useNotificationStore((s) => s.fetchNotifications);
  const subscribeToRealtime = useNotificationStore((s) => s.subscribeToRealtime);
  const clearLocalState = useNotificationStore((s) => s.clearLocalState);

  const {
    showAbandonmentModal,
    onAcceptAbandonmentPush,
    onDeclineAbandonmentPush,
  } = useCartAbandonmentNotification();

  useNotificationObserver();
  useNativeNotificationSetup();

  // 3. NUEVO: Listener de sesión global para poblar la campanita en Background
  useEffect(() => {
    // Verificar la sesión inicial al montar la app
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        fetchNotifications(session.user.id);
        subscribeToRealtime(session.user.id);
      }
    });

    // Escuchar cambios de estado (Login, Logout, Token renovado)
    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        fetchNotifications(session.user.id);
        subscribeToRealtime(session.user.id);
      } else {
        clearLocalState(); // Desconecta sockets y vacía el array al cerrar sesión
      }
    });

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, [fetchNotifications, subscribeToRealtime, clearLocalState]);

  useEffect(() => {
    const handleDeepLink = async (event: { url: string }) => {
      const { url } = event;

      // ── CASO 1: Callback de verificación de correo / OAuth de Supabase ──
      if (url.includes('latortariamobile://auth/callback')) {
        const params = extractParamsFromHash(url);

        if (params?.access_token && params?.refresh_token) {
          const { error } = await supabase.auth.setSession({
            access_token: params.access_token,
            refresh_token: params.refresh_token,
          });

          if (error && __DEV__) {
            console.warn('[Auth] setSession error:', error.message);
          }
        } else {
          await supabase.auth.getSession();
        }

        // Redirigir al panel de cuenta para que el usuario vea su sesión activa.
        // ⚡ ¡CORREGIDO! Agregamos un pequeño delay para permitir que el árbol nativo de
        // navegación se monte por completo en un Cold Start, evitando el flash de "Screen doesn't exist".
        setTimeout(() => {
          router.replace('/'); // [AUTH-REDIRECT]
        }, 400);

        return;
      }

      // ── CASO 2: Callback de resultado de pago (Wompi) ────────────────────────
      if (url.includes('latortariamobile://checkout/result')) {
        router.push('/(tabs)/cart');
        setVerifyingPayment(true);
      }
    };

    const subscription = Linking.addEventListener('url', handleDeepLink);

    Linking.getInitialURL().then((url) => {
      if (url) handleDeepLink({ url });
    });

    return () => subscription.remove();
  }, []);

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="modal" options={{ presentation: 'modal', headerShown: false }} />
      </Stack>
      <PushPermissionModal
        visible={showAbandonmentModal}
        title="¡Excelente elección! 🍰"
        body="A veces la vida pasa y olvidamos terminar la orden. ¿Quieres que te avisemos si dejas esto en el carrito?"
        onAccept={onAcceptAbandonmentPush}
        onDecline={onDeclineAbandonmentPush}
      />
    </ThemeProvider>
  );
}
