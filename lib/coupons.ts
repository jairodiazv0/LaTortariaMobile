import { supabase } from '@/lib/supabase';

export type CouponStatus =
  | 'vigente'
  | 'por_vencer'
  | 'proximo'
  | 'usado'
  | 'agotado'
  | 'vencido';

export interface UserCoupon {
  coupon_id: string;
  code: string;
  status: CouponStatus;
  name: string;
  description: string | null;
  discount_type: 'percentage' | 'fixed';
  discount_value: number;
  min_order_amount: number | null;
  expires_at: string | null;
  saved_by_code: boolean;
  dismissable: boolean;
}

export type SaveCouponReason =
  | 'not_found'
  | 'expired'
  | 'exhausted'
  | 'used'
  | 'auth'
  | 'server';

export interface SaveCouponResult {
  success: boolean;
  reason?: SaveCouponReason;
  message?: string;
}

/**
 * Consulta los cupones asociados a la cuenta del usuario autenticado.
 */
export async function fetchMyCoupons(): Promise<{ data: UserCoupon[]; error: string | null }> {
  try {
    const { data, error } = await supabase.rpc('get_my_coupons');
    if (error) {
      return { data: [], error: error.message || 'Error al obtener cupones' };
    }
    return { data: Array.isArray(data) ? (data as UserCoupon[]) : [], error: null };
  } catch (err: any) {
    return { data: [], error: err?.message || 'Error de conexión' };
  }
}

/**
 * Guarda un cupón público por su código.
 */
export async function saveCouponByCode(code: string): Promise<SaveCouponResult> {
  const cleanCode = code.trim().toUpperCase();
  if (!cleanCode) {
    return { success: false, reason: 'not_found', message: 'No encontramos ese código' };
  }

  try {
    const { error } = await supabase.rpc('save_coupon_by_code', {
      p_code: cleanCode,
    });

    if (error) {
      const msg = error.message || '';
      if (msg.includes('coupon_not_found')) {
        return { success: false, reason: 'not_found', message: 'No encontramos ese código' };
      }
      if (msg.includes('coupon_expired')) {
        return { success: false, reason: 'expired', message: 'Ese cupón ya venció' };
      }
      if (msg.includes('coupon_exhausted')) {
        return { success: false, reason: 'exhausted', message: 'Ese cupón ya no tiene usos disponibles' };
      }
      if (msg.includes('coupon_used')) {
        return { success: false, reason: 'used', message: 'Ya usaste ese cupón' };
      }
      if (msg.includes('not_authenticated')) {
        return { success: false, reason: 'auth', message: 'Inicia sesión para guardar cupones' };
      }
      return {
        success: false,
        reason: 'server',
        message: 'No pudimos completar la acción, inténtalo de nuevo',
      };
    }

    return { success: true };
  } catch {
    return {
      success: false,
      reason: 'server',
      message: 'No pudimos completar la acción, inténtalo de nuevo',
    };
  }
}

/**
 * Oculta/elimina un cupón (dismiss) de la lista del usuario.
 */
export async function dismissCoupon(couponId: string): Promise<{ success: boolean; error: string | null }> {
  try {
    const { error } = await supabase.rpc('dismiss_coupon', {
      p_coupon_id: couponId,
    });
    if (error) {
      return { success: false, error: error.message };
    }
    return { success: true, error: null };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Error de conexión' };
  }
}

/**
 * Formatea el beneficio del cupón: "15 % de descuento" o "$ 5.000 de descuento" (es-CO).
 */
export function formatCouponBenefit(coupon: Pick<UserCoupon, 'discount_type' | 'discount_value'>): string {
  if (coupon.discount_type === 'percentage') {
    return `${coupon.discount_value} % de descuento`;
  }
  const formattedAmount = Number(coupon.discount_value).toLocaleString('es-CO');
  return `$ ${formattedAmount} de descuento`;
}

/**
 * Formatea la fecha de vencimiento y los días restantes en America/Bogota.
 */
export function formatCouponExpiry(coupon: Pick<UserCoupon, 'status' | 'expires_at'>): {
  dateText: string;
  daysLeftText?: string;
} {
  if (coupon.status === 'proximo') {
    return { dateText: 'Disponible próximamente' };
  }
  if (!coupon.expires_at) {
    return { dateText: 'Sin fecha de vencimiento' };
  }

  try {
    const dateObj = new Date(coupon.expires_at);
    const formatter = new Intl.DateTimeFormat('es-CO', {
      timeZone: 'America/Bogota',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
    const dateText = `Vence el ${formatter.format(dateObj)}`;

    const diffMs = dateObj.getTime() - Date.now();
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

    let daysLeftText: string | undefined;
    if (diffDays <= 0) {
      daysLeftText = 'Vence hoy';
    } else if (diffDays === 1) {
      daysLeftText = 'Vence mañana';
    } else if (diffDays <= 7) {
      daysLeftText = `Vence en ${diffDays} días`;
    }

    return { dateText, daysLeftText };
  } catch {
    return { dateText: 'Vence pronto' };
  }
}
