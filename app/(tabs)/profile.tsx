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

import React, { useState, useEffect, useCallback } from 'react';
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
} from 'react-native';
import { Stack, useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as WebBrowser from 'expo-web-browser';
import { supabase } from '@/lib/supabase';
import type { User } from '@supabase/supabase-js';

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

interface ProfileData {
  full_name: string;
  phone: string | null;
}

interface OrderItem {
  id: string;
  product_name_snapshot: string | null;
  variant_name_snapshot: string | null;
  quantity: number;
  price_at_purchase: number;
  image_snapshot: string | null;
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
    case 'paid': return { label: 'Pagado', color: BRAND.statusPaid, bg: BRAND.statusPaidBg };
    case 'pending_payment': return { label: 'Pago pendiente', color: BRAND.statusPending, bg: BRAND.statusPendingBg };
    case 'cancelled': return { label: 'Cancelado', color: BRAND.statusCancelled, bg: BRAND.statusCancelledBg };
    default: return { label: status, color: BRAND.inkMid, bg: BRAND.divider };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENTE PRINCIPAL
// ─────────────────────────────────────────────────────────────────────────────
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
            product_name_snapshot,
            variant_name_snapshot,
            quantity,
            price_at_purchase,
            image_snapshot
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
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {
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
        <ScrollView
          contentContainerStyle={[s.scrollContent, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 32 }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
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
            orders.map((order) => {
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
});