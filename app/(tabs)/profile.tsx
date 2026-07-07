/**
 * profile.tsx — Pantalla de Identidad y Cuenta
 * LaTortariaMobile · Arquitectura de Auth Blindada v3
 *
 * Máquina de estados:
 *   GUEST  → Formulario de Login / Registro + Botones sociales (Google, Apple)
 *   AUTHED → Panel con sub-menú: Pedidos | Favoritos | Mi Perfil
 *
 * Auth Social añadida en v3:
 *   - Google OAuth  → WebBrowser (compatible Expo Go, Android e iOS)
 *   - Apple Sign-In → Nativo expo-apple-authentication (solo iOS)
 *
 * Secciones del panel autenticado:
 *   'orders'    → Historial con acordeón de detalle de ítems
 *   'favorites' → Cuadrícula de productos marcados como favorito
 *   'profile'   → Datos de contacto editables
 *
 * Decisiones técnicas vs. schema real:
 *   - order_items: los snapshots (nombre, imagen, precio) vienen en la misma
 *     fila, así que se incluyen en la query inicial y se muestran al expandir.
 *     Sin fetch extra al abrir el acordeón.
 *   - favorites: user_interactions no tiene FK directa a product_media.
 *     Se resuelve con un join anidado PostgREST:
 *     products ( product_media!inner(...) ).
 *   - profiles UPDATE: funciona con RLS porque auth.uid() = id del usuario.
 *   - role ENUM: nunca se envía desde el cliente.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  FlatList,
  Image,
  StyleSheet,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Animated,
  Modal,
  Dimensions,
  Share,
  Clipboard,
} from 'react-native';
import { Stack, useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as WebBrowser from 'expo-web-browser';
import { supabase } from '@/lib/supabase';
import type { User } from '@supabase/supabase-js';
import { useCartStore } from '@/store/useCartStore';

// ─────────────────────────────────────────────────────────────────────────────
// MARCA — Tokens visuales de LaTortaria
// ─────────────────────────────────────────────────────────────────────────────
const BRAND = {
  cream: '#FAF7F2',
  rose: '#C8745A',
  roseDark: '#A85A42',
  roseLight: '#F5E6DF',
  ink: '#2C2018',
  inkMid: '#6B5744',
  inkLight: '#A8917E',
  divider: '#EDE4D8',
  white: '#FFFFFF',
  statusPaid: '#2D6A4F',
  statusPaidBg: '#D8F3DC',
  statusPending: '#B5451B',
  statusPendingBg: '#FDEBD0',
  statusPreparing: '#D47A1F',
  statusPreparingBg: '#FCECDD',
  statusShipped: '#6C5CE7',
  statusShippedBg: '#EFEFFA',
  statusDelivered: '#104F55',
  statusDeliveredBg: '#E0F2F1',
  statusCancelled: '#7B2D00',
  statusCancelledBg: '#FADBD8',
  fontDisplay: Platform.select({ ios: 'Georgia', android: 'serif' }) as string,
  fontBody: Platform.select({ ios: 'System', android: 'sans-serif' }) as string,
  radius: 14,
  radiusSm: 8,
};

// ─────────────────────────────────────────────────────────────────────────────
// TIPOS
// ─────────────────────────────────────────────────────────────────────────────
type AuthMode = 'login' | 'register';
type ActiveSection = 'orders' | 'favorites' | 'profile';

interface WelcomeCoupon {
  code: string;
  benefit: number;          // monto del descuento en COP
  min_order_amount: number; // compra mínima en COP
}

interface ProfileData {
  full_name: string;
  phone: string | null;
}

interface OrderItem {
  id: string;
  variant_id: string | null;
  product_name_snapshot: string | null;
  variant_name_snapshot: string | null;
  quantity: number;
  price_at_purchase: number;
  image_snapshot: string | null;
  // Join relacional hacia product_variants para recuperar el UUID real del producto
  product_variants?: { product_id: string } | null;
}

interface Order {
  id: string;
  status: string;
  total_amount: number;
  delivery_date: string;
  created_at: string;
  order_items: OrderItem[];
}

interface FavoriteProduct {
  id: string;         // interaction id
  product_id: string;
  name: string;
  rating_avg: number | null;
  coverUrl: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// VALIDACIONES — Colombia context
// ─────────────────────────────────────────────────────────────────────────────
const DISPOSABLE_DOMAINS = [
  'mailinator.com', 'yopmail.com', 'guerrillamail.com',
  'trashmail.com', 'tempmail.com', 'sharklasers.com',
  'throwam.com', 'getairmail.com', 'fakeinbox.com',
];

function validateEmail(email: string): string | null {
  const trimmed = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed))
    return 'Ingresa un correo electrónico válido.';
  if (DISPOSABLE_DOMAINS.includes(trimmed.split('@')[1]))
    return 'Este dominio de correo no está permitido.';
  return null;
}

function validatePhone(phone: string): string | null {
  if (phone && !/^3\d{9}$/.test(phone.trim()))
    return 'El celular debe tener 10 dígitos y comenzar en 3 (ej: 3001234567).';
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────
function formatCOP(amount: number): string {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
  }).format(amount);
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('es-CO', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
}

function getStatusLabel(status: string): { label: string; color: string; bg: string } {
  switch (status) {
    case 'pending_payment': return { label: 'Pago pendiente', color: BRAND.statusPending, bg: BRAND.statusPendingBg };
    case 'paid': return { label: 'Pagado (Confirmado)', color: BRAND.statusPaid, bg: BRAND.statusPaidBg };
    case 'preparing': return { label: 'En producción 🎂', color: BRAND.statusPreparing, bg: BRAND.statusPreparingBg };
    case 'shipped': return { label: 'En camino 🛵', color: BRAND.statusShipped, bg: BRAND.statusShippedBg };
    case 'delivered': return { label: 'Entregado ✓', color: BRAND.statusDelivered, bg: BRAND.statusDeliveredBg };
    case 'cancelled': return { label: 'Cancelado', color: BRAND.statusCancelled, bg: BRAND.statusCancelledBg };
    default: return { label: status, color: BRAND.inkMid, bg: BRAND.divider };
  }
}

// Mapa de progreso del stepper: qué pasos están completos (check) y cuál está
// "en curso" (iluminado, sin check todavía) para cada estado del ENUM.
// Índices de paso: 0=Pago · 1=En Cocina · 2=En Camino · 3=Entregado
const ORDER_STEP_PROGRESS: Record<string, { doneUpTo: number; currentIndex: number | null }> = {
  pending_payment: { doneUpTo: -1, currentIndex: 0 },
  paid: { doneUpTo: 0, currentIndex: null },
  preparing: { doneUpTo: 0, currentIndex: 1 },
  shipped: { doneUpTo: 1, currentIndex: 2 },
  delivered: { doneUpTo: 3, currentIndex: null },
};

const ORDER_STEP_LABELS = ['Pago', 'En Cocina', 'En Camino', 'Entregado'];

function OrderStepper({ status }: { status: string }) {
  // Regla UX: en pedidos cancelados el stepper no aporta información útil
  // y puede confundir al cliente sobre el estado real de su pastel.
  const progress = status === 'cancelled' ? null : ORDER_STEP_PROGRESS[status];
  if (!progress) return null;

  const { doneUpTo, currentIndex } = progress;

  return (
    <View style={s.stepperContainer}>
      <View style={s.stepperTrackRow}>
        {ORDER_STEP_LABELS.map((_, i) => {
          const isDone = i <= doneUpTo;
          const isCurrent = i === currentIndex;
          const isActive = isDone || isCurrent;
          const isLast = i === ORDER_STEP_LABELS.length - 1;
          return (
            <React.Fragment key={i}>
              <View style={[s.stepperDot, isActive && s.stepperDotActive]}>
                {isDone && <Feather name="check" size={9} color={BRAND.white} />}
              </View>
              {!isLast && (
                <View style={[s.stepperConnector, i <= doneUpTo && s.stepperConnectorActive]} />
              )}
            </React.Fragment>
          );
        })}
      </View>
      <View style={s.stepperLabelsRow}>
        {ORDER_STEP_LABELS.map((label, i) => {
          const isActive = i <= doneUpTo || i === currentIndex;
          return (
            <Text
              key={label}
              style={[s.stepperLabel, isActive && s.stepperLabelActive]}
              numberOfLines={1}
            >
              {label}
            </Text>
          );
        })}
      </View>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENTE PRINCIPAL
// ─────────────────────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────
// CONFETI — paleta de colores pastel para las partículas
// ─────────────────────────────────────────────────────────────────────────────
const CONFETTI_COLORS = [
  '#FFB3BA', '#FFDFBA', '#FFFFBA', '#BAFFC9', '#BAE1FF',
  '#E8BAFF', '#FFB3E6', '#C8F7C5', '#F7D6C8', '#C8E4F7',
];
const CONFETTI_COUNT = 18;
const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();

  // ── Auth ───────────────────────────────────────────────────────────────────
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [favorites, setFavorites] = useState<FavoriteProduct[]>([]);

  // ── Panel navigation ───────────────────────────────────────────────────────
  const [activeSection, setActiveSection] = useState<ActiveSection>('orders');
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);

  // ── Edit profile ───────────────────────────────────────────────────────────
  const [editMode, setEditMode] = useState(false);
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);

  // ── Auth form UI ───────────────────────────────────────────────────────────
  const [authMode, setAuthMode] = useState<AuthMode>('login');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');

  // ── Cupón de bienvenida — carga dinámica desde Supabase ────────────────────
  const [welcomeCoupon, setWelcomeCoupon] = useState<WelcomeCoupon | null>(null);

  // ── Celebración post-registro ──────────────────────────────────────────────
  const [showCelebration, setShowCelebration] = useState(false);
  const [showWelcomeModal, setShowWelcomeModal] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);

  // ── Refs de animación para el confeti ─────────────────────────────────────
  // Cada partícula tiene: translateY, translateX, opacity, rotate, scale
  const confettiAnims = useRef<{
    y: Animated.Value;
    x: Animated.Value;
    opacity: Animated.Value;
    rotate: Animated.Value;
    scale: Animated.Value;
  }[]>(
    Array.from({ length: CONFETTI_COUNT }, () => ({
      y: new Animated.Value(-60),
      x: new Animated.Value(0),
      opacity: new Animated.Value(0),
      rotate: new Animated.Value(0),
      scale: new Animated.Value(0.6),
    }))
  ).current;

  // ─────────────────────────────────────────────────────────────────────────
  // CARGA DE DATOS
  // ─────────────────────────────────────────────────────────────────────────
  const loadUserData = useCallback(async (userId: string) => {
    const [profileRes, ordersRes, favRes] = await Promise.all([
      // 1. Perfil
      supabase
        .from('profiles')
        .select('full_name, phone')
        .eq('id', userId)
        .single(),

      // 2. Pedidos + ítems (snapshots ya en la fila, sin fetch extra)
      supabase
        .from('orders')
        .select(`
          id, status, total_amount, delivery_date, created_at,
          order_items (
            id,
            variant_id,
            product_name_snapshot,
            variant_name_snapshot,
            quantity,
            price_at_purchase,
            image_snapshot,
            product_variants (
              product_id
            )
          )
        `)
        .eq('user_id', userId)
        .order('created_at', { ascending: false }),

      // 3. Favoritos — join anidado PostgREST:
      //    user_interactions → products → product_media (cover)
      //    product_media!inner filtra solo filas con is_cover=true
      supabase
        .from('user_interactions')
        .select(`
          id,
          product_id,
          products (
            name,
            rating_avg,
            product_media (
              url,
              is_cover
            )
          )
        `)
        .eq('user_id', userId)
        .eq('interaction_type', 'favorite')
        .order('created_at', { ascending: false }),
    ]);

    // ── Perfil — red de seguridad si el trigger no creó la fila ──────────
    if (profileRes.error?.code === 'PGRST116') {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      const fallbackName =
        (authUser?.user_metadata?.full_name as string | undefined)
        ?? authUser?.email?.split('@')[0]
        ?? 'Cliente';

      await supabase.from('profiles').upsert(
        { id: userId, full_name: fallbackName, phone: (authUser?.user_metadata?.phone as string | undefined) ?? null },
        { onConflict: 'id' }
      );

      const retry = await supabase.from('profiles').select('full_name, phone').eq('id', userId).single();
      if (retry.data) setProfile(retry.data as ProfileData);
    } else if (profileRes.data) {
      setProfile(profileRes.data as ProfileData);
    }

    // ── Pedidos ──────────────────────────────────────────────────────────
    if (ordersRes.data) setOrders(ordersRes.data as unknown as Order[]);

    // ── Favoritos — aplanar el join anidado ───────────────────────────────
    if (favRes.data) {
      const mapped: FavoriteProduct[] = favRes.data.map((row: any) => {
        const prod = row.products;
        const cover =
          prod?.product_media?.find((m: any) => m.is_cover)?.url
          ?? prod?.product_media?.[0]?.url
          ?? null;
        return {
          id: row.id,
          product_id: row.product_id,
          name: prod?.name ?? 'Producto',
          rating_avg: prod?.rating_avg ?? null,
          coverUrl: cover,
        };
      });
      setFavorites(mapped);
    }
  }, []);

  // ─────────────────────────────────────────────────────────────────────────
  // CARGA DINÁMICA DEL CUPÓN DE BIENVENIDA
  // Regla: nunca hardcodear montos — todo viene del estado welcomeCoupon
  // ─────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    const fetchWelcomeCoupon = async () => {
      try {
        const now = new Date().toISOString();
        const { data, error } = await supabase
          .from('coupons')
          .select('code, discount_value, min_order_amount, valid_until, is_active')
          .eq('code', 'WELCOME_2026')
          .eq('is_active', true)
          .single();

        if (error || !data) return;

        // Validar vigencia en cliente como segunda capa de seguridad
        if (data.valid_until && new Date(data.valid_until) < new Date(now)) return;

        setWelcomeCoupon({
          code: data.code,
          benefit: Number(data.discount_value),
          min_order_amount: Number(data.min_order_amount),
        });
      } catch {
        // Silencioso: el banner sencillamente no se muestra si falla
      }
    };
    fetchWelcomeCoupon();
  }, []);

  // ─────────────────────────────────────────────────────────────────────────
  // ANIMACIÓN DE CONFETI — dispara partículas cuando showCelebration = true
  // ─────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!showCelebration) return;

    const animations = confettiAnims.map((anim, i) => {
      const delay = i * 80;
      const startX = (Math.random() - 0.5) * SCREEN_W * 0.9;
      const endX = startX + (Math.random() - 0.5) * 120;
      const duration = 2200 + Math.random() * 1200;

      // Resetear posición inicial
      anim.y.setValue(-60);
      anim.x.setValue(startX);
      anim.opacity.setValue(0);
      anim.rotate.setValue(0);
      anim.scale.setValue(0.5 + Math.random() * 0.5);

      return Animated.sequence([
        Animated.delay(delay),
        Animated.parallel([
          Animated.timing(anim.y, {
            toValue: SCREEN_H * 0.85,
            duration,
            useNativeDriver: true,
          }),
          Animated.timing(anim.x, {
            toValue: endX,
            duration,
            useNativeDriver: true,
          }),
          Animated.sequence([
            Animated.timing(anim.opacity, { toValue: 1, duration: 300, useNativeDriver: true }),
            Animated.timing(anim.opacity, { toValue: 0, duration: 400, delay: duration - 700, useNativeDriver: true }),
          ]),
          Animated.timing(anim.rotate, {
            toValue: Math.random() > 0.5 ? 6 : -6,
            duration,
            useNativeDriver: true,
          }),
        ]),
      ]);
    });

    Animated.stagger(60, animations).start();
  }, [showCelebration]);

  // ─────────────────────────────────────────────────────────────────────────
  // AUTH LISTENER — eventos discriminados
  // ─────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      const cu = session?.user ?? null;
      setUser(cu);
      if (cu) loadUserData(cu.id);
      setLoading(false);
    });

    const { data: authListener } = supabase.auth.onAuthStateChange(async (event, session) => {
      // Bloque A — solo SIGNED_IN: navega al catálogo tras autenticación
      if (event === 'SIGNED_IN') {
        const cu = session?.user ?? null;
        setUser(cu);
        if (cu) await loadUserData(cu.id);
        router.replace('/'); // [AUTH-REDIRECT]
      }

      // Bloque B — TOKEN_REFRESHED y USER_UPDATED: actualiza datos sin navegar
      if (event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {
        const cu = session?.user ?? null;
        setUser(cu);
        if (cu) await loadUserData(cu.id);
      }
      if (event === 'SIGNED_OUT') {
        setUser(null); setProfile(null); setOrders([]); setFavorites([]);
        setFullName(''); setEmail(''); setPhone(''); setPassword('');
        setActiveSection('orders'); setExpandedOrderId(null);
      }
      setLoading(false);
    });

    return () => authListener.subscription.unsubscribe();
  }, [loadUserData]);

  // ⚡ ¡NUEVO! Escuchador de enfoque: Re-crea la consulta de datos cada vez que el usuario
  // entra a la pestaña de "Cuenta", asegurando sincronización instantánea con los cambios del carrito.
  useFocusEffect(
    useCallback(() => {
      if (user) {
        loadUserData(user.id);
      }
    }, [user, loadUserData])
  );

  // ─────────────────────────────────────────────────────────────────────────
  // REGISTRO
  // ─────────────────────────────────────────────────────────────────────────
  const handleRegister = async () => {
    if (!fullName.trim() || fullName.trim().length < 2)
      return Alert.alert('Nombre requerido', 'Ingresa tu nombre completo (mínimo 2 caracteres).');
    const emailError = validateEmail(email);
    if (emailError) return Alert.alert('Correo inválido', emailError);
    const phoneError = validatePhone(phone);
    if (phoneError) return Alert.alert('Celular inválido', phoneError);
    if (password.length < 6)
      return Alert.alert('Contraseña muy corta', 'La contraseña debe tener al menos 6 caracteres.');

    setSubmitting(true);
    try {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim().toLowerCase(),
        password,
        options: {
          data: { full_name: fullName.trim(), phone: phone.trim() || null },
          emailRedirectTo: 'latortariamobile://auth/callback',
        },
      });

      if (error) { Alert.alert('Error al registrarse', error.message); return; }

      if (data.session === null && (data.user?.identities?.length ?? 0) === 0) {
        Alert.alert('Cuenta existente', 'Ya tienes una cuenta con este correo. Por favor, inicia sesión.');
        setAuthMode('login');
        return;
      }

      if (data.session === null) {
        Alert.alert('¡Casi listo!', 'Te enviamos un correo de verificación. Revísalo para activar tu cuenta y vuelve a iniciar sesión.');
        return;
      }

      if (data.user) {
        // 🎉 Disparar celebración ANTES del upsert de perfil
        setShowCelebration(true);
        setShowWelcomeModal(true);

        await supabase.from('profiles').upsert(
          { id: data.user.id, full_name: fullName.trim(), phone: phone.trim() || null },
          { onConflict: 'id' }
        );
      }
    } finally {
      setSubmitting(false);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // COPIAR CÓDIGO AL PORTAPAPELES
  // Usa Share como fallback universal — Clipboard nativo sin dependencia extra
  // ─────────────────────────────────────────────────────────────────────────
  const handleCopyCode = async () => {
    if (!welcomeCoupon) return;
    try {
      Clipboard.setString(welcomeCoupon.code);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 3000);
    } catch {
      try {
        await Share.share({ message: welcomeCoupon.code });
        setCopiedCode(true);
        setTimeout(() => setCopiedCode(false), 3000);
      } catch {
        Alert.alert('Tu cupón de bienvenida', welcomeCoupon.code);
      }
    }
  };

  const handleCloseCelebration = () => {
    setShowCelebration(false);
    setShowWelcomeModal(false);
    setCopiedCode(false);
    // Resetear opacidad del confeti
    confettiAnims.forEach(a => a.opacity.setValue(0));
    router.replace('/'); // [AUTH-REDIRECT]
  };

  // ─────────────────────────────────────────────────────────────────────────
  // LOGIN
  // ─────────────────────────────────────────────────────────────────────────
  const handleLogin = async () => {
    const emailError = validateEmail(email);
    if (emailError) return Alert.alert('Correo inválido', emailError);
    if (!password) return Alert.alert('Contraseña requerida', 'Ingresa tu contraseña.');

    setSubmitting(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(), password,
      });
      if (error) {
        if (error.message.includes('Invalid login credentials'))
          Alert.alert('Credenciales incorrectas', 'El correo o la contraseña no coinciden.');
        else if (error.message.includes('Email not confirmed'))
          Alert.alert('Correo sin verificar', 'Revisa tu bandeja y confirma tu correo antes de ingresar.');
        else Alert.alert('Error', error.message);
      }
    } finally {
      setSubmitting(false);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // GOOGLE SIGN-IN — OAuth por navegador seguro (compatible con Expo Go)
  //
  // Flujo:
  //   1. Supabase genera la URL de consentimiento de Google
  //   2. WebBrowser abre un SFSafariViewController (iOS) o Chrome Custom Tab (Android)
  //   3. Google redirige a latortariamobile://auth/callback con tokens en el hash
  //   4. _layout.tsx intercepta el deep link, extrae tokens y llama setSession()
  //   5. onAuthStateChange(SIGNED_IN) actualiza esta pantalla automáticamente
  //
  // IMPORTANTE: skipBrowserRedirect: true es obligatorio. Sin él, el SDK intenta
  // hacer una redirección de ventana del navegador de escritorio que crashea en
  // entornos nativos.
  // ─────────────────────────────────────────────────────────────────────────
  const handleGoogleSignIn = async () => {
    setSubmitting(true);
    try {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: 'latortariamobile://auth/callback',
          skipBrowserRedirect: true,
        },
      });

      if (error) {
        Alert.alert('Error con Google', error.message);
        return;
      }

      if (data?.url) {
        // Abre el navegador nativo seguro. El resultado se maneja vía deep link
        // en _layout.tsx; no es necesario procesar el resultado de openBrowserAsync.
        await WebBrowser.openBrowserAsync(data.url);
      }
    } catch (e: any) {
      Alert.alert('Error con Google', e.message ?? 'No se pudo iniciar el flujo de Google. Intenta de nuevo.');
    } finally {
      setSubmitting(false);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // APPLE SIGN-IN — Nativo para iOS (SOLO se renderiza en iOS)
  //
  // Flujo:
  //   1. El sistema iOS muestra la hoja de consentimiento nativa de Apple
  //   2. Apple devuelve un identityToken JWT firmado
  //   3. Supabase valida el token criptográficamente y crea/recupera la sesión
  //   4. onAuthStateChange(SIGNED_IN) actualiza esta pantalla automáticamente
  //
  // ERR_CANCELED: error esperado cuando el usuario cierra la hoja de Apple.
  // No se muestra alerta para no interrumpir la experiencia.
  // ─────────────────────────────────────────────────────────────────────────
  const handleAppleSignIn = async () => {
    setSubmitting(true);
    try {
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });

      if (credential.identityToken) {
        const { error } = await supabase.auth.signInWithIdToken({
          provider: 'apple',
          token: credential.identityToken,
        });

        if (error) {
          Alert.alert('Error con Apple', error.message);
        }
        // Si es exitoso: onAuthStateChange(SIGNED_IN) actualiza la UI.
        // El upsert de seguridad en loadUserData maneja perfiles huérfanos.
      }
    } catch (e: any) {
      // ERR_CANCELED = usuario cerró la hoja de Apple. No es un error real.
      if (e.code === 'ERR_CANCELED') return;
      Alert.alert('Error con Apple', e.message ?? 'No se pudo iniciar el flujo de Apple. Intenta de nuevo.');
    } finally {
      setSubmitting(false);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // CERRAR SESIÓN
  // ─────────────────────────────────────────────────────────────────────────
  const handleSignOut = () => {
    Alert.alert('Cerrar sesión', '¿Estás segura de que deseas salir?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Cerrar sesión', style: 'destructive', onPress: () => supabase.auth.signOut() },
    ]);
  };

  // ─────────────────────────────────────────────────────────────────────────
  // GUARDAR PERFIL EDITADO
  // ─────────────────────────────────────────────────────────────────────────
  const handleSaveProfile = async () => {
    if (!editName.trim() || editName.trim().length < 2)
      return Alert.alert('Nombre requerido', 'El nombre debe tener al menos 2 caracteres.');
    const phoneError = validatePhone(editPhone);
    if (phoneError) return Alert.alert('Celular inválido', phoneError);

    setSavingProfile(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ full_name: editName.trim(), phone: editPhone.trim() || null })
        .eq('id', user!.id);

      if (error) {
        Alert.alert('Error al guardar', error.message);
      } else {
        setProfile({ full_name: editName.trim(), phone: editPhone.trim() || null });
        setEditMode(false);
        Alert.alert('¡Listo!', 'Tu información fue actualizada.');
      }
    } finally {
      setSavingProfile(false);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // ELIMINAR CUENTA
  // ─────────────────────────────────────────────────────────────────────────
  const handleDeleteAccount = (): void => {
    Alert.alert(
      '⚠️ Eliminar cuenta',
      '¿Estás completamente segura? Esta acción es irreversible y perderás todo tu historial de pedidos.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: async () => {
            setDeletingAccount(true);
            try {
              const { error } = await supabase.rpc('eliminar_mi_propia_cuenta');
              if (error) {
                Alert.alert('Error al eliminar', error.message);
              } else {
                // ⚡ ¡CORREGIDO! Forzamos el cierre de sesión local en el dispositivo.
                // Esto vacía el SecureStore, activa el evento SIGNED_OUT en el listener,
                // y transforma la interfaz al estado de Invitado de forma instantánea.
                await supabase.auth.signOut();

                Alert.alert('Cuenta eliminada', 'Tu información ha sido borrada con éxito.');
              }
            } finally {
              setDeletingAccount(false);
            }
          },
        },
      ],
    );
  };

  // ─────────────────────────────────────────────────────────────────────────
  // CANCELAR PEDIDO
  // ─────────────────────────────────────────────────────────────────────────
  const handleCancelOrder = (orderId: string) => {
    Alert.alert(
      'Cancelar pedido',
      '¿Deseas cancelar este pedido definitivamente? Esta acción no se puede deshacer.',
      [
        { text: 'No, volver', style: 'cancel' },
        {
          text: 'Sí, cancelar',
          style: 'destructive',
          onPress: async () => {
            // RPC seguro: la función de BD valida que el pedido pertenece
            // al usuario en sesión, respetando RLS sin necesidad de UPDATE directo.
            const { error } = await supabase.rpc('cancel_own_order', { order_id: orderId });
            if (error) {
              Alert.alert('Error', 'No se pudo cancelar el pedido. Intenta de nuevo.');
            } else {
              if (user) await loadUserData(user.id);
            }
          },
        },
      ],
    );
  };

  // ─────────────────────────────────────────────────────────────────────────
  // RETOMAR PEDIDO — Vuelca los ítems al carrito y redirige al checkout
  // ─────────────────────────────────────────────────────────────────────────
  const clearCart = useCartStore((s) => s.clearCart);
  const addItem = useCartStore((s) => s.addItem);
  const router = useRouter();

  const handleResumeOrder = async (order: Order) => {
    // 1. Vaciar carrito actual
    clearCart();

    // 2. Inyectar cada ítem del pedido original en el store
    for (const item of order.order_items) {
      if (!item.variant_id) continue; // seguridad: no añadir ítems sin variant_id
      // Extrae el product_id real del join relacional; cae en '' si no hay datos
      const realProductId = item.product_variants?.product_id ?? '';
      addItem({
        product_id: realProductId,
        variant_id: item.variant_id,
        name: item.product_name_snapshot ?? 'Producto',
        size_label: item.variant_name_snapshot ?? '',
        base_price: item.price_at_purchase,
        quantity: item.quantity,
        add_ons: [],
        image_url: item.image_snapshot ?? undefined,
      });
    }

    // 3. Marcar el pedido viejo como cancelado via RPC seguro (respeta RLS)
    await supabase.rpc('cancel_own_order', { order_id: order.id });

    // 4. Refrescar la lista de pedidos
    if (user) await loadUserData(user.id);

    // 5. Redirigir al carrito para que el usuario valide fechas, horas y stock
    router.push('/(tabs)/cart');
  };

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER — Carga inicial
  // ─────────────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <View style={[s.loadingContainer, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={BRAND.rose} />
        <Text style={s.loadingText}>Cargando tu cuenta…</Text>
      </View>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER — Formulario de acceso (invitado)
  // ─────────────────────────────────────────────────────────────────────────
  if (!user) {
    return (
      <KeyboardAvoidingView style={s.root} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>

        {/* ── CONFETI ANIMADO — se pinta sobre todo usando absolute ─────── */}
        {showCelebration && (
          <View style={s.confettiContainer} pointerEvents="none">
            {confettiAnims.map((anim, i) => {
              const color = CONFETTI_COLORS[i % CONFETTI_COLORS.length];
              const size = 8 + (i % 5) * 3; // tamaños variados: 8-20px
              const isCircle = i % 3 !== 0;
              return (
                <Animated.View
                  key={i}
                  style={[
                    s.confettiDot,
                    {
                      width: size,
                      height: isCircle ? size : size * 1.6,
                      borderRadius: isCircle ? size / 2 : 3,
                      backgroundColor: color,
                      opacity: anim.opacity,
                      transform: [
                        { translateX: anim.x },
                        { translateY: anim.y },
                        { scale: anim.scale },
                        {
                          rotate: anim.rotate.interpolate({
                            inputRange: [-6, 6],
                            outputRange: ['-180deg', '180deg'],
                          }),
                        },
                      ],
                    },
                  ]}
                />
              );
            })}
          </View>
        )}

        {/* ── MODAL DE BIENVENIDA POST-REGISTRO ──────────────────────────── */}
        <Modal
          visible={showWelcomeModal}
          transparent
          animationType="fade"
          statusBarTranslucent
          onRequestClose={handleCloseCelebration}
        >
          <View style={s.modalOverlay}>
            <View style={s.modalCard}>
              {/* Cabecera del modal */}
              <Text style={s.modalEmoji}>🎂</Text>
              <Text style={s.modalTitle}>¡Bienvenida a la familia{`\n`}de La Tortaria!</Text>

              <Text style={s.modalBody}>
                Tu cuenta ha sido creada con éxito.{`\n`}Hemos activado tu cupón de bienvenida:
              </Text>

              {/* Caja del cupón */}
              <View style={s.modalCouponBox}>
                <Feather name="gift" size={18} color={BRAND.rose} style={{ marginRight: 8 }} />
                <Text style={s.modalCouponCode}>
                  {welcomeCoupon?.code ?? 'WELCOME_2026'}
                </Text>
              </View>

              <Text style={s.modalBodySmall}>
                Úsalo en tu carrito de compras para ahorrar{` `}
                {welcomeCoupon ? formatCOP(welcomeCoupon.benefit) : ''} de inmediato.
              </Text>

              {/* Botón copiar */}
              <TouchableOpacity
                style={[s.copyButton, copiedCode && s.copyButtonCopied]}
                onPress={handleCopyCode}
                activeOpacity={0.82}
              >
                <Feather
                  name={copiedCode ? 'check' : 'copy'}
                  size={15}
                  color={copiedCode ? BRAND.statusPaid : BRAND.white}
                />
                <Text style={[s.copyButtonText, copiedCode && s.copyButtonTextCopied]}>
                  {copiedCode ? '¡Copiado al portapapeles!' : 'Copiar código'}
                </Text>
              </TouchableOpacity>

              {/* Botón cerrar */}
              <TouchableOpacity
                style={s.closeModalButton}
                onPress={handleCloseCelebration}
                activeOpacity={0.8}
              >
                <Text style={s.closeModalText}>Continuar →</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        <ScrollView
          contentContainerStyle={[s.scrollContent, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 32 }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >

          {/* ── BANNER DE INCENTIVO PARA INVITADOS — Tarjeta de Regalo ──── */}
          {welcomeCoupon && (
            <View style={s.welcomeBanner}>
              <View style={s.welcomeBannerInner}>
                <View style={s.welcomeBannerLeft}>
                  <View style={s.welcomeGiftBadge}>
                    <Feather name="gift" size={20} color={BRAND.rose} />
                  </View>
                </View>
                <View style={s.welcomeBannerContent}>
                  <Text style={s.welcomeBannerTitle}>
                    ¡Tu Primer Antojo va por nuestra cuenta!
                  </Text>
                  <Text style={s.welcomeBannerBody}>
                    Crea tu cuenta en solo{' '}
                    <Text style={s.welcomeBannerHighlight}>10 segundos</Text>
                    {' '}y te regalamos{' '}
                    <Text style={s.welcomeBannerHighlight}>
                      {formatCOP(welcomeCoupon.benefit)}
                    </Text>
                    {' '}para tu primer pedido.
                  </Text>
                  <Text style={s.welcomeBannerNote}>
                    Aplica para compras mayores a{' '}
                    {formatCOP(welcomeCoupon.min_order_amount)}
                  </Text>
                </View>
              </View>
            </View>
          )}

          {/* Marca */}
          <View style={s.brandHeader}>
            <Text style={s.brandIcon}>🎂</Text>
            <Text style={s.brandName}>La Tortaria</Text>
            <Text style={s.brandTagline}>{authMode === 'login' ? 'Bienvenida de vuelta' : 'Crea tu cuenta'}</Text>
          </View>

          {/* Tabs Login / Registro */}
          <View style={s.modeTabs}>
            {(['login', 'register'] as AuthMode[]).map((m) => (
              <TouchableOpacity
                key={m}
                style={[s.modeTab, authMode === m && s.modeTabActive]}
                onPress={() => setAuthMode(m)}
                activeOpacity={0.8}
              >
                <Text style={[s.modeTabText, authMode === m && s.modeTabTextActive]}>
                  {m === 'login' ? 'Iniciar sesión' : 'Registrarse'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Campos */}
          <View style={s.form}>
            {authMode === 'register' && (
              <FormField icon="user" label="Nombre completo" placeholder="Tu nombre"
                value={fullName} onChangeText={setFullName} autoCapitalize="words" />
            )}
            <FormField icon="mail" label="Correo electrónico" placeholder="correo@ejemplo.com"
              value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
            {authMode === 'register' && (
              <FormField icon="phone" label="Celular (opcional)" placeholder="3001234567"
                value={phone} onChangeText={setPhone} keyboardType="phone-pad" maxLength={10} />
            )}
            {/* Password con toggle */}
            <View style={s.inputGroup}>
              <Text style={s.inputLabel}>Contraseña</Text>
              <View style={s.inputWrapper}>
                <Feather name="lock" size={16} color={BRAND.inkLight} style={s.inputIcon} />
                <TextInput
                  style={[s.input, { flex: 1 }]}
                  placeholder={authMode === 'register' ? 'Mínimo 6 caracteres' : 'Tu contraseña'}
                  placeholderTextColor={BRAND.inkLight}
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPassword}
                  returnKeyType="done"
                  onSubmitEditing={authMode === 'login' ? handleLogin : handleRegister}
                />
                <TouchableOpacity onPress={() => setShowPassword(v => !v)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Feather name={showPassword ? 'eye-off' : 'eye'} size={16} color={BRAND.inkLight} />
                </TouchableOpacity>
              </View>
            </View>

            <TouchableOpacity
              style={[s.primaryButton, submitting && s.primaryButtonDisabled]}
              onPress={authMode === 'login' ? handleLogin : handleRegister}
              activeOpacity={0.85}
              disabled={submitting}
            >
              {submitting
                ? <ActivityIndicator color={BRAND.white} />
                : <Text style={s.primaryButtonText}>{authMode === 'login' ? 'Entrar' : 'Crear cuenta'}</Text>
              }
            </TouchableOpacity>

            <TouchableOpacity style={s.toggleMode} onPress={() => setAuthMode(authMode === 'login' ? 'register' : 'login')}>
              <Text style={s.toggleModeText}>
                {authMode === 'login' ? '¿No tienes cuenta? ' : '¿Ya tienes cuenta? '}
                <Text style={s.toggleModeLink}>{authMode === 'login' ? 'Regístrate' : 'Inicia sesión'}</Text>
              </Text>
            </TouchableOpacity>
          </View>

          {/* ── Divisor social ─────────────────────────────────────────────── */}
          <View style={s.socialDivider}>
            <View style={s.socialDividerLine} />
            <Text style={s.socialDividerText}>O entra con</Text>
            <View style={s.socialDividerLine} />
          </View>

          {/* ── Botones sociales ────────────────────────────────────────────── */}
          <View style={s.socialButtons}>

            {/* Google — disponible en Android e iOS */}
            <TouchableOpacity
              style={[s.socialButton, submitting && s.primaryButtonDisabled]}
              onPress={handleGoogleSignIn}
              activeOpacity={0.85}
              disabled={submitting}
            >
              {/* Icono SVG de Google via texto unicode — reemplaza con tu imagen si tienes */}
              <Text style={s.socialButtonIcon}>G</Text>
              <Text style={s.socialButtonText}>Continuar con Google</Text>
            </TouchableOpacity>

            {/* Apple — SOLO iOS. Condicional para evitar rechazo en Play Store */}
            {Platform.OS === 'ios' && (
              <AppleAuthentication.AppleAuthenticationButton
                buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
                buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
                cornerRadius={BRAND.radius}
                style={s.appleButton}
                onPress={handleAppleSignIn}
              />
            )}
          </View>

        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER — Panel autenticado
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <ScrollView
      style={s.root}
      contentContainerStyle={[s.scrollContent, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 32 }]}
      showsVerticalScrollIndicator={false}
    >
      {/* ── Encabezado de cuenta ─────────────────────────────────────────── */}
      <View style={s.accountHeader}>
        <View style={s.avatarCircle}>
          <Text style={s.avatarInitial}>
            {(profile?.full_name ?? user.email ?? 'U')[0].toUpperCase()}
          </Text>
        </View>
        <Text style={s.accountName}>{profile?.full_name ?? 'Bienvenida'}</Text>
        <Text style={s.accountEmail}>{user.email}</Text>
        {profile?.phone ? <Text style={s.accountPhone}>{profile.phone}</Text> : null}
      </View>

      {/* ── Sub-menú de secciones ────────────────────────────────────────── */}
      <View style={s.sectionNav}>
        {(
          [
            { key: 'orders', icon: 'shopping-bag', label: 'Mis Pedidos', count: orders.length },
            { key: 'favorites', icon: 'heart', label: 'Favoritos', count: favorites.length },
            { key: 'profile', icon: 'user', label: 'Mi Perfil', count: null },
          ] as { key: ActiveSection; icon: any; label: string; count: number | null }[]
        ).map(({ key, icon, label, count }) => {
          const active = activeSection === key;
          return (
            <TouchableOpacity
              key={key}
              style={[s.navCard, active && s.navCardActive]}
              onPress={() => setActiveSection(key)}
              activeOpacity={0.8}
            >
              <Feather name={icon} size={18} color={active ? BRAND.white : BRAND.inkMid} />
              <Text style={[s.navCardLabel, active && s.navCardLabelActive]}>{label}</Text>
              {count !== null && count > 0 && (
                <View style={[s.navBadge, active && s.navBadgeActive]}>
                  <Text style={[s.navBadgeText, active && s.navBadgeTextActive]}>{count}</Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      {/* ── SECCIÓN: MIS PEDIDOS ─────────────────────────────────────────── */}
      {activeSection === 'orders' && (
        <View style={s.section}>
          {orders.length === 0 ? (
            <View style={s.emptyState}>
              <Feather name="shopping-bag" size={40} color={BRAND.inkLight} />
              <Text style={s.emptyTitle}>Sin pedidos aún</Text>
              <Text style={s.emptyBody}>¡Tu primer pastel te espera!</Text>
            </View>
          ) : (
            // Regla de negocio: pedidos cancelados desaparecen de la vista del
            // cliente pero se conservan en BD para auditoría del administrador.
            (orders.filter((o) => o.status !== 'cancelled')).map((order) => {
              const { label, color, bg } = getStatusLabel(order.status);
              const expanded = expandedOrderId === order.id;
              return (
                <TouchableOpacity
                  key={order.id}
                  style={[s.orderCard, expanded && s.orderCardExpanded]}
                  onPress={() => setExpandedOrderId(expanded ? null : order.id)}
                  activeOpacity={0.85}
                >
                  <View style={s.orderCardTop}>
                    <View style={[s.statusBadge, { backgroundColor: bg }]}>
                      <Text style={[s.statusBadgeText, { color }]}>{label}</Text>
                    </View>
                    <View style={s.orderCardTopRight}>
                      <Text style={s.orderAmount}>{formatCOP(order.total_amount)}</Text>
                      <Feather
                        name={expanded ? 'chevron-up' : 'chevron-down'}
                        size={16}
                        color={BRAND.inkLight}
                        style={{ marginLeft: 6 }}
                      />
                    </View>
                  </View>

                  <View style={s.orderCardMeta}>
                    <Feather name="calendar" size={12} color={BRAND.inkLight} />
                    <Text style={s.orderMeta}>Entrega: {formatDate(order.delivery_date)}</Text>
                    <Text style={s.orderMetaDot}>·</Text>
                    <Text style={s.orderMeta}>{formatDate(order.created_at)}</Text>
                  </View>

                  {expanded && order.order_items.length > 0 && (
                    <View style={s.accordion}>
                      <OrderStepper status={order.status} />
                      <View style={s.accordionDivider} />
                      <Text style={s.accordionTitle}>Detalle del pedido</Text>
                      {order.order_items.map((item) => (
                        <View key={item.id} style={s.accordionItem}>
                          {item.image_snapshot ? (
                            <Image source={{ uri: item.image_snapshot }} style={s.itemImage} resizeMode="cover" />
                          ) : (
                            <View style={[s.itemImage, s.itemImagePlaceholder]}>
                              <Feather name="image" size={14} color={BRAND.inkLight} />
                            </View>
                          )}
                          <View style={s.itemInfo}>
                            <Text style={s.itemName} numberOfLines={2}>{item.product_name_snapshot ?? 'Producto'}</Text>
                            {item.variant_name_snapshot ? (
                              <Text style={s.itemVariant}>{item.variant_name_snapshot}</Text>
                            ) : null}
                            <Text style={s.itemQty}>× {item.quantity}</Text>
                          </View>
                          <Text style={s.itemPrice}>{formatCOP(item.price_at_purchase)}</Text>
                        </View>
                      ))}
                      <View style={s.accordionTotal}>
                        <Text style={s.accordionTotalLabel}>Total</Text>
                        <Text style={s.accordionTotalAmount}>{formatCOP(order.total_amount)}</Text>
                      </View>

                      {/* ── Acciones de pedido pendiente ─────────────────── */}
                      {order.status === 'pending_payment' && (
                        <View style={s.orderActionsRow}>
                          <TouchableOpacity
                            style={s.orderActionCancel}
                            onPress={() => handleCancelOrder(order.id)}
                            activeOpacity={0.75}
                          >
                            <Feather name="x-circle" size={14} color={BRAND.statusCancelled} />
                            <Text style={s.orderActionCancelText}>Cancelar pedido</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={s.orderActionResume}
                            onPress={() => handleResumeOrder(order)}
                            activeOpacity={0.8}
                          >
                            <Feather name="shopping-cart" size={14} color={BRAND.white} />
                            <Text style={s.orderActionResumeText}>Retomar pedido</Text>
                          </TouchableOpacity>
                        </View>
                      )}
                    </View>
                  )}
                </TouchableOpacity>
              );
            })
          )}
        </View>
      )}

      {/* ── SECCIÓN: FAVORITOS ───────────────────────────────────────────── */}
      {activeSection === 'favorites' && (
        <View style={s.section}>
          {favorites.length === 0 ? (
            <View style={s.emptyState}>
              <Feather name="heart" size={40} color={BRAND.inkLight} />
              <Text style={s.emptyTitle}>Sin favoritos aún</Text>
              <Text style={s.emptyBody}>Marca productos con ♡ para guardarlos aquí.</Text>
            </View>
          ) : (
            <View style={s.favGrid}>
              {favorites.map((fav) => (
                <View key={fav.id} style={s.favCard}>
                  {fav.coverUrl ? (
                    <Image source={{ uri: fav.coverUrl }} style={s.favImage} resizeMode="cover" />
                  ) : (
                    <View style={[s.favImage, s.favImagePlaceholder]}>
                      <Text style={{ fontSize: 28 }}>🎂</Text>
                    </View>
                  )}
                  <View style={s.favInfo}>
                    <Text style={s.favName} numberOfLines={2}>{fav.name}</Text>
                    {fav.rating_avg != null && fav.rating_avg > 0 && (
                      <View style={s.favRating}>
                        <Feather name="star" size={11} color={BRAND.rose} />
                        <Text style={s.favRatingText}>{Number(fav.rating_avg).toFixed(1)}</Text>
                      </View>
                    )}
                  </View>
                  <View style={s.favHeart}>
                    <Feather name="heart" size={14} color={BRAND.rose} />
                  </View>
                </View>
              ))}
            </View>
          )}
        </View>
      )}

      {/* ── SECCIÓN: MI PERFIL ───────────────────────────────────────────── */}
      {activeSection === 'profile' && (
        <View style={s.section}>
          {!editMode ? (
            <View style={s.profileCard}>
              <ProfileRow icon="user" label="Nombre" value={profile?.full_name ?? '—'} />
              <ProfileRow icon="mail" label="Correo" value={user.email ?? '—'} />
              <ProfileRow icon="phone" label="Celular" value={profile?.phone ?? 'No registrado'} />
              <TouchableOpacity
                style={s.editButton}
                onPress={() => {
                  setEditName(profile?.full_name ?? '');
                  setEditPhone(profile?.phone ?? '');
                  setEditMode(true);
                }}
                activeOpacity={0.8}
              >
                <Feather name="edit-2" size={15} color={BRAND.rose} />
                <Text style={s.editButtonText}>Editar información</Text>
              </TouchableOpacity>

              {/* ── Divisor fino ──────────────────────────────────────────── */}
              <View style={s.deleteAccountDivider} />

              {/* ── Botón eliminar cuenta ─────────────────────────────────── */}
              <TouchableOpacity
                style={[s.deleteAccountButton, deletingAccount && { opacity: 0.55 }]}
                onPress={handleDeleteAccount}
                activeOpacity={0.75}
                disabled={deletingAccount}
              >
                {deletingAccount ? (
                  <ActivityIndicator size="small" color="#C0392B" />
                ) : (
                  <Feather name="trash-2" size={15} color="#C0392B" />
                )}
                <Text style={s.deleteAccountText}>Eliminar mi cuenta definitivamente</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={s.profileCard}>
              <Text style={s.editSectionTitle}>Actualizar datos</Text>
              <FormField icon="user" label="Nombre completo" placeholder="Tu nombre"
                value={editName} onChangeText={setEditName} autoCapitalize="words" />
              <FormField icon="phone" label="Celular" placeholder="3001234567"
                value={editPhone} onChangeText={setEditPhone} keyboardType="phone-pad" maxLength={10} />
              <Text style={s.editEmailNote}>
                El correo electrónico no se puede cambiar desde aquí.
              </Text>
              <View style={s.editActions}>
                <TouchableOpacity style={s.cancelButton} onPress={() => setEditMode(false)} activeOpacity={0.8}>
                  <Text style={s.cancelButtonText}>Cancelar</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[s.primaryButton, { flex: 1, marginTop: 0 }, savingProfile && s.primaryButtonDisabled]}
                  onPress={handleSaveProfile}
                  activeOpacity={0.85}
                  disabled={savingProfile}
                >
                  {savingProfile
                    ? <ActivityIndicator color={BRAND.white} />
                    : <Text style={s.primaryButtonText}>Guardar</Text>
                  }
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>
      )}

      {/* ── Botón cerrar sesión ──────────────────────────────────────────── */}
      <TouchableOpacity style={s.signOutButton} onPress={handleSignOut} activeOpacity={0.8}>
        <Feather name="log-out" size={16} color={BRAND.rose} />
        <Text style={s.signOutText}>Cerrar sesión</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SUB-COMPONENTES
// ─────────────────────────────────────────────────────────────────────────────
interface FormFieldProps {
  icon: React.ComponentProps<typeof Feather>['name'];
  label: string;
  placeholder: string;
  value: string;
  onChangeText: (v: string) => void;
  keyboardType?: React.ComponentProps<typeof TextInput>['keyboardType'];
  autoCapitalize?: React.ComponentProps<typeof TextInput>['autoCapitalize'];
  maxLength?: number;
  secureTextEntry?: boolean;
}

function FormField({ icon, label, placeholder, value, onChangeText, keyboardType, autoCapitalize, maxLength }: FormFieldProps) {
  return (
    <View style={s.inputGroup}>
      <Text style={s.inputLabel}>{label}</Text>
      <View style={s.inputWrapper}>
        <Feather name={icon} size={16} color={BRAND.inkLight} style={s.inputIcon} />
        <TextInput
          style={s.input}
          placeholder={placeholder}
          placeholderTextColor={BRAND.inkLight}
          value={value}
          onChangeText={onChangeText}
          keyboardType={keyboardType}
          autoCapitalize={autoCapitalize}
          maxLength={maxLength}
          returnKeyType="next"
        />
      </View>
    </View>
  );
}

function ProfileRow({ icon, label, value }: { icon: React.ComponentProps<typeof Feather>['name']; label: string; value: string }) {
  return (
    <View style={s.profileRow}>
      <Feather name={icon} size={15} color={BRAND.inkLight} style={{ marginRight: 10, marginTop: 1 }} />
      <View style={{ flex: 1 }}>
        <Text style={s.profileRowLabel}>{label}</Text>
        <Text style={s.profileRowValue}>{value}</Text>
      </View>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ESTILOS
// ─────────────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: BRAND.cream },
  scrollContent: { paddingHorizontal: 20, flexGrow: 1 },

  // Carga
  loadingContainer: { flex: 1, backgroundColor: BRAND.cream, alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadingText: { fontFamily: BRAND.fontBody, fontSize: 14, color: BRAND.inkMid },

  // Encabezado de cuenta
  accountHeader: { alignItems: 'center', marginBottom: 24 },
  avatarCircle: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: BRAND.rose, alignItems: 'center', justifyContent: 'center', marginBottom: 12,
    shadowColor: BRAND.rose, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4,
  },
  avatarInitial: { fontFamily: BRAND.fontDisplay, fontSize: 28, color: BRAND.white, fontWeight: '700' },
  accountName: { fontFamily: BRAND.fontDisplay, fontSize: 20, color: BRAND.ink, fontWeight: '700', marginBottom: 2 },
  accountEmail: { fontFamily: BRAND.fontBody, fontSize: 13, color: BRAND.inkMid, marginBottom: 1 },
  accountPhone: { fontFamily: BRAND.fontBody, fontSize: 12, color: BRAND.inkLight },

  // Sub-menú de secciones
  sectionNav: { flexDirection: 'row', gap: 8, marginBottom: 24 },
  navCard: {
    flex: 1, alignItems: 'center', paddingVertical: 12, paddingHorizontal: 6,
    backgroundColor: BRAND.white, borderRadius: BRAND.radius,
    borderWidth: 1, borderColor: BRAND.divider, gap: 4,
  },
  navCardActive: { backgroundColor: BRAND.rose, borderColor: BRAND.rose },
  navCardLabel: { fontFamily: BRAND.fontBody, fontSize: 11, color: BRAND.inkMid, fontWeight: '600', textAlign: 'center' },
  navCardLabelActive: { color: BRAND.white },
  navBadge: { backgroundColor: BRAND.roseLight, borderRadius: 100, paddingHorizontal: 6, paddingVertical: 1 },
  navBadgeActive: { backgroundColor: 'rgba(255,255,255,0.25)' },
  navBadgeText: { fontFamily: BRAND.fontBody, fontSize: 10, color: BRAND.rose, fontWeight: '700' },
  navBadgeTextActive: { color: BRAND.white },

  // Sección genérica
  section: { marginBottom: 24 },

  // Tarjetas de pedido
  orderCard: {
    backgroundColor: BRAND.white, borderRadius: BRAND.radius,
    padding: 14, marginBottom: 10, borderWidth: 1, borderColor: BRAND.divider,
  },
  orderCardExpanded: { borderColor: BRAND.rose },
  orderCardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  orderCardTopRight: { flexDirection: 'row', alignItems: 'center' },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 100 },
  statusBadgeText: { fontFamily: BRAND.fontBody, fontSize: 11, fontWeight: '600' },
  orderAmount: { fontFamily: BRAND.fontBody, fontSize: 15, color: BRAND.ink, fontWeight: '700' },
  orderCardMeta: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  orderMeta: { fontFamily: BRAND.fontBody, fontSize: 11, color: BRAND.inkLight },
  orderMetaDot: { fontSize: 11, color: BRAND.inkLight },

  // Acordeón
  accordion: { marginTop: 12 },
  accordionDivider: { height: 1, backgroundColor: BRAND.divider, marginBottom: 12 },

  // Micro-stepper de seguimiento del pedido
  stepperContainer: { marginBottom: 14 },
  stepperTrackRow: { flexDirection: 'row', alignItems: 'center' },
  stepperDot: {
    width: 16, height: 16, borderRadius: 8,
    borderWidth: 1.5, borderColor: BRAND.divider,
    backgroundColor: BRAND.white,
    alignItems: 'center', justifyContent: 'center',
  },
  stepperDotActive: { backgroundColor: BRAND.rose, borderColor: BRAND.rose },
  stepperConnector: { flex: 1, height: 2, backgroundColor: BRAND.divider, marginHorizontal: 2 },
  stepperConnectorActive: { backgroundColor: BRAND.rose },
  stepperLabelsRow: { flexDirection: 'row', marginTop: 4 },
  stepperLabel: {
    flex: 1, fontFamily: BRAND.fontBody, fontSize: 10, color: BRAND.inkLight,
    textAlign: 'center', fontWeight: '500',
  },
  stepperLabelActive: { color: BRAND.rose, fontWeight: '700' },
  accordionTitle: { fontFamily: BRAND.fontBody, fontSize: 12, fontWeight: '700', color: BRAND.inkMid, marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5 },
  accordionItem: { flexDirection: 'row', alignItems: 'center', marginBottom: 10, gap: 10 },
  itemImage: { width: 48, height: 48, borderRadius: BRAND.radiusSm, backgroundColor: BRAND.divider },
  itemImagePlaceholder: { alignItems: 'center', justifyContent: 'center' },
  itemInfo: { flex: 1 },
  itemName: { fontFamily: BRAND.fontBody, fontSize: 13, color: BRAND.ink, fontWeight: '600', lineHeight: 17 },
  itemVariant: { fontFamily: BRAND.fontBody, fontSize: 11, color: BRAND.inkLight, marginTop: 1 },
  itemQty: { fontFamily: BRAND.fontBody, fontSize: 11, color: BRAND.inkMid, marginTop: 2 },
  itemPrice: { fontFamily: BRAND.fontBody, fontSize: 13, color: BRAND.ink, fontWeight: '700' },
  accordionTotal: { flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: BRAND.divider, paddingTop: 10, marginTop: 4 },
  accordionTotalLabel: { fontFamily: BRAND.fontBody, fontSize: 13, color: BRAND.inkMid, fontWeight: '600' },
  accordionTotalAmount: { fontFamily: BRAND.fontBody, fontSize: 14, color: BRAND.ink, fontWeight: '700' },

  // ── Botones de acción para pedidos 'pending_payment' ─────────────────────
  orderActionsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: BRAND.divider,
  },
  orderActionCancel: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: BRAND.radius,
    borderWidth: 1.5,
    borderColor: BRAND.statusCancelled,
    backgroundColor: BRAND.statusCancelledBg,
  },
  orderActionCancelText: {
    fontFamily: BRAND.fontBody,
    fontSize: 13,
    fontWeight: '600',
    color: BRAND.statusCancelled,
  },
  orderActionResume: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: BRAND.radius,
    backgroundColor: BRAND.rose,
    shadowColor: BRAND.rose,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 3,
  },
  orderActionResumeText: {
    fontFamily: BRAND.fontBody,
    fontSize: 13,
    fontWeight: '700',
    color: BRAND.white,
  },

  // Favoritos
  favGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  favCard: {
    width: '47%', backgroundColor: BRAND.white, borderRadius: BRAND.radius,
    borderWidth: 1, borderColor: BRAND.divider, overflow: 'hidden',
  },
  favImage: { width: '100%', height: 110, backgroundColor: BRAND.divider },
  favImagePlaceholder: { alignItems: 'center', justifyContent: 'center' },
  favInfo: { padding: 10 },
  favName: { fontFamily: BRAND.fontBody, fontSize: 12, color: BRAND.ink, fontWeight: '600', lineHeight: 16 },
  favRating: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 4 },
  favRatingText: { fontFamily: BRAND.fontBody, fontSize: 11, color: BRAND.inkMid },
  favHeart: {
    position: 'absolute', top: 8, right: 8,
    backgroundColor: BRAND.white, borderRadius: 100,
    padding: 5,
    shadowColor: BRAND.ink, shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 3, elevation: 2,
  },

  // Perfil editable
  profileCard: { backgroundColor: BRAND.white, borderRadius: BRAND.radius, padding: 18, borderWidth: 1, borderColor: BRAND.divider },
  profileRow: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: BRAND.divider },
  profileRowLabel: { fontFamily: BRAND.fontBody, fontSize: 11, color: BRAND.inkLight, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.3, marginBottom: 2 },
  profileRowValue: { fontFamily: BRAND.fontBody, fontSize: 14, color: BRAND.ink, fontWeight: '500' },
  editButton: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 14, justifyContent: 'center' },
  editButtonText: { fontFamily: BRAND.fontBody, fontSize: 14, color: BRAND.rose, fontWeight: '600' },

  // Zona de peligro — Eliminar cuenta
  deleteAccountDivider: { height: 1, backgroundColor: BRAND.divider, marginTop: 16, marginHorizontal: -4 },
  deleteAccountButton: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 14, paddingBottom: 2, justifyContent: 'center' },
  deleteAccountText: { fontFamily: BRAND.fontBody, fontSize: 13, color: '#C0392B', fontWeight: '500' },
  editSectionTitle: { fontFamily: BRAND.fontDisplay, fontSize: 16, color: BRAND.ink, fontWeight: '700', marginBottom: 16 },
  editEmailNote: { fontFamily: BRAND.fontBody, fontSize: 12, color: BRAND.inkLight, marginBottom: 16, fontStyle: 'italic' },
  editActions: { flexDirection: 'row', gap: 10, marginTop: 4 },
  cancelButton: { flex: 1, height: 52, alignItems: 'center', justifyContent: 'center', borderRadius: BRAND.radius, borderWidth: 1.5, borderColor: BRAND.divider },
  cancelButtonText: { fontFamily: BRAND.fontBody, fontSize: 15, color: BRAND.inkMid, fontWeight: '600' },

  // Estado vacío genérico
  emptyState: { alignItems: 'center', paddingVertical: 36, backgroundColor: BRAND.white, borderRadius: BRAND.radius, borderWidth: 1, borderColor: BRAND.divider, gap: 8 },
  emptyTitle: { fontFamily: BRAND.fontDisplay, fontSize: 16, color: BRAND.ink, fontWeight: '700', marginTop: 8 },
  emptyBody: { fontFamily: BRAND.fontBody, fontSize: 13, color: BRAND.inkLight, textAlign: 'center', lineHeight: 20, paddingHorizontal: 24 },

  // Cerrar sesión
  signOutButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: BRAND.radius, borderWidth: 1.5, borderColor: BRAND.rose, backgroundColor: BRAND.roseLight },
  signOutText: { fontFamily: BRAND.fontBody, fontSize: 15, fontWeight: '600', color: BRAND.rose },

  // Formulario de acceso
  brandHeader: { alignItems: 'center', marginBottom: 32 },
  brandIcon: { fontSize: 44, marginBottom: 8 },
  brandName: { fontFamily: BRAND.fontDisplay, fontSize: 28, color: BRAND.ink, fontWeight: '700', letterSpacing: -0.5, marginBottom: 4 },
  brandTagline: { fontFamily: BRAND.fontBody, fontSize: 15, color: BRAND.inkMid },
  modeTabs: { flexDirection: 'row', backgroundColor: BRAND.divider, borderRadius: BRAND.radius, padding: 3, marginBottom: 28 },
  modeTab: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: BRAND.radiusSm },
  modeTabActive: { backgroundColor: BRAND.white, shadowColor: BRAND.ink, shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 4, elevation: 2 },
  modeTabText: { fontFamily: BRAND.fontBody, fontSize: 14, color: BRAND.inkLight, fontWeight: '500' },
  modeTabTextActive: { color: BRAND.ink, fontWeight: '700' },
  form: { gap: 4 },
  inputGroup: { marginBottom: 16 },
  inputLabel: { fontFamily: BRAND.fontBody, fontSize: 13, fontWeight: '600', color: BRAND.inkMid, marginBottom: 6, letterSpacing: 0.2 },
  inputWrapper: { flexDirection: 'row', alignItems: 'center', backgroundColor: BRAND.roseLight, borderRadius: BRAND.radiusSm, borderWidth: 1, borderColor: BRAND.divider, paddingHorizontal: 12, height: 50 },
  inputIcon: { marginRight: 10 },
  input: { flex: 1, fontFamily: BRAND.fontBody, fontSize: 15, color: BRAND.ink, height: '100%' },
  primaryButton: { backgroundColor: BRAND.rose, borderRadius: BRAND.radius, height: 52, alignItems: 'center', justifyContent: 'center', marginTop: 8, shadowColor: BRAND.rose, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.35, shadowRadius: 8, elevation: 4 },
  primaryButtonDisabled: { opacity: 0.65 },
  primaryButtonText: { fontFamily: BRAND.fontBody, fontSize: 16, fontWeight: '700', color: BRAND.white, letterSpacing: 0.3 },
  toggleMode: { alignItems: 'center', paddingTop: 20 },
  toggleModeText: { fontFamily: BRAND.fontBody, fontSize: 14, color: BRAND.inkMid },
  toggleModeLink: { color: BRAND.rose, fontWeight: '700' },

  // ── Divisor social ────────────────────────────────────────────────────────
  socialDivider: { flexDirection: 'row', alignItems: 'center', marginTop: 28, marginBottom: 20, gap: 12 },
  socialDividerLine: { flex: 1, height: 1, backgroundColor: BRAND.divider },
  socialDividerText: { fontFamily: BRAND.fontBody, fontSize: 13, color: BRAND.inkLight, fontWeight: '500' },

  // ── Botones sociales ──────────────────────────────────────────────────────
  socialButtons: { gap: 12 },
  socialButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    height: 52, borderRadius: BRAND.radius,
    backgroundColor: BRAND.white,
    borderWidth: 1.5, borderColor: BRAND.divider,
    shadowColor: BRAND.ink, shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2,
  },
  socialButtonIcon: {
    fontFamily: BRAND.fontBody, fontSize: 17, fontWeight: '700', color: '#4285F4',
    // La "G" de Google en azul. Si tienes la imagen del logo, reemplaza con <Image>
  },
  socialButtonText: { fontFamily: BRAND.fontBody, fontSize: 15, color: BRAND.ink, fontWeight: '600' },
  // El botón de Apple usa su propio componente nativo con estilo propio
  appleButton: { width: '100%', height: 52 },

  // ── Banner de incentivo para invitados (Tarjeta de Regalo) ────────────────
  welcomeBanner: {
    marginBottom: 20,
    borderRadius: BRAND.radius + 2,
    overflow: 'hidden',
    // Sombra premium
    shadowColor: BRAND.rose,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 12,
    elevation: 5,
  },
  welcomeBannerInner: {
    backgroundColor: '#FFF9F5',
    borderRadius: BRAND.radius + 2,
    borderWidth: 1.5,
    borderColor: '#E8C4B0',
    padding: 16,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  welcomeBannerLeft: {
    paddingTop: 2,
  },
  welcomeGiftBadge: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: BRAND.roseLight,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#F0C4B4',
  },
  welcomeBannerContent: {
    flex: 1,
  },
  welcomeBannerTitle: {
    fontFamily: BRAND.fontDisplay,
    fontSize: 14,
    color: BRAND.roseDark,
    fontWeight: '700',
    lineHeight: 20,
    marginBottom: 6,
  },
  welcomeBannerBody: {
    fontFamily: BRAND.fontBody,
    fontSize: 13,
    color: BRAND.ink,
    lineHeight: 19,
    marginBottom: 5,
  },
  welcomeBannerHighlight: {
    fontFamily: BRAND.fontBody,
    fontSize: 13,
    color: BRAND.rose,
    fontWeight: '700',
  },
  welcomeBannerNote: {
    fontFamily: BRAND.fontBody,
    fontSize: 11,
    color: BRAND.inkLight,
    fontStyle: 'italic',
    lineHeight: 16,
  },

  // ── Confeti animado ───────────────────────────────────────────────────────
  confettiContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 999,
    // No bloquea eventos de toque (pointerEvents="none" se pasa como prop)
  },
  confettiDot: {
    position: 'absolute',
    top: 0,
    left: SCREEN_W / 2,  // centro base — translateX lo mueve
  },

  // ── Modal de celebración post-registro ────────────────────────────────────
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(44, 32, 24, 0.72)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  modalCard: {
    backgroundColor: BRAND.white,
    borderRadius: 24,
    padding: 28,
    width: '100%',
    maxWidth: 380,
    alignItems: 'center',
    shadowColor: BRAND.ink,
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.22,
    shadowRadius: 24,
    elevation: 20,
    borderWidth: 1,
    borderColor: '#F5E6DF',
  },
  modalEmoji: {
    fontSize: 52,
    marginBottom: 12,
  },
  modalTitle: {
    fontFamily: BRAND.fontDisplay,
    fontSize: 20,
    color: BRAND.ink,
    fontWeight: '700',
    textAlign: 'center',
    lineHeight: 28,
    marginBottom: 12,
  },
  modalBody: {
    fontFamily: BRAND.fontBody,
    fontSize: 14,
    color: BRAND.inkMid,
    textAlign: 'center',
    lineHeight: 21,
    marginBottom: 14,
  },
  modalBodySmall: {
    fontFamily: BRAND.fontBody,
    fontSize: 12,
    color: BRAND.inkLight,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 20,
    fontStyle: 'italic',
  },
  modalCouponBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: BRAND.roseLight,
    borderRadius: BRAND.radiusSm + 2,
    paddingVertical: 12,
    paddingHorizontal: 20,
    marginBottom: 8,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: BRAND.rose,
    alignSelf: 'stretch',
    justifyContent: 'center',
  },
  modalCouponCode: {
    fontFamily: BRAND.fontBody,
    fontSize: 20,
    color: BRAND.rose,
    fontWeight: '800',
    letterSpacing: 3,
  },
  copyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: BRAND.rose,
    borderRadius: BRAND.radius,
    paddingVertical: 13,
    paddingHorizontal: 28,
    marginBottom: 12,
    alignSelf: 'stretch',
    justifyContent: 'center',
    shadowColor: BRAND.rose,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.32,
    shadowRadius: 8,
    elevation: 4,
  },
  copyButtonCopied: {
    backgroundColor: BRAND.statusPaidBg,
    shadowColor: BRAND.statusPaid,
  },
  copyButtonText: {
    fontFamily: BRAND.fontBody,
    fontSize: 15,
    color: BRAND.white,
    fontWeight: '700',
  },
  copyButtonTextCopied: {
    color: BRAND.statusPaid,
  },
  closeModalButton: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    alignSelf: 'stretch',
    alignItems: 'center',
  },
  closeModalText: {
    fontFamily: BRAND.fontBody,
    fontSize: 15,
    color: BRAND.inkMid,
    fontWeight: '600',
  },
});