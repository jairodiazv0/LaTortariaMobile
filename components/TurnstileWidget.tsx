/**
 * TurnstileWidget.tsx — Widget de verificación CAPTCHA Cloudflare Turnstile
 * LaTortariaMobile
 *
 * Renderiza un <WebView> que carga la ruta /captcha en latortaria.com.
 * Esta página contiene el script oficial de Turnstile.
 * Al usar una URL real del dominio en lugar de inyectar HTML, Cloudflare
 * reconoce el origen como confiable y el token generado supera la validación
 * estricta de Supabase sin lanzar error 400020.
 *
 * Cuando el widget resuelve el challenge (modo "managed", generalmente invisible),
 * envía el token al componente padre via onSuccess(token).
 *
 * ARQUITECTURA (importante):
 *   Mobile y web comparten el MISMO widget de Cloudflare ("Latortaria-Ecommerce",
 *   modo Managed). No se usa un widget separado para mobile porque Supabase Auth
 *   solo permite configurar UN Secret Key en "Bot and Abuse Protection" — tener
 *   dos Site Keys distintas implicaría que una de las dos plataformas siempre
 *   recibiría error 400020 ("captcha protection: request disallowed").
 *
 * Uso:
 *   <TurnstileWidget
 *     onSuccess={(token) => ejecuteAuthWithCaptcha(token)}
 *     onError={(msg) => Alert.alert('CAPTCHA', msg)}
 *   />
 *
 * IMPORTANTE:
 *   - El timeout de 10s protege al usuario si no hay internet o Cloudflare no responde.
 *   - thirdPartyCookiesEnabled + sharedCookiesEnabled son necesarias: Turnstile
 *     requiere cookies entre latortaria.com y challenges.cloudflare.com.
 */

import React, { useRef, useState, useEffect, useCallback } from 'react';
import {
  View,
  StyleSheet,
  ActivityIndicator,
  Text,
  TouchableOpacity,
} from 'react-native';
import { WebView, WebViewMessageEvent } from 'react-native-webview';

// ─── Timeout de carga: si en este tiempo no llega el token, mostrar error ─────
const LOAD_TIMEOUT_MS = 30_000; // antes 10_000 — el modo interactivo necesita tiempo para que el usuario haga click

// ─── Props ────────────────────────────────────────────────────────────────────
interface TurnstileWidgetProps {
  /** Se llama con el token válido cuando el challenge se resuelve exitosamente. */
  onSuccess: (token: string) => void;
  /** Se llama si el widget no puede cargar o reporta un error interno. */
  onError?: (message: string) => void;
}

// ─── Componente ───────────────────────────────────────────────────────────────
export function TurnstileWidget({ onSuccess, onError }: TurnstileWidgetProps) {
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [key, setKey] = useState(0); // fuerza re-montaje del WebView al reintentar
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Iniciar / reiniciar el timeout ───────────────────────────────────────
  const startTimeout = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      setStatus('error');
      const msg = 'No se pudo cargar el verificador de seguridad. Revisa tu conexión a internet e intenta de nuevo.';
      setErrorMessage(msg);
      onError?.(msg);
    }, LOAD_TIMEOUT_MS);
  }, [onError]);

  useEffect(() => {
    startTimeout();
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [key, startTimeout]);

  // ── Manejar mensajes del WebView ─────────────────────────────────────────
  const handleMessage = useCallback(
    (event: WebViewMessageEvent) => {
      try {
        const parsed = JSON.parse(event.nativeEvent.data) as {
          type: 'SUCCESS' | 'ERROR' | 'EXPIRED';
          token?: string;
          message?: string;
          code?: string;
        };

        if (parsed.type === 'SUCCESS' && parsed.token) {
          if (timeoutRef.current) clearTimeout(timeoutRef.current);
          onSuccess(parsed.token);
        } else if (parsed.type === 'ERROR') {
          if (timeoutRef.current) clearTimeout(timeoutRef.current);
          const msg = `${parsed.message ?? 'Error de Turnstile'} (código: ${parsed.code ?? 'desconocido'})`;
          console.warn('[Turnstile Error]', parsed.code, parsed.message); // útil en logcat si vuelve a fallar
          setStatus('error');
          setErrorMessage(msg);
          onError?.(msg);
        } else if (parsed.type === 'EXPIRED') {
          // Token expirado — tratar como error para que el usuario reintente
          if (timeoutRef.current) clearTimeout(timeoutRef.current);
          const msg = 'La verificación de seguridad expiró. Por favor, intenta de nuevo.';
          setStatus('error');
          setErrorMessage(msg);
          onError?.(msg);
        }
      } catch {
        // Mensaje no JSON — ignorar
      }
    },
    [onSuccess, onError],
  );

  // ── Cuando el WebView termina de cargar el DOM ───────────────────────────
  const handleLoadEnd = useCallback(() => {
    setStatus('ready');
    // No cancelamos el timeout aquí porque "DOM cargado" ≠ "script de Turnstile
    // ejecutado". El timeout se cancela solo cuando llega el token (onSuccess).
  }, []);

  // ── Error de red en el WebView (ej. sin internet) ───────────────────────
  const handleError = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    const msg = 'No se pudo conectar con el verificador de seguridad. Revisa tu internet.';
    setStatus('error');
    setErrorMessage(msg);
    onError?.(msg);
  }, [onError]);

  // ── Reintentar ───────────────────────────────────────────────────────────
  const handleRetry = useCallback(() => {
    setStatus('loading');
    setErrorMessage('');
    setKey((k) => k + 1); // re-monta el WebView desde cero
  }, []);

  // ── Render ───────────────────────────────────────────────────────────────
  if (status === 'error') {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>{errorMessage}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={handleRetry} activeOpacity={0.85}>
          <Text style={styles.retryButtonText}>Reintentar</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Spinner mientras carga — se superpone al WebView */}
      {status === 'loading' && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="small" color="#C8745A" />
          <Text style={styles.loadingText}>Verificando seguridad…</Text>
        </View>
      )}

      <WebView
        key={key}
        //source={{ uri: 'https://latortaria.com/captcha' }}
        source={{ uri: 'https://latortaria.com/captcha?standalone=1' }}
        style={styles.webview}
        onMessage={handleMessage}
        onLoadEnd={handleLoadEnd}
        onError={handleError}
        onHttpError={handleError}
        scrollEnabled={false}
        showsVerticalScrollIndicator={false}
        showsHorizontalScrollIndicator={false}
        originWhitelist={['*']}
        keyboardDisplayRequiresUserAction={false}
        javaScriptEnabled
        domStorageEnabled
        // 👇 Necesario: Turnstile necesita cookies entre latortaria.com y challenges.cloudflare.com
        thirdPartyCookiesEnabled
        sharedCookiesEnabled
        userAgent="Mozilla/5.0 (Linux; Android 10; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36"
      />
    </View>
  );
}

// ─── Estilos ──────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    width: '100%',
    height: 300, position: 'relative'
  },
  webview: {
    width: '100%',
    height: 300,
    backgroundColor: 'transparent',
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'transparent',
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    zIndex: 10,
  },
  loadingText: {
    fontSize: 12,
    color: '#6B5744',
  },
  errorContainer: {
    width: '100%',
    paddingVertical: 12,
    paddingHorizontal: 4,
    alignItems: 'center',
    gap: 10,
  },
  errorText: {
    fontSize: 12,
    color: '#B5451B',
    textAlign: 'center',
    lineHeight: 17,
  },
  retryButton: {
    backgroundColor: '#C8745A',
    paddingVertical: 8,
    paddingHorizontal: 20,
    borderRadius: 10,
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },
});
