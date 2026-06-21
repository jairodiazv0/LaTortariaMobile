import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  Alert,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CartItem, useCartStore } from '../../store/useCartStore';

// ─── Constantes ───────────────────────────────────────────────────────────────

const SHIPPING_COST = 10_000;
const FREE_SHIPPING_THRESHOLD = 100_000;

const BRAND = {
  orange: '#FF6B00',
  background: '#F5F7FA',
  surface: '#FFFFFF',
  textPrimary: '#1A1A1A',
  textSecondary: '#8E8E93',
  textMuted: '#3A3A3C',
  border: '#E5E5EA',
  red: '#FF3B30',
  green: '#34C759',
  imagePlaceholder: '#EDEEF2',
} as const;

// ─── Utilidades ───────────────────────────────────────────────────────────────

function formatCOP(price: number): string {
  return `$${price.toLocaleString('es-CO')}`;
}

// ─── Subcomponentes ───────────────────────────────────────────────────────────

interface CartItemCardProps {
  item: CartItem;
  onUpdateQuantity: (cartId: string, qty: number) => void;
  onRemove: (cartId: string) => void;
}

function CartItemCard({ item, onUpdateQuantity, onRemove }: CartItemCardProps) {
  const addOnsCost = item.add_ons.reduce((sum, a) => sum + a.price, 0);
  const lineTotal = (item.base_price + addOnsCost) * item.quantity;

  const handleRemove = () => {
    Alert.alert(
      'Eliminar del carrito',
      `¿Deseas eliminar "${item.name}" de tu pedido?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: () => onRemove(item.cart_id),
        },
      ]
    );
  };

  return (
    <View style={styles.card}>
      {/* Imagen del pastel */}
      <View style={styles.cardImageWrapper}>
        {item.image_url ? (
          <Image
            source={{ uri: item.image_url }}
            style={styles.cardImage}
            resizeMode="cover"
          />
        ) : (
          <View style={styles.cardImageFallback}>
            <Text style={styles.cardImageEmoji}>🍰</Text>
          </View>
        )}
      </View>

      {/* Contenido central */}
      <View style={styles.cardContent}>
        {/* Nombre y tamaño */}
        <View style={styles.cardHeader}>
          <Text style={styles.cardName} numberOfLines={2}>{item.name}</Text>
          <TouchableOpacity
            style={styles.removeButton}
            onPress={handleRemove}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Feather name="trash-2" size={18} color={BRAND.red} />
          </TouchableOpacity>
        </View>

        <Text style={styles.cardSize}>{item.size_label}</Text>

        {/* Complementos activos */}
        {item.add_ons.length > 0 && (
          <View style={styles.addOnsRow}>
            {item.add_ons.map((addon) => (
              <View key={addon.id} style={styles.addOnChip}>
                <Text style={styles.addOnChipText}>
                  + {addon.name}
                  {addon.price > 0 ? ` (${formatCOP(addon.price)})` : ' (Gratis)'}
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* Badge de personalización */}
        {item.customization?.custom_text && (
          <View style={styles.customizationBadge}>
            <Feather name="edit-3" size={11} color={BRAND.orange} style={styles.customizationIcon} />
            <Text style={styles.customizationText} numberOfLines={2}>
              Dedicatoria: "{item.customization.custom_text}"
            </Text>
          </View>
        )}

        {/* Pie: precio + controles cantidad */}
        <View style={styles.cardFooter}>
          <Text style={styles.cardLineTotal}>{formatCOP(lineTotal)}</Text>

          <View style={styles.qtySelector}>
            <TouchableOpacity
              style={styles.qtyBtn}
              activeOpacity={0.8}
              onPress={() => onUpdateQuantity(item.cart_id, item.quantity - 1)}>
              <Feather name="minus" size={14} color={BRAND.textPrimary} />
            </TouchableOpacity>
            <Text style={styles.qtyText}>{item.quantity}</Text>
            <TouchableOpacity
              style={styles.qtyBtn}
              activeOpacity={0.8}
              onPress={() => onUpdateQuantity(item.cart_id, item.quantity + 1)}>
              <Feather name="plus" size={14} color={BRAND.textPrimary} />
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </View>
  );
}

// ─── Pantalla Principal ───────────────────────────────────────────────────────

export default function CartScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const items = useCartStore((state) => state.items);
  const updateQuantity = useCartStore((state) => state.updateQuantity);
  const removeItem = useCartStore((state) => state.removeItem);
  const clearCart = useCartStore((state) => state.clearCart);
  const getTotalPrice = useCartStore((state) => state.getTotalPrice);

  const [couponCode, setCouponCode] = useState<string>('');
  const [appliedDiscount, setAppliedDiscount] = useState<number>(0);
  const [couponError, setCouponError] = useState<string | null>(null);

  const subtotal = getTotalPrice();
  const shipping = subtotal >= FREE_SHIPPING_THRESHOLD ? 0 : SHIPPING_COST;
  const total = subtotal + shipping - appliedDiscount;

  const handleApplyCoupon = () => {
    if (!couponCode.trim()) return;
    // Stub: En producción, esto consultará Supabase para validar el cupón
    setCouponError('Cupón no válido o expirado.');
    setAppliedDiscount(0);
  };

  const handleClearCart = () => {
    Alert.alert(
      'Vaciar carrito',
      '¿Deseas eliminar todos los productos de tu pedido?',
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Vaciar', style: 'destructive', onPress: clearCart },
      ]
    );
  };

  // ── Estado Vacío ────────────────────────────────────────────────────────────
  if (items.length === 0) {
    return (
      <View
        style={[
          styles.emptyContainer,
          { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 20 },
        ]}>
        <Text style={styles.emptyEmoji}>🛒</Text>
        <Text style={styles.emptyTitle}>Tu carrito está vacío</Text>
        <Text style={styles.emptySubtitle}>
          Todavía no has elegido ningún pastel.{'\n'}¡Explora nuestra vitrina y enamórate!
        </Text>
        <TouchableOpacity
          style={styles.exploreButton}
          activeOpacity={0.85}
          onPress={() => router.push('/')}>
          <Text style={styles.exploreButtonText}>🍰  Explorar pasteles</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── Carrito con productos ───────────────────────────────────────────────────
  return (
    <View style={styles.container}>
      {/* Encabezado */}
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <View style={styles.headerTitleRow}>
          <Text style={styles.headerTitle}>Mi Pedido</Text>
          <Text style={styles.headerCount}>
            {items.reduce((sum, i) => sum + i.quantity, 0)} ítem(s)
          </Text>
        </View>
        <TouchableOpacity onPress={handleClearCart} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={styles.clearCartText}>Vaciar todo</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: insets.bottom + 130 },
        ]}
        showsVerticalScrollIndicator={false}>

        {/* Lista de productos */}
        <View style={styles.itemsSection}>
          {items.map((item) => (
            <CartItemCard
              key={item.cart_id}
              item={item}
              onUpdateQuantity={updateQuantity}
              onRemove={removeItem}
            />
          ))}
        </View>

        {/* Cupón de descuento */}
        <View style={styles.couponSection}>
          <Text style={styles.couponTitle}>¿Tienes un cupón?</Text>
          <View style={styles.couponRow}>
            <TextInput
              style={styles.couponInput}
              placeholder="Ingresa tu código de descuento"
              placeholderTextColor={BRAND.textSecondary}
              value={couponCode}
              onChangeText={(t) => {
                setCouponCode(t.toUpperCase());
                setCouponError(null);
              }}
              autoCapitalize="characters"
              returnKeyType="done"
            />
            <TouchableOpacity
              style={styles.couponButton}
              activeOpacity={0.85}
              onPress={handleApplyCoupon}>
              <Text style={styles.couponButtonText}>Aplicar</Text>
            </TouchableOpacity>
          </View>
          {couponError && (
            <Text style={styles.couponError}>{couponError}</Text>
          )}
          {appliedDiscount > 0 && (
            <Text style={styles.couponSuccess}>
              ✅ Descuento aplicado: -{formatCOP(appliedDiscount)}
            </Text>
          )}
        </View>

        {/* Desglose financiero */}
        <View style={styles.summarySection}>
          <Text style={styles.summaryTitle}>Resumen del pedido</Text>

          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Subtotal productos</Text>
            <Text style={styles.summaryValue}>{formatCOP(subtotal)}</Text>
          </View>

          <View style={styles.summaryRow}>
            <View style={styles.summaryLabelRow}>
              <Text style={styles.summaryLabel}>Envío</Text>
              {shipping === 0 && (
                <View style={styles.freeShippingBadge}>
                  <Text style={styles.freeShippingBadgeText}>GRATIS</Text>
                </View>
              )}
            </View>
            <Text style={[styles.summaryValue, shipping === 0 && styles.freeShippingValue]}>
              {shipping === 0 ? 'Gratis' : formatCOP(shipping)}
            </Text>
          </View>

          {appliedDiscount > 0 && (
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Descuento cupón</Text>
              <Text style={styles.discountValue}>-{formatCOP(appliedDiscount)}</Text>
            </View>
          )}

          <View style={styles.summaryDivider} />

          <View style={styles.summaryRow}>
            <Text style={styles.totalLabel}>Total a pagar</Text>
            <Text style={styles.totalValue}>{formatCOP(total)}</Text>
          </View>

          {shipping > 0 && (
            <Text style={styles.freeShippingHint}>
              🚚 Agrega {formatCOP(FREE_SHIPPING_THRESHOLD - subtotal)} más para envío gratis
            </Text>
          )}
        </View>
      </ScrollView>

      {/* Botón de Checkout Fijo */}
      <View style={[styles.checkoutBar, { paddingBottom: Math.max(insets.bottom, 20) }]}>
        <TouchableOpacity
          style={styles.checkoutButton}
          activeOpacity={0.88}
          onPress={() => {
            // TODO: Enlazar al flujo de checkout en pasos
            Alert.alert('¡Listo!', 'Flujo de checkout próximamente. 🎉');
          }}>
          <Text style={styles.checkoutButtonText}>Continuar compra</Text>
          <Feather name="arrow-right" size={20} color="#FFFFFF" style={styles.checkoutArrow} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── Estilos ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BRAND.background,
  },

  // ── Vacío ────────────────────────────────────────────────────────────────────
  emptyContainer: {
    flex: 1,
    backgroundColor: BRAND.background,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
  },
  emptyEmoji: {
    fontSize: 72,
    marginBottom: 20,
  },
  emptyTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: BRAND.textPrimary,
    marginBottom: 10,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 15,
    color: BRAND.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 32,
  },
  exploreButton: {
    backgroundColor: BRAND.orange,
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 32,
  },
  exploreButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },

  // ── Encabezado ───────────────────────────────────────────────────────────────
  header: {
    backgroundColor: BRAND.surface,
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: BRAND.border,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: BRAND.textPrimary,
  },
  headerCount: {
    fontSize: 14,
    fontWeight: '500',
    color: BRAND.textSecondary,
  },
  clearCartText: {
    fontSize: 13,
    fontWeight: '600',
    color: BRAND.red,
  },

  // ── Scroll ───────────────────────────────────────────────────────────────────
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    gap: 12,
  },

  // ── Sección items ─────────────────────────────────────────────────────────
  itemsSection: {
    gap: 12,
  },

  // ── Tarjeta de producto ───────────────────────────────────────────────────
  card: {
    flexDirection: 'row',
    backgroundColor: BRAND.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: BRAND.border,
    padding: 12,
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2,
  },
  cardImageWrapper: {
    width: 88,
    height: 88,
    borderRadius: 12,
    overflow: 'hidden',
    flexShrink: 0,
    backgroundColor: BRAND.imagePlaceholder,
  },
  cardImage: {
    width: '100%',
    height: '100%',
  },
  cardImageFallback: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardImageEmoji: {
    fontSize: 34,
  },
  cardContent: {
    flex: 1,
    minHeight: 88,
    justifyContent: 'space-between',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 6,
  },
  cardName: {
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
    color: BRAND.textPrimary,
    lineHeight: 19,
  },
  removeButton: {
    padding: 2,
  },
  cardSize: {
    fontSize: 12,
    fontWeight: '500',
    color: BRAND.textSecondary,
    marginTop: 2,
  },
  addOnsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 5,
    marginTop: 5,
  },
  addOnChip: {
    backgroundColor: '#FFF5EE',
    borderRadius: 6,
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderWidth: 1,
    borderColor: '#FFE0C2',
  },
  addOnChipText: {
    fontSize: 10,
    fontWeight: '600',
    color: BRAND.orange,
  },
  customizationBadge: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#F5F0FF',
    borderRadius: 8,
    paddingVertical: 5,
    paddingHorizontal: 8,
    marginTop: 6,
    borderWidth: 1,
    borderColor: '#E8DCFF',
    gap: 4,
  },
  customizationIcon: {
    marginTop: 1,
  },
  customizationText: {
    flex: 1,
    fontSize: 11,
    color: '#6B3FA0',
    fontStyle: 'italic',
    lineHeight: 15,
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  cardLineTotal: {
    fontSize: 15,
    fontWeight: '800',
    color: BRAND.textPrimary,
  },
  qtySelector: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: BRAND.background,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: BRAND.border,
    paddingHorizontal: 4,
    height: 32,
  },
  qtyBtn: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyText: {
    fontSize: 14,
    fontWeight: '700',
    color: BRAND.textPrimary,
    minWidth: 22,
    textAlign: 'center',
  },

  // ── Cupón ────────────────────────────────────────────────────────────────────
  couponSection: {
    backgroundColor: BRAND.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: BRAND.border,
    padding: 16,
    marginTop: 4,
  },
  couponTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: BRAND.textPrimary,
    marginBottom: 10,
  },
  couponRow: {
    flexDirection: 'row',
    gap: 10,
  },
  couponInput: {
    flex: 1,
    height: 44,
    backgroundColor: BRAND.background,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: BRAND.border,
    paddingHorizontal: 12,
    fontSize: 13,
    fontWeight: '600',
    color: BRAND.textPrimary,
    letterSpacing: 1,
  },
  couponButton: {
    backgroundColor: BRAND.textPrimary,
    borderRadius: 10,
    height: 44,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  couponButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  couponError: {
    marginTop: 8,
    fontSize: 12,
    color: BRAND.red,
    fontWeight: '500',
  },
  couponSuccess: {
    marginTop: 8,
    fontSize: 12,
    color: BRAND.green,
    fontWeight: '600',
  },

  // ── Resumen financiero ────────────────────────────────────────────────────────
  summarySection: {
    backgroundColor: BRAND.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: BRAND.border,
    padding: 18,
    marginTop: 4,
    gap: 12,
  },
  summaryTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: BRAND.textPrimary,
    marginBottom: 2,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  summaryLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  summaryLabel: {
    fontSize: 14,
    color: BRAND.textMuted,
    fontWeight: '500',
  },
  summaryValue: {
    fontSize: 14,
    color: BRAND.textPrimary,
    fontWeight: '600',
  },
  freeShippingBadge: {
    backgroundColor: '#E6F9ED',
    borderRadius: 5,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  freeShippingBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: BRAND.green,
    letterSpacing: 0.5,
  },
  freeShippingValue: {
    color: BRAND.green,
  },
  discountValue: {
    fontSize: 14,
    color: BRAND.green,
    fontWeight: '700',
  },
  summaryDivider: {
    height: 1,
    backgroundColor: BRAND.border,
    marginVertical: 2,
  },
  totalLabel: {
    fontSize: 16,
    fontWeight: '800',
    color: BRAND.textPrimary,
  },
  totalValue: {
    fontSize: 20,
    fontWeight: '900',
    color: BRAND.orange,
  },
  freeShippingHint: {
    fontSize: 12,
    color: BRAND.textSecondary,
    textAlign: 'center',
    marginTop: 2,
  },

  // ── Checkout ─────────────────────────────────────────────────────────────────
  checkoutBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: BRAND.surface,
    borderTopWidth: 1,
    borderTopColor: BRAND.border,
    paddingTop: 14,
    paddingHorizontal: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 10,
  },
  checkoutButton: {
    backgroundColor: BRAND.orange,
    borderRadius: 16,
    height: 54,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    shadowColor: BRAND.orange,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 6,
  },
  checkoutButtonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  checkoutArrow: {
    marginLeft: 2,
  },
});