// app/orders/[id].tsx
//
// Pantalla de destino al tocar una notificación de tipo 'order_status'.
// El formato de ruta ('/orders/<uuid>') viene fijo desde fn_notify_order_status
// (trigger de Postgres) — no cambiar el nombre de esta carpeta sin also
// actualizar el trigger.
//
// Combina: (1) timeline dinámico construido desde order_status_history,
// (2) recibo con los items de order_items y el desglose de totales.

import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
  Image,
} from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';

const BRAND = {
  cream: '#FAF7F2',
  ink: '#2C2018',
  inkMid: '#6B5744',
  rose: '#C8745A',
  green: '#2F6B4F',
  textSecondary: '#8E8E93',
  white: '#FFFFFF',
  border: '#EDE4D8',
  danger: '#C0392B',
};

// ─── Diccionario de presentación por estado ──────────────────────────────
// No depende del enum exacto de Postgres: si llega un estado desconocido,
// cae al fallback y no rompe la pantalla.
const STATUS_META: Record<string, { label: string; icon: keyof typeof Ionicons.glyphMap }> = {
  pending_payment: { label: 'Pedido recibido', icon: 'document-text-outline' },
  paid: { label: 'Pago confirmado', icon: 'card-outline' },
  confirmed: { label: 'Pago confirmado', icon: 'card-outline' },
  preparing: { label: 'En el horno', icon: 'flame-outline' },
  in_production: { label: 'En el horno', icon: 'flame-outline' },
  ready: { label: '¡Tu pedido está listo!', icon: 'checkmark-circle-outline' },
  shipped: { label: 'Va en camino', icon: 'bicycle-outline' },
  out_for_delivery: { label: 'Va en camino', icon: 'bicycle-outline' },
  delivered: { label: 'Pedido entregado', icon: 'checkmark-done-outline' },
  cancelled: { label: 'Pedido cancelado', icon: 'close-circle-outline' },
  refunded: { label: 'Pedido reembolsado', icon: 'return-down-back-outline' },
};

function getStatusMeta(status: string) {
  return STATUS_META[status] ?? { label: status, icon: 'ellipse-outline' as const };
}

interface OrderRow {
  id: string;
  user_id: string | null;
  status: string;
  total_amount: number;
  shipping_cost: number;
  tax_amount: number;
  discount_amount: number;
  delivery_date: string;
  delivery_time_slot: string;
  custom_message: string | null;
  created_at: string;
}

interface OrderItemRow {
  id: string;
  quantity: number;
  price_at_purchase: number;
  product_name_snapshot: string | null;
  variant_name_snapshot: string | null;
  image_snapshot: string | null;
}

interface StatusHistoryRow {
  id: string;
  old_status: string | null;
  new_status: string;
  changed_at: string;
}

const formatCOP = (value: number) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(
    value ?? 0
  );

