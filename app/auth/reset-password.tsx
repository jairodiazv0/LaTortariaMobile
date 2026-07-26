/**
 * reset-password.tsx — Pantalla de Recuperación de Contraseña
 * LaTortariaMobile
 *
 * Flujo:
 *   1. Recibe el code desde el deep link (latortariamobile://auth/reset-password?code=...)
 *   2. Intercambia el code por una sesión temporal con exchangeCodeForSession
 *   3. Muestra formulario para establecer nueva contraseña
 *   4. Llama a updateUser({ password }) para fijar la nueva contraseña
 *   5. Redirige al perfil (ya autenticado) o permite hacer login
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';

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
  fontDisplay: Platform.select({ ios: 'Georgia', android: 'serif' }) as string,
  fontBody: Platform.select({ ios: 'System', android: 'sans-serif' }) as string,
  radius: 14,
  radiusSm: 8,
};

export default function ResetPasswordScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams();
  const code = Array.isArray(params.code) ? params.code[0] : params.code;

  const [loading, setLoading] = useState(true);
  const [codeValid, setCodeValid] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // ─────────────────────────────────────────────────────────────────────────
  // STEP 1: Intercambiar el code por sesión al montar
  // ─────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    const exchangeCode = async () => {
      if (!code) {
        setLoading(false);
        setCodeValid(false);
        return;
      }

      try {
        const { data, error } = await supabase.auth.exchangeCodeForSession(code);
        
        if (error) {
          setCodeValid(false);
          Alert.alert(
            'Enlace inválido',
            'El enlace expiró o ya fue usado. Solicita uno nuevo desde la pantalla de inicio de sesión.',
          );
        } else if (data.session) {
          // Sesión establecida correctamente
          setCodeValid(true);
        }
      } catch (err: any) {
        setCodeValid(false);
        Alert.alert('Error', err.message ?? 'No se pudo validar el enlace.');
      } finally {
        setLoading(false);
      }
    };

    exchangeCode();
  }, [code]);

  // ─────────────────────────────────────────────────────────────────────────
  // STEP 2: Actualizar contraseña
  // ─────────────────────────────────────────────────────────────────────────
  const handleUpdatePassword = async () => {
    // Validaciones
    if (!newPassword || newPassword.length < 8) {
      return Alert.alert(
        'Contraseña muy corta',
        'La contraseña debe tener al menos 8 caracteres.',
      );
    }

    if (newPassword !== confirmPassword) {
      return Alert.alert(
        'Las contraseñas no coinciden',
        'Asegúrate de escribir la misma contraseña en ambos campos.',
      );
    }

    setSubmitting(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });

      if (error) {
        Alert.alert('Error al actualizar', error.message);
      } else {
        Alert.alert(
          '¡Listo!',
          'Tu contraseña ha sido actualizada con éxito. Ya puedes iniciar sesión.',
          [
            {
              text: 'Continuar',
              onPress: () => router.replace('/(tabs)/profile'),
            },
          ],
        );
      }
    } catch (err: any) {
      Alert.alert('Error', err.message ?? 'No se pudo actualizar la contraseña.');
    } finally {
      setSubmitting(false);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER — Carga inicial
  // ─────────────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <View style={[s.loadingContainer, { paddingTop: insets.top }]}>
        <Stack.Screen options={{ headerShown: false }} />
        <ActivityIndicator size="large" color={BRAND.rose} />
        <Text style={s.loadingText}>Validando enlace…</Text>
      </View>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER — Enlace inválido o expirado
  // ─────────────────────────────────────────────────────────────────────────
  if (!codeValid) {
    return (
      <View style={[s.root, { paddingTop: insets.top + 24 }]}>
        <Stack.Screen options={{ headerShown: false }} />
        <ScrollView
          contentContainerStyle={s.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={s.errorState}>
            <Text style={s.errorIcon}>⚠️</Text>
            <Text style={s.errorTitle}>Enlace no válido</Text>
            <Text style={s.errorBody}>
              El enlace expiró o ya fue usado. Vuelve a solicitar la recuperación desde
              la pantalla de inicio de sesión.
            </Text>
            <TouchableOpacity
              style={s.primaryButton}
              onPress={() => router.replace('/(tabs)/profile')}
              activeOpacity={0.85}
            >
              <Text style={s.primaryButtonText}>Volver a Iniciar sesión</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </View>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER — Formulario de nueva contraseña
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <KeyboardAvoidingView
      style={s.root}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView
        contentContainerStyle={[
          s.scrollContent,
          { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 32 },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Marca */}
        <View style={s.brandHeader}>
          <Text style={s.brandIcon}>🔐</Text>
          <Text style={s.brandName}>Nueva contraseña</Text>
          <Text style={s.brandTagline}>
            Elige una contraseña segura para tu cuenta
          </Text>
        </View>

        {/* Formulario */}
        <View style={s.form}>
          {/* Nueva contraseña */}
          <View style={s.inputGroup}>
            <Text style={s.inputLabel}>Nueva contraseña</Text>
            <View style={s.inputWrapper}>
              <Feather
                name="lock"
                size={16}
                color={BRAND.inkLight}
                style={s.inputIcon}
              />
              <TextInput
                style={[s.input, { flex: 1 }]}
                placeholder="Mínimo 8 caracteres"
                placeholderTextColor={BRAND.inkLight}
                value={newPassword}
                onChangeText={setNewPassword}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="next"
              />
              <TouchableOpacity
                onPress={() => setShowPassword((v) => !v)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Feather
                  name={showPassword ? 'eye-off' : 'eye'}
                  size={16}
                  color={BRAND.inkLight}
                />
              </TouchableOpacity>
            </View>
          </View>

          {/* Confirmar contraseña */}
          <View style={s.inputGroup}>
            <Text style={s.inputLabel}>Confirmar contraseña</Text>
            <View style={s.inputWrapper}>
              <Feather
                name="lock"
                size={16}
                color={BRAND.inkLight}
                style={s.inputIcon}
              />
              <TextInput
                style={[s.input, { flex: 1 }]}
                placeholder="Escribe la misma contraseña"
                placeholderTextColor={BRAND.inkLight}
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secureTextEntry={!showConfirmPassword}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="done"
                onSubmitEditing={handleUpdatePassword}
              />
              <TouchableOpacity
                onPress={() => setShowConfirmPassword((v) => !v)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Feather
                  name={showConfirmPassword ? 'eye-off' : 'eye'}
                  size={16}
                  color={BRAND.inkLight}
                />
              </TouchableOpacity>
            </View>
          </View>

          {/* Botón actualizar */}
          <TouchableOpacity
            style={[s.primaryButton, submitting && s.primaryButtonDisabled]}
            onPress={handleUpdatePassword}
            activeOpacity={0.85}
            disabled={submitting}
          >
            {submitting ? (
              <ActivityIndicator color={BRAND.white} />
            ) : (
              <Text style={s.primaryButtonText}>Actualizar contraseña</Text>
            )}
          </TouchableOpacity>

          {/* Hint de seguridad */}
          <View style={s.hintBox}>
            <Feather name="info" size={14} color={BRAND.inkMid} />
            <Text style={s.hintText}>
              Tu contraseña debe tener al menos 8 caracteres. Te recomendamos usar una
              combinación de letras, números y símbolos.
            </Text>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ESTILOS
// ─────────────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: BRAND.cream },
  scrollContent: { paddingHorizontal: 20, flexGrow: 1 },

  // Carga
  loadingContainer: {
    flex: 1,
    backgroundColor: BRAND.cream,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loadingText: {
    fontFamily: BRAND.fontBody,
    fontSize: 14,
    color: BRAND.inkMid,
  },

  // Estado de error
  errorState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    paddingHorizontal: 24,
    backgroundColor: BRAND.white,
    borderRadius: BRAND.radius,
    borderWidth: 1,
    borderColor: BRAND.divider,
    gap: 12,
    marginTop: 80,
  },
  errorIcon: { fontSize: 56, marginBottom: 8 },
  errorTitle: {
    fontFamily: BRAND.fontDisplay,
    fontSize: 20,
    color: BRAND.ink,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 4,
  },
  errorBody: {
    fontFamily: BRAND.fontBody,
    fontSize: 14,
    color: BRAND.inkMid,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 12,
  },

  // Encabezado
  brandHeader: { alignItems: 'center', marginBottom: 32 },
  brandIcon: { fontSize: 56, marginBottom: 12 },
  brandName: {
    fontFamily: BRAND.fontDisplay,
    fontSize: 24,
    color: BRAND.ink,
    fontWeight: '700',
    letterSpacing: -0.5,
    marginBottom: 4,
  },
  brandTagline: {
    fontFamily: BRAND.fontBody,
    fontSize: 14,
    color: BRAND.inkMid,
    textAlign: 'center',
    lineHeight: 20,
    paddingHorizontal: 24,
  },

  // Formulario
  form: { gap: 4 },
  inputGroup: { marginBottom: 16 },
  inputLabel: {
    fontFamily: BRAND.fontBody,
    fontSize: 13,
    fontWeight: '600',
    color: BRAND.inkMid,
    marginBottom: 6,
    letterSpacing: 0.2,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: BRAND.roseLight,
    borderRadius: BRAND.radiusSm,
    borderWidth: 1,
    borderColor: BRAND.divider,
    paddingHorizontal: 12,
    height: 50,
  },
  inputIcon: { marginRight: 10 },
  input: {
    flex: 1,
    fontFamily: BRAND.fontBody,
    fontSize: 15,
    color: BRAND.ink,
    height: '100%',
  },

  // Botón primario
  primaryButton: {
    backgroundColor: BRAND.rose,
    borderRadius: BRAND.radius,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    shadowColor: BRAND.rose,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 4,
  },
  primaryButtonDisabled: { opacity: 0.65 },
  primaryButtonText: {
    fontFamily: BRAND.fontBody,
    fontSize: 16,
    fontWeight: '700',
    color: BRAND.white,
    letterSpacing: 0.3,
  },

  // Hint de seguridad
  hintBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: BRAND.white,
    borderRadius: BRAND.radiusSm,
    padding: 12,
    marginTop: 16,
    borderWidth: 1,
    borderColor: BRAND.divider,
  },
  hintText: {
    flex: 1,
    fontFamily: BRAND.fontBody,
    fontSize: 12,
    color: BRAND.inkMid,
    lineHeight: 18,
  },
});
