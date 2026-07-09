import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, ScrollView, Image, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { supabase } from '../../lib/supabase';
// ─── IMPORTACIÓN DEL NUEVO STORE GLOBAL ──────────────────────────────────────
import { useFavoritesStore } from '../../store/useFavoritesStore';

const BRAND = {
  cream: '#FAF7F2',
  orange: '#FF6B00',
  surface: '#FFFFFF',
  textPrimary: '#1A1A1A',
  textSecondary: '#8E8E93',
  textMuted: '#3A3A3C',
  border: '#E5E5EA',
  imagePlaceholder: '#EDEEF2',
};

export default function FavoritesScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  
  // ─── CONSUMO DE ESTADO CENTRALIZADO ────────────────────────────────────────
  // Reemplazamos los useState locales por la suscripción reactiva al store global
  const { favorites, loading, fetchFavorites, clearFavorites } = useFavoritesStore();
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    // Sincronización inicial con la sesión de Supabase
    supabase.auth.getSession().then(({ data: { session } }) => {
      setIsAuthenticated(!!session?.user);
      if (session?.user) {
        fetchFavorites(session.user.id); // Ejecuta la query y el mapeo globalmente
      }
    });

    // Escuchador de cambios de autenticación
    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsAuthenticated(!!session?.user);
      if (session?.user) {
        fetchFavorites(session.user.id);
      } else {
        clearFavorites(); // Limpia el estado global si cierra sesión
      }
    });

    return () => authListener.subscription.unsubscribe();
  }, [fetchFavorites, clearFavorites]);

  // ─── CONTROL DE INTERFAZ DE CARGA (IDÉNTICO A TU ORIGINAL) ─────────────────
  if (loading) {
    return (
      <View style={[s.center, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={BRAND.orange} />
      </View>
    );
  }

  // ─── CONTROL DE USUARIO NO AUTENTICADO (IDÉNTICO A TU ORIGINAL) ────────────
  if (!isAuthenticated) {
    return (
      <View style={[s.center, { paddingTop: insets.top, paddingHorizontal: 32 }]}>
        <Feather name="lock" size={44} color={BRAND.textSecondary} />
        <Text style={s.title}>Inicia sesión</Text>
        <Text style={s.subtitle}>Ingresa a tu cuenta para poder guardar y ver tus productos favoritos.</Text>
        <TouchableOpacity style={s.authButton} onPress={() => router.push('/profile')}>
          <Text style={s.authButtonText}>Ir a Mi Cuenta</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ─── RENDERIZADO VISUAL PRINCIPAL (IDÉNTICO A TU ORIGINAL) ─────────────────
  return (
    <ScrollView style={s.root} contentContainerStyle={{ paddingTop: insets.top + 16, paddingHorizontal: 20, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
      <Text style={s.screenTitle}>Mis Favoritos</Text>
      
      {favorites.length === 0 ? (
        <View style={s.emptyState}>
          <Feather name="heart" size={48} color={BRAND.textSecondary} />
          <Text style={s.emptyTitle}>Sin favoritos aún</Text>
          <Text style={s.emptySubtitle}>Explora nuestro menú y marca con un ♡ los pasteles que más te gusten.</Text>
        </View>
      ) : (
        <View style={s.grid}>
          {favorites.map((fav) => (
            <TouchableOpacity key={fav.id} style={s.card} activeOpacity={0.85} onPress={() => router.push({ pathname: "/product/[id]", params: { id: fav.product_id } })}>
              {fav.coverUrl ? (
                <Image source={{ uri: fav.coverUrl }} style={s.image} resizeMode="cover" />
              ) : (
                <View style={[s.image, { alignItems: 'center', justifyContent: 'center', backgroundColor: BRAND.imagePlaceholder }]}>
                  <Text style={{ fontSize: 24 }}>🍰</Text>
                </View>
              )}
              <View style={s.info}>
                <Text style={s.name} numberOfLines={2}>{fav.name}</Text>
                <Text style={s.price}>${fav.basePrice.toLocaleString('es-CO')}</Text>
                {fav.rating_avg != null && fav.rating_avg > 0 && (
                  <View style={s.rating}>
                    <Feather name="star" size={11} color={BRAND.orange} />
                    <Text style={s.ratingText}>{Number(fav.rating_avg).toFixed(1)}</Text>
                  </View>
                )}
              </View>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

// ─── ARQUITECTURA DE ESTILOS (100% PRESERVADA) ───────────────────────────────
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: BRAND.cream },
  center: { flex: 1, backgroundColor: BRAND.cream, alignItems: 'center', justifyContent: 'center', gap: 10 },
  screenTitle: { fontSize: 24, fontWeight: '800', color: BRAND.textPrimary, marginBottom: 20 },
  title: { fontSize: 18, fontWeight: '700', color: BRAND.textPrimary, marginTop: 12 },
  subtitle: { fontSize: 14, color: BRAND.textSecondary, textAlign: 'center', lineHeight: 20, marginTop: 4 },
  authButton: { backgroundColor: BRAND.orange, paddingVertical: 12, paddingHorizontal: 24, borderRadius: 12, marginTop: 16 },
  authButtonText: { color: '#FFFFFF', fontWeight: '700', fontSize: 15 },
  emptyState: { alignItems: 'center', paddingVertical: 60, gap: 8 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: BRAND.textPrimary },
  emptySubtitle: { fontSize: 14, color: BRAND.textSecondary, textAlign: 'center', paddingHorizontal: 20 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  card: { width: '48%', backgroundColor: BRAND.surface, borderRadius: 16, borderWidth: 1, borderColor: BRAND.border, overflow: 'hidden' },
  image: { width: '100%', height: 120 },
  info: { padding: 12, gap: 4 },
  name: { fontSize: 13, fontWeight: '700', color: BRAND.textPrimary, lineHeight: 17 },
  price: { fontSize: 14, fontWeight: '800', color: BRAND.orange },
  rating: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  ratingText: { fontSize: 11, color: BRAND.textMuted, fontWeight: '600' },
});