export default function OrderDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [loading, setLoading] = useState(true);
  const [unauthorized, setUnauthorized] = useState(false);
  const [order, setOrder] = useState<OrderRow | null>(null);
  const [items, setItems] = useState<OrderItemRow[]>([]);
  const [history, setHistory] = useState<StatusHistoryRow[]>([]);

  const loadOrder = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setUnauthorized(false);

    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.user) {
      setUnauthorized(true);
      setLoading(false);
      return;
    }

    // Filtro defensivo por user_id además de RLS: si RLS falla o no está
    // bien configurado en 'orders', esta línea igual evita mostrar pedidos
    // de otro usuario. Nunca confiar solo en el cliente para esto.
    const { data: orderData, error: orderError } = await supabase
      .from('orders')
      .select(
        'id, user_id, status, total_amount, shipping_cost, tax_amount, discount_amount, delivery_date, delivery_time_slot, custom_message, created_at'
      )
      .eq('id', id)
      .eq('user_id', session.user.id)
      .maybeSingle();

    if (orderError || !orderData) {
      // No distinguimos "no existe" de "es de otro usuario": mismo mensaje
      // genérico para no filtrar información sobre pedidos ajenos.
      setUnauthorized(true);
      setLoading(false);
      return;
    }

    setOrder(orderData as OrderRow);

    const [{ data: itemsData }, { data: historyData }] = await Promise.all([
      supabase
        .from('order_items')
        .select('id, quantity, price_at_purchase, product_name_snapshot, variant_name_snapshot, image_snapshot')
        .eq('order_id', id),
      supabase
        .from('order_status_history')
        .select('id, old_status, new_status, changed_at')
        .eq('order_id', id)
        .order('changed_at', { ascending: true }),
    ]);

    setItems((itemsData ?? []) as OrderItemRow[]);
    setHistory((historyData ?? []) as StatusHistoryRow[]);
    setLoading(false);
  }, [id]);

  useEffect(() => {
    loadOrder();
  }, [loadOrder]);

  // Realtime: si el pedido cambia de estado mientras el usuario está viendo
  // la pantalla (ej. le llega "va en camino" en vivo), se refleja solo.
  useEffect(() => {
    if (!id) return;
    const channel = supabase
      .channel(`order_detail:${id}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'orders', filter: `id=eq.${id}` },
        () => loadOrder()
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'order_status_history', filter: `order_id=eq.${id}` },
        () => loadOrder()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [id, loadOrder]);

  const subtotal = items.reduce((acc, it) => acc + it.price_at_purchase * it.quantity, 0);

  if (loading) {
    return (
      <>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={s.center}>
          <ActivityIndicator size="large" color={BRAND.rose} />
        </View>
      </>
    );
  }

  if (unauthorized || !order) {
    return (
      <>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={s.center}>
          <Ionicons name="alert-circle-outline" size={48} color={BRAND.textSecondary} />
          <Text style={s.emptyTitle}>No pudimos mostrar este pedido</Text>
          <Text style={s.emptySubtitle}>
            Puede que ya no exista o que no tengas acceso a él.
          </Text>
          <TouchableOpacity style={s.backBtn} onPress={() => router.replace('/(tabs)')}>
            <Text style={s.backBtnText}>Volver al inicio</Text>
          </TouchableOpacity>
        </View>
      </>
    );
  }

  const currentMeta = getStatusMeta(order.status);

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={s.container}>
        <View style={[s.header, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="arrow-back" size={24} color={BRAND.ink} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={s.headerTitle}>Pedido #{order.id.slice(0, 8)}</Text>
          <Text style={s.headerSubtitle}>{currentMeta.label}</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        {/* ─── Timeline ─── */}
        <Text style={s.sectionTitle}>Estado del pedido</Text>
        <View style={s.timelineCard}>
          {history.length === 0 ? (
            <View style={s.timelineRow}>
              <Ionicons name={currentMeta.icon} size={20} color={BRAND.rose} />
              <Text style={s.timelineLabel}>{currentMeta.label}</Text>
            </View>
          ) : (
            history.map((h, idx) => {
              const meta = getStatusMeta(h.new_status);
              const isLast = idx === history.length - 1;
              return (
                <View key={h.id} style={s.timelineRow}>
                  <View style={s.timelineIconCol}>
                    <View style={[s.timelineDot, isLast && s.timelineDotActive]}>
                      <Ionicons
                        name={meta.icon}
                        size={16}
                        color={isLast ? BRAND.white : BRAND.rose}
                      />
                    </View>
                    {idx < history.length - 1 && <View style={s.timelineLine} />}
                  </View>
                  <View style={{ flex: 1, paddingBottom: 18 }}>
                    <Text style={[s.timelineLabel, isLast && s.timelineLabelActive]}>
                      {meta.label}
                    </Text>
                    <Text style={s.timelineDate}>
                      {new Date(h.changed_at).toLocaleString('es-CO', {
                        day: 'numeric',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </Text>
                  </View>
                </View>
              );
            })
          )}
        </View>

        {/* ─── Entrega ─── */}
        <Text style={s.sectionTitle}>Entrega</Text>
        <View style={s.card}>
          <View style={s.rowBetween}>
            <Text style={s.muted}>Fecha</Text>
            <Text style={s.value}>
              {new Date(order.delivery_date).toLocaleDateString('es-CO', {
                day: 'numeric',
                month: 'long',
              })}
            </Text>
          </View>
          <View style={s.rowBetween}>
            <Text style={s.muted}>Horario</Text>
            <Text style={s.value}>{order.delivery_time_slot}</Text>
          </View>
          {!!order.custom_message && (
            <View style={{ marginTop: 8 }}>
              <Text style={s.muted}>Mensaje personalizado</Text>
              <Text style={s.value}>{order.custom_message}</Text>
            </View>
          )}
        </View>

        {/* ─── Recibo ─── */}
        <Text style={s.sectionTitle}>Tu pedido</Text>
        <View style={s.card}>
          {items.map((it) => (
            <View key={it.id} style={s.itemRow}>
              {it.image_snapshot ? (
                <Image source={{ uri: it.image_snapshot }} style={s.itemImage} />
              ) : (
                <View style={[s.itemImage, s.itemImagePlaceholder]}>
                  <Ionicons name="fast-food-outline" size={20} color={BRAND.textSecondary} />
                </View>
              )}
              <View style={{ flex: 1 }}>
                <Text style={s.itemName} numberOfLines={2}>
                  {it.product_name_snapshot ?? 'Producto'}
                  {it.variant_name_snapshot ? ` · ${it.variant_name_snapshot}` : ''}
                </Text>
                <Text style={s.itemQty}>x{it.quantity}</Text>
              </View>
              <Text style={s.itemPrice}>{formatCOP(it.price_at_purchase * it.quantity)}</Text>
            </View>
          ))}

          <View style={s.divider} />

          <View style={s.rowBetween}>
            <Text style={s.muted}>Subtotal</Text>
            <Text style={s.value}>{formatCOP(subtotal)}</Text>
          </View>
          <View style={s.rowBetween}>
            <Text style={s.muted}>Envío</Text>
            <Text style={s.value}>{formatCOP(order.shipping_cost)}</Text>
          </View>
          {order.discount_amount > 0 && (
            <View style={s.rowBetween}>
              <Text style={s.muted}>Descuento</Text>
              <Text style={[s.value, { color: BRAND.green }]}>
                -{formatCOP(order.discount_amount)}
              </Text>
            </View>
          )}
          <View style={s.rowBetween}>
            <Text style={s.totalLabel}>Total</Text>
            <Text style={s.totalValue}>{formatCOP(order.total_amount)}</Text>
          </View>
        </View>
      </ScrollView>
    </View>
    </>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: BRAND.cream },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
    gap: 10,
    backgroundColor: BRAND.cream,
  },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: BRAND.ink, marginTop: 8 },
  emptySubtitle: { fontSize: 13, color: BRAND.textSecondary, textAlign: 'center', lineHeight: 18 },
  backBtn: {
    marginTop: 12,
    backgroundColor: BRAND.rose,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 24,
  },
  backBtnText: { color: BRAND.white, fontWeight: '700', fontSize: 13 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingBottom: 16,
    backgroundColor: BRAND.white,
    borderBottomWidth: 1,
    borderBottomColor: BRAND.border,
  },
  headerTitle: { fontSize: 17, fontWeight: '800', color: BRAND.ink },
  headerSubtitle: { fontSize: 12, color: BRAND.rose, fontWeight: '600', marginTop: 2 },
  content: { padding: 16, gap: 8, paddingBottom: 40 },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: BRAND.inkMid,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginTop: 12,
    marginBottom: 8,
  },
  card: {
    backgroundColor: BRAND.white,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: BRAND.border,
    gap: 10,
  },
  timelineCard: {
    backgroundColor: BRAND.white,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: BRAND.border,
  },
  timelineRow: { flexDirection: 'row', gap: 12 },
  timelineIconCol: { alignItems: 'center' },
  timelineDot: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: BRAND.cream,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: BRAND.border,
  },
  timelineDotActive: { backgroundColor: BRAND.rose, borderColor: BRAND.rose },
  timelineLine: { width: 2, flex: 1, backgroundColor: BRAND.border, marginTop: 2 },
  timelineLabel: { fontSize: 14, fontWeight: '600', color: BRAND.inkMid },
  timelineLabelActive: { color: BRAND.ink, fontWeight: '800' },
  timelineDate: { fontSize: 11, color: BRAND.textSecondary, marginTop: 2 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  muted: { fontSize: 13, color: BRAND.textSecondary },
  value: { fontSize: 13, fontWeight: '600', color: BRAND.ink },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 6 },
  itemImage: { width: 44, height: 44, borderRadius: 10, backgroundColor: BRAND.cream },
  itemImagePlaceholder: { alignItems: 'center', justifyContent: 'center' },
  itemName: { fontSize: 13, fontWeight: '600', color: BRAND.ink },
  itemQty: { fontSize: 12, color: BRAND.textSecondary, marginTop: 2 },
  itemPrice: { fontSize: 13, fontWeight: '700', color: BRAND.ink },
  divider: { height: 1, backgroundColor: BRAND.border, marginVertical: 8 },
  totalLabel: { fontSize: 15, fontWeight: '800', color: BRAND.ink },
  totalValue: { fontSize: 16, fontWeight: '800', color: BRAND.rose },
});
