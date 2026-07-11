// app/modal.tsx
import React, { useEffect } from 'react';
import { StyleSheet, Text, View, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
// ─── IMPORTACIÓN DE ÁREA SEGURA NATIVA ──────────────────────────────────────
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNotificationStore, NotificationItem } from '../store/useNotificationStore';
import { supabase } from '../lib/supabase';

const BRAND = {
  cream: '#FAF7F2',
  ink: '#2C2018',
  rose: '#C8745A',
  textSecondary: '#8E8E93',
  white: '#FFFFFF',
  border: '#EDE4D8',
};

export default function NotificationModalScreen() {
  const router = useRouter();
  // ─── INYECCIÓN DE INSETS ──────────────────────────────────────────────────
  const insets = useSafeAreaInsets();
  const { notifications, loading, fetchNotifications, markAsRead, markAllAsRead } = useNotificationStore();

  // 1. Cargar/Sincronizar el historial al abrir el modal
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        fetchNotifications(session.user.id);
      }
    });
  }, [fetchNotifications]);

  // 2. Manejador de limpieza de globos de alerta (Mark all as read)
  const handleMarkAllAsRead = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) {
      await markAllAsRead(session.user.id);
    }
  };

  // ─── RESOLUCIÓN VISUAL MEJORADA DE ALTO CONTRASTE ─────────────────────────
  const getNotificationVisuals = (type: string, isRead: boolean) => {
    const iconSize = 22;
    
    // Si ya está leída, el ícono pierde color por completo para denotar inactividad
    const color = isRead ? '#A1A1A6' : BRAND.rose;

    // Cambiamos el contenedor del fondo: Gris/Crema muy apagado si ya fue leído
    if (isRead) {
      return {
        icon: <Ionicons name="checkmark-circle-outline" size={iconSize} color={color} />, // Check de leído
        bg: '#EFEBE4'
      };
    }

    // Estados activos (No leídos)
    switch (type) {
      case 'order_status':
        return { icon: <Ionicons name="fast-food-outline" size={iconSize} color={color} />, bg: '#FCEFEA' };
      case 'stock_drop':
        return { icon: <Ionicons name="trending-up-outline" size={iconSize} color={color} />, bg: '#EAF6FC' };
      case 'system':
        return { icon: <Ionicons name="options-outline" size={iconSize} color={color} />, bg: '#F0EAF2' };
      default:
        return { icon: <Ionicons name="mail-outline" size={iconSize} color={color} />, bg: '#F4EFE6' };
    }
  };

  // 4. Acción al presionar una notificación individual
  const handleNotificationPress = async (item: NotificationItem) => {
    // Marcar como leído en local y servidor de manera optimista
    await markAsRead(item.id);

    // Si el trigger inyectó una ruta de redirección dinámica, la ejecutamos
    if (item.data?.url) {
      router.dismiss(); // Cierra el modal primero de forma limpia
      router.push(item.data.url as any);
    }
  };

  return (
    <View style={s.container}>
      <StatusBar style="dark" />

      {/* HEADER DEL MODAL BAR (MODIFICACIÓN QUIRÚRGICA) */}
      <View style={[s.header, { paddingTop: insets.top + 12 }]}>
        <View>
          <Text style={s.headerTitle}>Notificaciones</Text>
          <Text style={s.headerSubtitle}>Entérate del estado de tus antojos</Text>
        </View>
        {notifications.some(n => !n.is_read) && (
          <TouchableOpacity onPress={handleMarkAllAsRead} activeOpacity={0.6}>
            <Text style={s.markAllText}>Marcar todo como leído</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* RENDERIZADO CONDICIONAL DE ESTADOS OPTIMIZADO */}
      {loading ? (
        // 1. Si el Store global está consultando a Supabase, se muestra SIEMPRE el spinner primero
        <View style={s.center}>
          <ActivityIndicator size="large" color={BRAND.rose} />
        </View>
      ) : notifications.length === 0 ? (
        // 2. Si terminó de cargar y efectivamente el servidor devolvió 0 filas, se muestra el Empty State
        <View style={s.center}>
          <Ionicons name="notifications-off-outline" size={48} color={BRAND.textSecondary} />
          <Text style={s.emptyTitle}>Bandeja de entrada limpia</Text>
          <Text style={s.emptySubtitle}>Aquí aparecerán las actualizaciones de tus pedidos y alertas de stock.</Text>
        </View>
      ) : (
        // 3. Si hay datos reales y confirmados, se renderiza el feed completo
        <ScrollView 
          style={s.feed} 
          contentContainerStyle={s.feedContent}
          showsVerticalScrollIndicator={false}
        >
          {notifications.map((item) => {
            const visuals = getNotificationVisuals(item.type, item.is_read);
            
            return (
              <TouchableOpacity
                key={item.id}
                // ⚡ INTERSECCIÓN DE ESTILO: Si está leído aplicamos opacidad y fondo grisáceo
                style={[
                  s.card, 
                  item.is_read ? s.cardRead : s.cardUnread
                ]}
                activeOpacity={0.85}
                onPress={() => handleNotificationPress(item)}
              >
                <View style={[s.iconContainer, { backgroundColor: visuals.bg }]}>
                  {visuals.icon}
                </View>

                <View style={s.textContainer}>
                  <View style={s.cardHeaderRow}>
                    <Text 
                      // ⚡ CAMBIO CROMÁTICO EN EL TEXTO SEGÚN LECTURA
                      style={[s.cardTitle, item.is_read ? s.cardTitleRead : s.cardTitleUnread]} 
                      numberOfLines={1}
                    >
                      {item.title}
                    </Text>
                    {!item.is_read && <View style={s.unreadDot} />}
                  </View>
                  
                  <Text style={[s.cardBody, item.is_read && s.cardBodyRead]} numberOfLines={3}>
                    {item.body}
                  </Text>
                  
                  <Text style={s.cardTime}>
                    {new Date(item.created_at).toLocaleDateString('es-CO', {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BRAND.cream,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: BRAND.border,
    backgroundColor: BRAND.white,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: BRAND.ink,
  },
  headerSubtitle: {
    fontSize: 13,
    color: BRAND.textSecondary,
    marginTop: 2,
  },
  markAllText: {
    fontSize: 13,
    fontWeight: '700',
    color: BRAND.rose,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
    gap: 12,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: BRAND.ink,
    marginTop: 8,
  },
  emptySubtitle: {
    fontSize: 13,
    color: BRAND.textSecondary,
    textAlign: 'center',
    lineHeight: 18,
  },
  feed: {
    flex: 1,
  },
  feedContent: {
    padding: 16,
    gap: 12,
  },
  card: {
    flexDirection: 'row',
    borderRadius: 16,
    padding: 14,
    alignItems: 'flex-start',
    borderWidth: 1,
    gap: 14,
  },
  // ESTADO NUEVO (VIBRANTE Y ENFOCADO)
  cardUnread: {
    backgroundColor: BRAND.white,
    borderColor: '#F5DDD6',
    shadowColor: BRAND.rose,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  // ESTADO LEÍDO (APAGADO / UX DE SEGUNDO PLANO)
  cardRead: {
    backgroundColor: '#F3EFE9', // Fondo más oscuro/crema mitigado
    borderColor: BRAND.border,
    opacity: 0.65, // 👈 Atenuación visual del 35% para descanso del ojo
  },
  iconContainer: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  textContainer: { flex: 1, gap: 4 },
  cardHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardTitle: { fontSize: 14, flex: 1 },
  cardTitleUnread: { color: BRAND.ink, fontWeight: '800' },
  cardTitleRead: { color: '#666666', fontWeight: '500' },
  cardBody: { fontSize: 13, lineHeight: 18 },
  cardBodyUnread: { color: BRAND.ink },
  cardBodyRead: { color: '#555555' },
  unreadDot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: '#FF3B30', marginLeft: 8 },
  cardTime: { fontSize: 11, color: BRAND.textSecondary, marginTop: 2 },
});