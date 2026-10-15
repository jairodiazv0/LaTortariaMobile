// [ANALYTICS-GA4] Eventos de e-commerce de la app (Firebase Analytics -> GA4).
// Misma propiedad de GA4 que la web; los eventos se distinguen por plataforma y
// por el parámetro sales_channel = 'mobile_app' (igual que el enum de Supabase).
// PRIVACIDAD: nunca se envían la dedicatoria (custom_text), las instrucciones,
// la imagen de referencia ni datos personales. Solo la bandera is_customized.
// Todas las funciones son no-op si Firebase no está disponible: la analítica
// nunca debe romper ni frenar la app.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getApp } from '@react-native-firebase/app';
import {
  getAnalytics,
  logEvent,
  logScreenView,
  setAnalyticsCollectionEnabled,
  setConsent,
  type Analytics,
} from '@react-native-firebase/analytics';

const CURRENCY = 'COP' as const;
const SALES_CHANNEL = 'mobile_app' as const;

let instance: Analytics | null | undefined;

function getInstance(): Analytics | null {
  if (instance !== undefined) return instance;
  try {
    instance = getAnalytics(getApp());
  } catch {
    instance = null; // Firebase no configurado (p. ej. Expo Go): se ignora
  }
  return instance;
}

/** Datos mínimos de un ítem. item_id = products.id, igual que en la web. */
export type Ga4ItemInput = {
  productId: string;
  productName: string;
  variantName?: string | null;
  price: number; // COP en pesos (NO centavos); precio unitario con complementos
  quantity: number;
  isCustomized?: boolean;
};

type Ga4Item = {
  item_id: string;
  item_name: string;
  item_variant?: string;
  price: number;
  quantity: number;
  is_customized?: 'yes' | 'no';
};

function toGa4Item(i: Ga4ItemInput): Ga4Item {
  return {
    item_id: i.productId,
    item_name: i.productName,
    item_variant: i.variantName ?? undefined,
    price: Math.round(Number(i.price) || 0),
    quantity: Math.max(1, Math.round(Number(i.quantity) || 1)),
    is_customized: i.isCustomized === undefined ? undefined : i.isCustomized ? 'yes' : 'no',
  };
}

function withValue(items: Ga4ItemInput[]) {
  const mapped = items.map(toGa4Item);
  const value = mapped.reduce((acc, it) => acc + it.price * it.quantity, 0);
  return { currency: CURRENCY, value, items: mapped };
}

// Los cupones RULETA-XXXXXXXX son únicos por persona: se agrupan.
function normalizeCoupon(code?: string | null): string | undefined {
  if (!code) return undefined;
  const c = code.trim().toUpperCase();
  return c.startsWith('RULETA-') ? 'RULETA' : c;
}

/** true si el evento se entregó al SDK (no garantiza el envío a Google). */
async function send(name: string, params: Record<string, unknown> = {}): Promise<boolean> {
  const a = getInstance();
  if (!a) return false;
  try {
    // El nombre es dinámico: se usa la sobrecarga genérica de logEvent.
    await (logEvent as (an: Analytics, n: string, p?: Record<string, unknown>) => Promise<void>)(
      a,
      name,
      { sales_channel: SALES_CHANNEL, ...params }
    );
    return true;
  } catch {
    return false;
  }
}

// ── Compra: datos que deben sobrevivir al cierre de la app mientras el cliente paga en Wompi ──

type PurchasePayload = {
  value: number; // total cobrado en COP (amount_in_cents / 100)
  shipping: number;
  discount: number;
  coupon?: string;
  items: Ga4ItemInput[];
};

const pendingKey = (orderId: string) => `ga4_pending_${orderId}`;
const sentKey = (orderId: string) => `ga4_purchase_${orderId}`;

export const ga4 = {
  /** Llamar una vez al iniciar la app. Analítica activa; señales de anuncios denegadas. */
  async init(): Promise<void> {
    const a = getInstance();
    if (!a) return;
    try {
      await setAnalyticsCollectionEnabled(a, true);
      await setConsent(a, {
        analytics_storage: true,
        ad_storage: false,
        ad_user_data: false,
        ad_personalization: false,
      });
    } catch {
      /* sin SDK: se ignora */
    }
  },

  /** Nombre = patrón de ruta, p. ej. "(tabs)/cart" o "product/[id]" (sin IDs reales). */
  screenView(screenName: string): void {
    const a = getInstance();
    if (!a || !screenName) return;
    logScreenView(a, { screen_name: screenName, screen_class: screenName }).catch(() => {});
  },

  viewItem(item: Ga4ItemInput): void {
    void send('view_item', withValue([item]));
  },
  addToCart(item: Ga4ItemInput): void {
    void send('add_to_cart', withValue([item]));
  },
  removeFromCart(item: Ga4ItemInput): void {
    void send('remove_from_cart', withValue([item]));
  },
  viewCart(items: Ga4ItemInput[]): void {
    void send('view_cart', withValue(items));
  },
  beginCheckout(items: Ga4ItemInput[], coupon?: string | null): void {
    void send('begin_checkout', { ...withValue(items), coupon: normalizeCoupon(coupon) });
  },
  addShippingInfo(items: Ga4ItemInput[], shippingTier: string, coupon?: string | null): void {
    void send('add_shipping_info', {
      ...withValue(items),
      shipping_tier: shippingTier,
      coupon: normalizeCoupon(coupon),
    });
  },
  addPaymentInfo(items: Ga4ItemInput[], coupon?: string | null): void {
    void send('add_payment_info', {
      ...withValue(items),
      payment_type: 'wompi',
      coupon: normalizeCoupon(coupon),
    });
  },
  addToWishlist(item: Ga4ItemInput): void {
    void send('add_to_wishlist', withValue([item]));
  },
  couponResult(code: string, ok: boolean): void {
    void send(ok ? 'coupon_applied' : 'coupon_rejected', { coupon: normalizeCoupon(code) });
  },

  /** Guardar al iniciar el pago, ANTES de abrir Wompi (por si el sistema cierra la app). */
  async rememberPendingPurchase(orderId: string, payload: PurchasePayload): Promise<void> {
    try {
      await AsyncStorage.setItem(pendingKey(orderId), JSON.stringify(payload));
    } catch {
      /* sin almacenamiento: se usa el respaldo al confirmar */
    }
  },

  /**
   * Llamar SOLO cuando el backend confirma status === 'paid'.
   * Deduplica por order_id (aquí y por transaction_id en GA4). `fallback` se usa si no
   * quedaron guardados los datos de la compra (p. ej. se reinstaló la app).
   */
  async purchase(orderId: string, fallback: PurchasePayload): Promise<void> {
    try {
      if (await AsyncStorage.getItem(sentKey(orderId))) return;
    } catch {
      /* GA4 deduplica por transaction_id */
    }

    let p = fallback;
    try {
      const raw = await AsyncStorage.getItem(pendingKey(orderId));
      if (raw) p = JSON.parse(raw) as PurchasePayload;
    } catch {
      /* se usa el respaldo */
    }

    const sent = await send('purchase', {
      transaction_id: orderId,
      currency: CURRENCY,
      value: Math.round(p.value),
      shipping: Math.round(p.shipping),
      discount: Math.round(p.discount),
      coupon: normalizeCoupon(p.coupon),
      items: p.items.map(toGa4Item),
    });

    if (sent) {
      try {
        await AsyncStorage.setItem(sentKey(orderId), '1');
        await AsyncStorage.removeItem(pendingKey(orderId));
      } catch {
        /* sin almacenamiento */
      }
    }
  },
};

export type Ga4 = typeof ga4;
