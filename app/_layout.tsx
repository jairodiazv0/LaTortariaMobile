import { useFonts } from 'expo-font';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider, useRouter } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import * as Linking from 'expo-linking';
import 'react-native-reanimated';

import { useColorScheme } from '@/components/useColorScheme';
import { useCartStore } from '@/store/useCartStore';
import { supabase } from '@/lib/supabase'; // ← Asegúrate que este path coincide con tu proyecto

export {
  ErrorBoundary,
} from 'expo-router';

export const unstable_settings = {
  initialRouteName: '(tabs)',
};

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [loaded, error] = useFonts({
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

      // ── CASO 1: Callback de verificación de correo de Supabase Auth ──────────
      // Cuando el usuario hace clic en el email de verificación, Supabase redirige
      // a latortariamobile://auth/callback con el token en el fragmento (#).
      // El cliente de Supabase lo procesa automáticamente al llamar getSession().
      if (url.includes('latortariamobile://auth/callback')) {
        // El SDK de Supabase detecta el token en el fragmento de la URL y
        // levanta la sesión internamente. onAuthStateChange en profile.tsx
        // recibirá el evento SIGNED_IN y actualizará el estado de la app.
        await supabase.auth.getSession();
        // Redirigir al panel de cuenta para que el usuario vea su sesión activa
        router.push('/(tabs)/profile');
        return; // No continuar al bloque de checkout
      }

      // ── CASO 2: Callback de resultado de pago (Wompi) ─────────────────────────
      if (url.includes('latortariamobile://checkout/result')) {
        router.push('/(tabs)/cart');
        setVerifyingPayment(true);
      }
    };

    // App en background — escucha eventos de deep link entrantes
    const subscription = Linking.addEventListener('url', handleDeepLink);

    // Cold start — app estaba completamente cerrada
    Linking.getInitialURL().then((url) => {
      if (url) handleDeepLink({ url });
    });

    // Cleanup obligatorio — previene memory leaks y listeners duplicados
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
