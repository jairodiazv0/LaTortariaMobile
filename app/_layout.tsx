import { useFonts } from 'expo-font';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider, useRouter } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import * as Linking from 'expo-linking';
import 'react-native-reanimated';

import { useColorScheme } from '@/components/useColorScheme';
import { useCartStore } from '@/store/useCartStore';
import { supabase } from '@/lib/supabase';

export {
  ErrorBoundary,
} from 'expo-router';

export const unstable_settings = {
  initialRouteName: '(tabs)',
};

SplashScreen.preventAutoHideAsync();

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

function RootLayoutNav() {
  const colorScheme = useColorScheme();
  const router = useRouter();
  const setVerifyingPayment = useCartStore((s) => s.setVerifyingPayment);

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

        router.push('/(tabs)/profile');
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
        <Stack.Screen name="modal" options={{ presentation: 'modal' }} />
      </Stack>
    </ThemeProvider>
  );
}