import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  StyleSheet,
  Platform,
  KeyboardAvoidingView,
  Image,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import * as SecureStore from 'expo-secure-store';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';

import { CartItem, useCartStore } from '../../store/useCartStore';
import { supabase } from '../../lib/supabase';
import { usePushPermissionRequest } from '../../hooks/usePushPermissionRequest'; // [PUSH v1]
import { PushPermissionModal } from '../../components/PushPermissionModal'; // [PUSH v1]

// ─── Constantes ───────────────────────────────────────────────────────────────

const BRAND = {
  orange: '#FF6B00',
  primary: '#FF6B00',
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

function getAvailableDeliveryDays() {
  const days = [];
  const weekdays = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
  const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

  const now = new Date();

  // REGLA 1: Hora de corte (15:00)
  const minDate = new Date(now);
  minDate.setHours(0, 0, 0, 0);
  if (now.getHours() < 15) {
    minDate.setDate(minDate.getDate() + 1); // Hoy + 1
  } else {
    minDate.setDate(minDate.getDate() + 2); // Hoy + 2
  }

  // REGLA 2: Extensión del rango máximo (2 meses)
  const maxDate = new Date(now);
  maxDate.setHours(0, 0, 0, 0);
  maxDate.setMonth(maxDate.getMonth() + 2);

  const currentDate = new Date(minDate);
  while (currentDate <= maxDate) {
    // Formato YYYY-MM-DD considerando la zona horaria local
    const yyyy = currentDate.getFullYear();
    const mm = String(currentDate.getMonth() + 1).padStart(2, '0');
    const dd = String(currentDate.getDate()).padStart(2, '0');

    days.push({
      dateString: `${yyyy}-${mm}-${dd}`,
      dayName: weekdays[currentDate.getDay()],
      dayNum: currentDate.getDate(),
      monthName: months[currentDate.getMonth()],
    });

    currentDate.setDate(currentDate.getDate() + 1);
  }

  return days;
}

// ─── Subcomponente: CartItemCard ──────────────────────────────────────────────

interface CartItemCardProps {
  item: CartItem;
  onUpdateQuantity: (cartId: string, qty: number) => void;
  onRemove: (cartId: string) => void;
}

function CartItemCard({ item, onUpdateQuantity, onRemove }: CartItemCardProps) {
  const addOnsCost = item.add_ons?.reduce((sum, a) => sum + a.price, 0) ?? 0;
  const lineTotal = (item.base_price + addOnsCost) * item.quantity;

  const handleRemove = () => {
    Alert.alert(
      'Eliminar del carrito',
      `¿Deseas eliminar "${item.name}" de tu pedido?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Eliminar', style: 'destructive', onPress: () => onRemove(item.cart_id) },
      ]
    );
  };

  return (
    <View style={styles.card}>
      <View style={styles.cardImageWrapper}>
        {item.image_url ? (
          <Image source={{ uri: item.image_url }} style={styles.cardImage} resizeMode="cover" />
        ) : (
          <View style={styles.cardImageFallback}>
            <Text style={styles.cardImageEmoji}>🍰</Text>
          </View>
        )}
      </View>

      <View style={styles.cardContent}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardName} numberOfLines={2}>{item.name}</Text>
          <TouchableOpacity onPress={handleRemove} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Feather name="trash-2" size={18} color={BRAND.red} />
          </TouchableOpacity>
        </View>

        <Text style={styles.cardSize}>{item.size_label}</Text>

        {item.add_ons && item.add_ons.length > 0 && (
          <View style={styles.addOnsRow}>
            {item.add_ons.map((addon) => (
              <View key={addon.id} style={styles.addOnChip}>
                <Text style={styles.addOnChipText}>
                  + {addon.name}{addon.price > 0 ? ` (${formatCOP(addon.price)})` : ' (Gratis)'}
                </Text>
              </View>
            ))}
          </View>
        )}

        {item.customization?.custom_text && (
          <View style={styles.customizationBadge}>
            <Feather name="edit-3" size={11} color={BRAND.orange} style={{ marginTop: 1 }} />
            <Text style={styles.customizationText} numberOfLines={2}>
              Dedicatoria: "{item.customization.custom_text}"
            </Text>
          </View>
        )}

        <View style={styles.cardFooter}>
          <Text style={styles.cardLineTotal}>{formatCOP(lineTotal)}</Text>
          <View style={styles.qtySelector}>
            <TouchableOpacity
              style={styles.qtyBtn}
              onPress={() => onUpdateQuantity(item.cart_id, item.quantity - 1)}>
              <Feather name="minus" size={14} color={BRAND.textPrimary} />
            </TouchableOpacity>
            <Text style={styles.qtyText}>{item.quantity}</Text>
            <TouchableOpacity
              style={styles.qtyBtn}
              onPress={() => onUpdateQuantity(item.cart_id, item.quantity + 1)}>
              <Feather name="plus" size={14} color={BRAND.textPrimary} />
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </View>
  );
}

// ─── Componente Principal ────────────────────────────────────────────────────

export default function CartScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  // Store
  const items = useCartStore((s) => s.items);
  const updateQuantity = useCartStore((s) => s.updateQuantity);
  const removeItem = useCartStore((s) => s.removeItem);
  const clearCart = useCartStore((s) => s.clearCart);
  const getTotalPrice = useCartStore((s) => s.getTotalPrice);
  const isVerifyingPayment = useCartStore((s) => s.isVerifyingPayment);
  const setVerifyingPayment = useCartStore((s) => s.setVerifyingPayment);

  // Máquina de estados local
  const [checkoutStep, setCheckoutStep] = useState<'cart' | 'delivery' | 'verifying'>('cart');
  const [currentOrderId, setCurrentOrderId] = useState<string | null>(null);
  const [shippingCost, setShippingCost] = useState<number>(10000); // Fallback por defecto
  const [freeShippingThreshold, setFreeShippingThreshold] = useState<number>(100000); // Fallback por defecto

  // SPEC 1: Refs para distinguir cierre manual vs cierre por deep link
  const isPollingRef = useRef(false);
  const closedByDeepLinkRef = useRef(false);

  // Campos del formulario de entrega
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [neighborhood, setNeighborhood] = useState('');
  const [deliveryDate, setDeliveryDate] = useState('');
  const [deliverySlot, setDeliverySlot] = useState('');

  // Cupones
  const [couponCode, setCouponCode] = useState('');
  const [appliedDiscount, setAppliedDiscount] = useState(0);
  const [appliedCouponId, setAppliedCouponId] = useState<string | null>(null);
  const [appliedCouponCode, setAppliedCouponCode] = useState<string | null>(null);
  const [couponError, setCouponError] = useState<string | null>(null);
  const [isValidatingCoupon, setIsValidatingCoupon] = useState(false);

  const [showPushModal, setShowPushModal] = useState(false); // [PUSH v1]
  const { checkPushEligibility, requestPushPermission } = usePushPermissionRequest(); // [PUSH v1]

  const subtotal = getTotalPrice();
  const shipping = subtotal >= freeShippingThreshold ? 0 : shippingCost;
  const total = subtotal + shipping - appliedDiscount;

  // ── Pre-poblar datos del usuario autenticado ──────────────────────────────
  useEffect(() => {
    async function loadUserData() {
      try {
        // Consultar la configuración centralizada de envíos
        const { data: shippingConfig, error: shippingError } = await supabase
          .from('system_settings')
          .select('shipping_fee, free_shipping_threshold')
          .eq('id', 'shipping_config')
          .maybeSingle();

        if (shippingError) {
          console.error('❌ Error RLS o lectura en system_settings:', shippingError.message);
        }

        if (shippingConfig) {
          setShippingCost(Number(shippingConfig.shipping_fee));
          setFreeShippingThreshold(Number(shippingConfig.free_shipping_threshold));
        }

        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        setEmail(user.email ?? '');

        const { data: profile } = await supabase
          .from('profiles').select('full_name, phone').eq('id', user.id).single();
        if (profile?.full_name) setFullName(profile.full_name);
        if (profile?.phone) setPhone(profile.phone.replace(/\D/g, '').slice(0, 10));

        const { data: addr } = await supabase
          .from('user_addresses').select('address')
          .eq('user_id', user.id).eq('is_default', true).maybeSingle();
        if (addr?.address) {
          const a = addr.address as any;
          if (a.address_line) setAddress(a.address_line);
          if (a.notes) setNeighborhood(a.notes);
        }
      } catch (err) {
        console.error('Error pre-poblando usuario:', err);
      }
    }
    loadUserData();
  }, []);

  // ── SPEC: Recuperación post-RAM eviction (cold start) ─────────────────────
  useEffect(() => {
    const recoverPendingOrder = async () => {
      try {
        const savedOrderId = await SecureStore.getItemAsync('pending_order_id');
        if (savedOrderId) {
          setCurrentOrderId(savedOrderId);
          setCheckoutStep('verifying');
          // Pasar el ID directamente — NO depender del estado actualizado
          startOrderStatusPolling(savedOrderId);
        }
      } catch (error) {
        console.error('Error recuperando orden pendiente:', error);
      }
    };
    recoverPendingOrder();
  }, []); // Solo en montaje

  // ── SPEC 2: Efecto que reacciona a señal del store (listener en _layout.tsx)
  useEffect(() => {
    if (isVerifyingPayment && currentOrderId) {
      setVerifyingPayment(false); // Resetear la señal
      setCheckoutStep('verifying');
      startOrderStatusPolling(currentOrderId);
    }
  }, [isVerifyingPayment, currentOrderId]);

  // ── Polling con guardia de instancia única ─────────────────────────────────
  const startOrderStatusPolling = useCallback(async (orderId: string) => {
    // GUARDIA: Previene condición de carrera
    if (isPollingRef.current) return;
    isPollingRef.current = true;

    // SPEC 1: Señalizar que el cierre fue por deep link (no manual)
    closedByDeepLinkRef.current = true;

    const MAX_ATTEMPTS = 8;
    const INTERVAL_MS = 3000;

    try {
      for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, INTERVAL_MS));

        const res = await fetch(
          `https://www.latortaria.com/api/orders/${orderId}/status`,
          { headers: { 'x-platform': 'mobile' } }
        );
        if (!res.ok) continue;

        const data = await res.json();

        if (data.status === 'paid') {
          await SecureStore.deleteItemAsync('pending_order_id');
          clearCart();

          const eligible = await checkPushEligibility(); // [PUSH v1]

          Alert.alert(
            '¡Pedido confirmado! 🎉',
            'Tu pago fue aprobado. La cocina ya está preparando tu orden.',
            [{ 
              text: '¡Perfecto!', 
              onPress: () => {
                if (eligible) {
                  setShowPushModal(true); // [PUSH v1]
                } else {
                  router.replace('/'); // [PUSH v1]
                }
              }
            }]
          );
          return;
        }

        if (data.status === 'cancelled') {
          await SecureStore.deleteItemAsync('pending_order_id');
          setCheckoutStep('delivery');
          Alert.alert(
            'Pago no procesado',
            'La entidad bancaria no aprobó la transacción o decidiste cancelar. Tu carrito está guardado para intentarlo de nuevo.'
          );
          return;
        }
        // 'pending_payment' → continuar reintentando
      }

      // Escape de emergencia: 8 intentos agotados
      setCheckoutStep('delivery');
      Alert.alert(
        'Verificación en proceso',
        'Tu banco está procesando la transacción. No vaciaremos tu carrito hasta confirmar. Te llegará confirmación al correo registrado.'
      );
    } catch (error) {
      console.error('Error en polling de estado:', error);
      setCheckoutStep('delivery');
      Alert.alert(
        'Error de conexión',
        'No pudimos verificar el estado de tu pago. Tu carrito está guardado. Revisa tu correo o contáctanos.'
      );
    } finally {
      // SIEMPRE liberar la guardia, incluso si hay excepciones
      isPollingRef.current = false;
    }
  }, [clearCart, router]);

  // ── Validaciones del formulario ────────────────────────────────────────────
  const validateDeliveryForm = (): boolean => {
    if (!fullName.trim()) {
      Alert.alert('Campo requerido', 'Por favor ingresa tu nombre completo.');
      return false;
    }
    const phoneRegex = /^3\d{9}$/;
    if (!phoneRegex.test(phone.trim())) {
      Alert.alert('Celular inválido', 'Por favor ingresa un número celular válido de Colombia (Ej: 3001234567).');
      return false;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const DISPOSABLE_DOMAINS = [
      'mailinator.com', 'yopmail.com', 'tempmail.com', 'guerrillamail.com',
      'dispostable.com', 'fakeinbox.com', 'throwam.com', 'maildrop.cc',
    ];
    const emailDomain = email.trim().split('@')[1]?.toLowerCase();
    if (!emailRegex.test(email.trim())) {
      Alert.alert('Correo inválido', 'Por favor ingresa un correo electrónico válido.');
      return false;
    }
    if (DISPOSABLE_DOMAINS.includes(emailDomain)) {
      Alert.alert('Correo no permitido', 'Por favor ingresa un correo real. No aceptamos correos temporales.');
      return false;
    }
    if (!address.trim()) { Alert.alert('Campo requerido', 'La dirección de entrega es obligatoria.'); return false; }
    if (!neighborhood.trim()) { Alert.alert('Campo requerido', 'El barrio o indicaciones son obligatorios.'); return false; }
    if (!deliveryDate.trim()) { Alert.alert('Campo requerido', 'Selecciona una fecha de entrega.'); return false; }
    if (!deliverySlot.trim()) { Alert.alert('Campo requerido', 'Selecciona una franja horaria de entrega.'); return false; }
    return true;
  };

  // ── Función principal: Iniciar Pago ────────────────────────────────────────
  const handleConfirmAndPay = async () => {
    if (!validateDeliveryForm()) return;

    try {
      const authenticatedUserId = (await supabase.auth.getUser()).data.user?.id ?? null;

      // ⚡ ¡CORREGIDO! Cambiamos .update() por .upsert() para asegurar la creación de la fila.
      // Pasamos también el full_name obligatorio por si es el primer registro del cliente.
      if (authenticatedUserId && phone.trim()) {
        const { error: profileUpdateError } = await supabase
          .from('profiles')
          .upsert({ 
            id: authenticatedUserId, 
            phone: phone.trim(),
            full_name: fullName.trim()
          }, { onConflict: 'id' });

        if (profileUpdateError) {
          console.error('❌ Error al persistir el celular en profiles:', profileUpdateError.message);
        }
      }

      const orderItems = items.map((item) => ({
        variant_id: item.variant_id,
        product_id: item.product_id,
        name: item.name,
        quantity: item.quantity,
        custom_text: item.customization?.custom_text ?? null,
        instructions: item.customization?.instructions ?? null,
      }));

      const response = await fetch('https://www.latortaria.com/api/checkout/initiate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }, // [CHANNEL v1]
        body: JSON.stringify({
          cart: orderItems,
          shipping_address: {
            full_name: fullName.trim(),
            phone: phone.trim(),
            address_line: address.trim(),
            city: 'Bogotá',
            notes: neighborhood.trim() || undefined,
          },
          delivery_date: deliveryDate.trim(),
          delivery_time_slot: deliverySlot.trim(),
          guest_email: email.trim(),
          user_id: authenticatedUserId,
          coupon_id: appliedCouponId,
          channel: 'mobile_app', // [CHANNEL v1]
        }),
      });

      const result = await response.json();

      if (!response.ok || result.error) {
        Alert.alert('Error en cocina', result.error ?? 'No pudimos procesar tu pedido. Intenta de nuevo.');
        return;
      }

      const { order_id, amount_in_cents, currency, signature, public_key } = result;

      // SPEC: Persistir order_id ANTES de abrir el browser (mitigación RAM eviction)
      await SecureStore.setItemAsync('pending_order_id', order_id);
      setCurrentOrderId(order_id);

      const redirectUrl = encodeURIComponent(
        `https://www.latortaria.com/checkout/mobile-redirect?id=${order_id}`
      );
      const wompiUrl =
        `https://checkout.wompi.co/p/` +
        `?public-key=${public_key}` +
        `&currency=${currency}` +
        `&amount-in-cents=${amount_in_cents}` +
        `&reference=${order_id}` +
        `&signature:integrity=${signature}` +
        `&redirect-url=${redirectUrl}`;

      // SPEC 1: Resetear la ref de cierre por deep link antes de abrir el browser
      closedByDeepLinkRef.current = false;

      // SPEC: NO usar openAuthSessionAsync — WOMPI usa redirect HTTPS
      await WebBrowser.openBrowserAsync(wompiUrl, {
        dismissButtonStyle: 'close',
        enableBarCollapsing: false,
      });

      // SPEC 1: La promesa resolvió — determinar causa del cierre
      if (!closedByDeepLinkRef.current) {
        // El usuario cerró el browser manualmente sin completar el pago
        await SecureStore.deleteItemAsync('pending_order_id');
        Alert.alert(
          'Pago cancelado',
          'Cerraste la ventana de pago. Tu carrito está guardado para que lo intentes cuando quieras.'
        );
        setCheckoutStep('delivery');
      }
      // Si closedByDeepLinkRef.current === true, el deep link ya activó el polling desde _layout.tsx

    } catch (error) {
      console.error('Error en handleConfirmAndPay:', error);
      Alert.alert('Error inesperado', 'Ocurrió un problema. Tu carrito está intacto. Intenta de nuevo.');
    }
  };

  // ── Validar cupón contra el backend ───────────────────────────────────────
  const handleApplyCoupon = async () => {
    if (!couponCode.trim()) return;
    setCouponError(null);
    setIsValidatingCoupon(true);
    try {
      // 🔒 Extraer el ID del usuario autenticado — crítico para validar un solo uso en el backend
      const authenticatedUserId = (await supabase.auth.getUser()).data.user?.id ?? null;

      const response = await fetch('https://www.latortaria.com/api/checkout/validate-coupon', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-platform': 'mobile' },
        body: JSON.stringify({
          code: couponCode.trim().toUpperCase(),
          orderAmount: subtotal,
          userId: authenticatedUserId, // 🔒 Crítico para validar un solo uso en el backend
        }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        setCouponError(data.error || 'Cupón no válido o expirado.');
        setAppliedDiscount(0); setAppliedCouponId(null); setAppliedCouponCode(null);
      } else {
        setAppliedDiscount(data.discountAmount);
        setAppliedCouponId(data.couponId);
        setAppliedCouponCode(couponCode.toUpperCase().trim());
        setCouponCode('');
      }
    } catch {
      setCouponError('Error de conexión al validar el cupón.');
    } finally {
      setIsValidatingCoupon(false);
    }
  };

  const removeCoupon = () => {
    setAppliedDiscount(0); setAppliedCouponId(null); setAppliedCouponCode(null); setCouponError(null);
  };

  const handleClearCart = () => {
    Alert.alert('Vaciar carrito', '¿Deseas eliminar todos los productos de tu pedido?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Vaciar', style: 'destructive', onPress: clearCart },
    ]);
  };

  // ══════════════════════════════════════════════════════════════════════════
  // RENDERIZADO POR PASOS
  // ══════════════════════════════════════════════════════════════════════════

  // ── Paso: VERIFYING ───────────────────────────────────────────────────────
  if (checkoutStep === 'verifying') {
    return (
      <View style={[styles.verifyingContainer, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={BRAND.primary} />
        <Text style={styles.verifyingTitle}>Confirmando con el banco</Text>
        <Text style={styles.verifyingSubtitle}>
          Estamos verificando la aprobación de tu transacción con la cocina.{'\n'}
          Por favor no cierres la aplicación.
        </Text>

        <PushPermissionModal 
          visible={showPushModal} 
          onAccept={async () => {
            await requestPushPermission(); // [PUSH v1]
            await SecureStore.setItemAsync('lt_push_permission_asked', 'true'); // [PUSH v1]
            setShowPushModal(false); // [PUSH v1]
            router.replace('/'); // [PUSH v1]
          }}
          onDecline={async () => {
            await SecureStore.setItemAsync('lt_push_permission_asked', 'true'); // [PUSH v1]
            setShowPushModal(false); // [PUSH v1]
            router.replace('/'); // [PUSH v1]
          }}
        /> 
      </View>
    );
  }

  // ── Paso: CARRITO VACÍO ───────────────────────────────────────────────────
  if (items.length === 0) {
    return (
      <View style={[styles.emptyContainer, { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 20 }]}>
        <Text style={styles.emptyEmoji}>🛒</Text>
        <Text style={styles.emptyTitle}>Tu carrito está vacío</Text>
        <Text style={styles.emptySubtitle}>
          Todavía no has elegido ningún pastel.{'\n'}¡Explora nuestra vitrina y enamórate!
        </Text>
        <TouchableOpacity style={styles.exploreButton} activeOpacity={0.85} onPress={() => router.push('/')}>
          <Text style={styles.exploreButtonText}>🍰  Explorar pasteles</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── Paso: CART ────────────────────────────────────────────────────────────
  if (checkoutStep === 'cart') {
    return (
      <View style={styles.container}>
        {/* Encabezado */}
        <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
          <View style={styles.headerTitleRow}>
            <Text style={styles.headerTitle}>Mi Pedido</Text>
            <Text style={styles.headerCount}>{items.reduce((s, i) => s + i.quantity, 0)} ítem(s)</Text>
          </View>
          <TouchableOpacity onPress={handleClearCart} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={styles.clearCartText}>Vaciar todo</Text>
          </TouchableOpacity>
        </View>

        <ScrollView
          contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 140 }]}
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

          {/* Cupón */}
          <View style={styles.couponSection}>
            <Text style={styles.couponTitle}>🎟️ ¿Tienes un cupón?</Text>
            {appliedCouponCode ? (
              <View style={styles.couponAppliedContainer}>
                <View>
                  <Text style={styles.couponAppliedText}>Cupón {appliedCouponCode} aplicado</Text>
                  <Text style={styles.couponAppliedDiscount}>Ahorras {formatCOP(appliedDiscount)}</Text>
                </View>
                <TouchableOpacity onPress={removeCoupon}>
                  <Feather name="x-circle" size={20} color={BRAND.red} />
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.couponRow}>
                <TextInput
                  style={styles.couponInput}
                  placeholder="CÓDIGO DE DESCUENTO"
                  placeholderTextColor={BRAND.textSecondary}
                  value={couponCode}
                  onChangeText={(t) => { setCouponCode(t.toUpperCase()); setCouponError(null); }}
                  autoCapitalize="characters"
                  returnKeyType="done"
                  editable={!isValidatingCoupon}
                />
                <TouchableOpacity
                  style={[styles.couponButton, (!couponCode.trim() || isValidatingCoupon) && styles.couponBtnDisabled]}
                  onPress={handleApplyCoupon}
                  disabled={isValidatingCoupon || !couponCode.trim()}>
                  {isValidatingCoupon
                    ? <ActivityIndicator size="small" color="#FFF" />
                    : <Text style={styles.couponButtonText}>Aplicar</Text>}
                </TouchableOpacity>
              </View>
            )}
            {couponError && <Text style={styles.couponError}>{couponError}</Text>}
          </View>

          {/* Resumen financiero */}
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
                🚚 Agrega {formatCOP(freeShippingThreshold - subtotal)} más para envío gratis
              </Text>
            )}
          </View>
        </ScrollView>

        {/* Botón fijo de checkout */}
        <View style={[styles.checkoutBar, { paddingBottom: Math.max(insets.bottom, 20) }]}>
          <TouchableOpacity
            style={styles.checkoutButton}
            activeOpacity={0.88}
            onPress={() => setCheckoutStep('delivery')}>
            <Text style={styles.checkoutButtonText}>Continuar compra</Text>
            <Feather name="arrow-right" size={20} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ── Paso: DELIVERY ────────────────────────────────────────────────────────
  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 88 : 0}>

      {/* Encabezado con volver */}
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => setCheckoutStep('cart')}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Feather name="arrow-left" size={20} color={BRAND.textPrimary} />
          <Text style={styles.backButtonText}>Carrito</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Entrega</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 140 }]}
        showsVerticalScrollIndicator={false}>

        <Text style={styles.sectionHeader}>1. Datos de Contacto</Text>

        <View style={styles.inputContainer}>
          <Text style={styles.inputLabel}>Nombre Completo *</Text>
          <TextInput
            style={styles.input}
            placeholder="Ej: Juan Pérez"
            placeholderTextColor={BRAND.textSecondary}
            value={fullName}
            onChangeText={setFullName}
          />
        </View>

        <View style={styles.inputContainer}>
          <Text style={styles.inputLabel}>Correo Electrónico *</Text>
          <TextInput
            style={styles.input}
            placeholder="tu@correo.com"
            placeholderTextColor={BRAND.textSecondary}
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
          />
        </View>

        <View style={styles.inputContainer}>
          <Text style={styles.inputLabel}>Teléfono Celular * (10 dígitos)</Text>
          <TextInput
            style={styles.input}
            placeholder="Ej: 3001234567"
            placeholderTextColor={BRAND.textSecondary}
            value={phone}
            onChangeText={setPhone}
            keyboardType="number-pad"
            maxLength={10}
          />
        </View>

        <Text style={[styles.sectionHeader, { marginTop: 12 }]}>2. Datos de Entrega</Text>

        <View style={styles.inputContainer}>
          <Text style={styles.inputLabel}>Dirección de Entrega *</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            placeholder="Ej: Carrera 12B # 34a-56 Apt 307"
            placeholderTextColor={BRAND.textSecondary}
            value={address}
            onChangeText={setAddress}
            multiline
            numberOfLines={2}
            textAlignVertical="top"
          />
        </View>

        <View style={styles.inputContainer}>
          <Text style={styles.inputLabel}>Barrio / Indicaciones adicionales *</Text>
          <TextInput
            style={styles.input}
            placeholder="Ej: Cedritos / Portería vehicular"
            placeholderTextColor={BRAND.textSecondary}
            value={neighborhood}
            onChangeText={setNeighborhood}
          />
        </View>

        <View style={styles.inputContainer}>
          <Text style={styles.inputLabel}>Fecha de Entrega *</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.daysScroll}>
            {getAvailableDeliveryDays().map((day) => {
              const isSelected = deliveryDate === day.dateString;
              return (
                <TouchableOpacity
                  key={day.dateString}
                  style={[styles.dayCard, isSelected && styles.dayCardSelected]}
                  onPress={() => setDeliveryDate(day.dateString)}>
                  <Text style={[styles.dayCardName, isSelected && styles.dayCardTextSelected]}>{day.dayName}</Text>
                  <Text style={[styles.dayCardNumber, isSelected && styles.dayCardTextSelected]}>{day.dayNum}</Text>
                  <Text style={[styles.dayCardMonth, isSelected && styles.dayCardTextSelected]}>{day.monthName}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        <View style={styles.inputContainer}>
          <Text style={styles.inputLabel}>Franja Horaria de Entrega *</Text>
          <View style={styles.slotsContainer}>
            {[
              { value: 'morning', label: 'Mañana (8 AM – 12 PM)', icon: 'sun' },
              { value: 'afternoon', label: 'Tarde (2 PM – 6 PM)', icon: 'cloud-rain' },
            ].map((slot) => (
              <TouchableOpacity
                key={slot.value}
                style={[styles.slotCard, deliverySlot === slot.value && styles.slotCardSelected]}
                onPress={() => setDeliverySlot(slot.value)}>
                <Feather
                  name={slot.icon as any}
                  size={16}
                  color={deliverySlot === slot.value ? BRAND.orange : BRAND.textSecondary}
                />
                <Text style={[styles.slotText, deliverySlot === slot.value && styles.slotTextSelected]}>
                  {slot.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </ScrollView>

      {/* Botón fijo de pago */}
      <View style={[styles.checkoutBar, { paddingBottom: Math.max(insets.bottom, 20) }]}>
        <TouchableOpacity style={styles.checkoutButton} activeOpacity={0.88} onPress={handleConfirmAndPay}>
          <Text style={styles.checkoutButtonText}>Pagar {formatCOP(total)}</Text>
          <Feather name="credit-card" size={18} color="#FFFFFF" />
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

// ─── Estilos ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BRAND.background },

  // Vacío
  emptyContainer: { flex: 1, backgroundColor: BRAND.background, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 },
  emptyEmoji: { fontSize: 72, marginBottom: 20 },
  emptyTitle: { fontSize: 22, fontWeight: '800', color: BRAND.textPrimary, marginBottom: 10, textAlign: 'center' },
  emptySubtitle: { fontSize: 15, color: BRAND.textSecondary, textAlign: 'center', lineHeight: 22, marginBottom: 32 },
  exploreButton: { backgroundColor: BRAND.orange, borderRadius: 16, paddingVertical: 14, paddingHorizontal: 32 },
  exploreButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },

  // Encabezado
  header: { backgroundColor: BRAND.surface, paddingHorizontal: 16, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: BRAND.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerTitleRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  headerTitle: { fontSize: 20, fontWeight: '800', color: BRAND.textPrimary },
  headerCount: { fontSize: 13, fontWeight: '500', color: BRAND.textSecondary },
  clearCartText: { fontSize: 13, fontWeight: '600', color: BRAND.red },
  backButton: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  backButtonText: { fontSize: 15, fontWeight: '600', color: BRAND.textPrimary },

  // Scroll
  scrollContent: { paddingHorizontal: 16, paddingTop: 16, gap: 12 },

  // Items
  itemsSection: { gap: 12 },

  // Card
  card: { flexDirection: 'row', backgroundColor: BRAND.surface, borderRadius: 18, borderWidth: 1, borderColor: BRAND.border, padding: 12, gap: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4, elevation: 2 },
  cardImageWrapper: { width: 88, height: 88, borderRadius: 12, overflow: 'hidden', backgroundColor: BRAND.imagePlaceholder },
  cardImage: { width: '100%', height: '100%' },
  cardImageFallback: { width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' },
  cardImageEmoji: { fontSize: 34 },
  cardContent: { flex: 1, minHeight: 88, justifyContent: 'space-between' },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 6 },
  cardName: { flex: 1, fontSize: 14, fontWeight: '700', color: BRAND.textPrimary, lineHeight: 19 },
  cardSize: { fontSize: 12, fontWeight: '500', color: BRAND.textSecondary, marginTop: 2 },
  addOnsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 5 },
  addOnChip: { backgroundColor: '#FFF5EE', borderRadius: 6, paddingVertical: 2, paddingHorizontal: 6, borderWidth: 1, borderColor: '#FFE0C2' },
  addOnChipText: { fontSize: 10, fontWeight: '600', color: BRAND.orange },
  customizationBadge: { flexDirection: 'row', alignItems: 'flex-start', backgroundColor: '#F5F0FF', borderRadius: 8, paddingVertical: 5, paddingHorizontal: 8, marginTop: 6, borderWidth: 1, borderColor: '#E8DCFF', gap: 4 },
  customizationText: { flex: 1, fontSize: 11, color: '#6B3FA0', fontStyle: 'italic', lineHeight: 15 },
  cardFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 },
  cardLineTotal: { fontSize: 15, fontWeight: '800', color: BRAND.textPrimary },
  qtySelector: { flexDirection: 'row', alignItems: 'center', backgroundColor: BRAND.background, borderRadius: 10, borderWidth: 1, borderColor: BRAND.border, paddingHorizontal: 4, height: 32 },
  qtyBtn: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  qtyText: { fontSize: 14, fontWeight: '700', color: BRAND.textPrimary, minWidth: 22, textAlign: 'center' },

  // Cupón
  couponSection: { backgroundColor: BRAND.surface, borderRadius: 18, borderWidth: 1, borderColor: BRAND.border, padding: 16, marginTop: 4 },
  couponTitle: { fontSize: 14, fontWeight: '700', color: BRAND.textPrimary, marginBottom: 10 },
  couponRow: { flexDirection: 'row', gap: 10 },
  couponInput: { flex: 1, height: 44, backgroundColor: BRAND.background, borderRadius: 10, borderWidth: 1, borderColor: BRAND.border, paddingHorizontal: 12, fontSize: 13, fontWeight: '600', color: BRAND.textPrimary, letterSpacing: 1 },
  couponButton: { backgroundColor: BRAND.textPrimary, borderRadius: 10, height: 44, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center', minWidth: 80 },
  couponBtnDisabled: { opacity: 0.5 },
  couponButtonText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
  couponError: { marginTop: 8, fontSize: 12, color: BRAND.red, fontWeight: '500' },
  couponAppliedContainer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#E6F9ED', borderWidth: 1, borderColor: '#A5D6A7', borderRadius: 10, padding: 12 },
  couponAppliedText: { fontSize: 14, fontWeight: '700', color: '#1B5E20' },
  couponAppliedDiscount: { fontSize: 12, color: BRAND.green, fontWeight: '600', marginTop: 2 },

  // Resumen financiero
  summarySection: { backgroundColor: BRAND.surface, borderRadius: 18, borderWidth: 1, borderColor: BRAND.border, padding: 18, marginTop: 4, gap: 12 },
  summaryTitle: { fontSize: 16, fontWeight: '800', color: BRAND.textPrimary, marginBottom: 2 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  summaryLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  summaryLabel: { fontSize: 14, color: BRAND.textMuted, fontWeight: '500' },
  summaryValue: { fontSize: 14, color: BRAND.textPrimary, fontWeight: '600' },
  freeShippingBadge: { backgroundColor: '#E6F9ED', borderRadius: 5, paddingHorizontal: 6, paddingVertical: 2 },
  freeShippingBadgeText: { fontSize: 9, fontWeight: '800', color: BRAND.green, letterSpacing: 0.5 },
  freeShippingValue: { color: BRAND.green },
  discountValue: { fontSize: 14, color: BRAND.green, fontWeight: '700' },
  summaryDivider: { height: 1, backgroundColor: BRAND.border, marginVertical: 2 },
  totalLabel: { fontSize: 16, fontWeight: '800', color: BRAND.textPrimary },
  totalValue: { fontSize: 20, fontWeight: '900', color: BRAND.orange },
  freeShippingHint: { fontSize: 12, color: BRAND.textSecondary, textAlign: 'center', marginTop: 2 },

  // Checkout bar
  checkoutBar: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: BRAND.surface, borderTopWidth: 1, borderTopColor: BRAND.border, paddingTop: 14, paddingHorizontal: 20, shadowColor: '#000', shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.06, shadowRadius: 12, elevation: 10 },
  checkoutButton: { backgroundColor: BRAND.orange, borderRadius: 16, height: 54, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, shadowColor: BRAND.orange, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.35, shadowRadius: 10, elevation: 6 },
  checkoutButtonText: { color: '#FFFFFF', fontSize: 17, fontWeight: '800', letterSpacing: 0.3 },

  // Formulario de entrega
  sectionHeader: { fontSize: 13, fontWeight: '800', color: BRAND.textMuted, marginVertical: 8, textTransform: 'uppercase', letterSpacing: 0.8 },
  inputContainer: { gap: 6 },
  inputLabel: { fontSize: 13, fontWeight: '600', color: BRAND.textMuted },
  input: { backgroundColor: BRAND.surface, borderWidth: 1, borderColor: BRAND.border, borderRadius: 12, height: 48, paddingHorizontal: 14, fontSize: 14, color: BRAND.textPrimary },
  textArea: { height: 72, paddingTop: 12 },

  // Selector de fecha
  daysScroll: { gap: 8, paddingVertical: 4 },
  dayCard: { backgroundColor: BRAND.surface, borderWidth: 1, borderColor: BRAND.border, borderRadius: 14, paddingVertical: 10, paddingHorizontal: 14, alignItems: 'center', minWidth: 72, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.03, shadowRadius: 3, elevation: 1 },
  dayCardSelected: { backgroundColor: BRAND.orange, borderColor: BRAND.orange },
  dayCardName: { fontSize: 10, fontWeight: '600', color: BRAND.textSecondary, textTransform: 'uppercase' },
  dayCardNumber: { fontSize: 18, fontWeight: '800', color: BRAND.textPrimary, marginVertical: 2 },
  dayCardMonth: { fontSize: 10, fontWeight: '600', color: BRAND.textSecondary },
  dayCardTextSelected: { color: '#FFFFFF' },

  // Selector de franja horaria
  slotsContainer: { gap: 10 },
  slotCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: BRAND.surface, borderWidth: 1, borderColor: BRAND.border, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 16, gap: 10 },
  slotCardSelected: { borderColor: BRAND.orange, backgroundColor: '#FFF5EE' },
  slotText: { fontSize: 13, fontWeight: '700', color: BRAND.textMuted, flex: 1 },
  slotTextSelected: { color: BRAND.orange },

  // Verifying overlay
  verifyingContainer: { flex: 1, backgroundColor: BRAND.background, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, gap: 16 },
  verifyingTitle: { fontSize: 20, fontWeight: '800', color: BRAND.textPrimary, marginTop: 8 },
  verifyingSubtitle: { fontSize: 14, color: BRAND.textSecondary, textAlign: 'center', lineHeight: 22 },
});