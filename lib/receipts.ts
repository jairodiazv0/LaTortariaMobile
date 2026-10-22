import * as WebBrowser from 'expo-web-browser';
import { supabase } from '@/lib/supabase';

export const RECEIPT_STATUSES = [
  'paid',
  'confirmed',
  'preparing',
  'in_production',
  'ready',
  'shipped',
  'out_for_delivery',
  'delivered',
] as const;

export type ReceiptStatus = (typeof RECEIPT_STATUSES)[number];

export function canDownloadReceipt(status: string): boolean {
  return (RECEIPT_STATUSES as readonly string[]).includes(status);
}

export type OpenReceiptResult =
  | { ok: true }
  | { ok: false; reason: 'auth' | 'not_found' | 'not_available' | 'network' | 'server' };

const API_BASE = process.env.EXPO_PUBLIC_API_BASE_URL ?? 'https://www.latortaria.com';

export async function openOrderReceipt(orderId: string): Promise<OpenReceiptResult> {
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    const token = session?.access_token;
    if (!token) {
      return { ok: false, reason: 'auth' };
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);

    let res: Response;
    try {
      res = await fetch(`${API_BASE}/api/orders/${orderId}/receipt-link`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
        signal: controller.signal,
      });
    } catch {
      return { ok: false, reason: 'network' };
    } finally {
      clearTimeout(timer);
    }

    if (!res.ok) {
      if (res.status === 401) {
        return { ok: false, reason: 'auth' };
      }
      if (res.status === 404) {
        return { ok: false, reason: 'not_found' };
      }
      if (res.status === 409) {
        return { ok: false, reason: 'not_available' };
      }
      return { ok: false, reason: 'server' };
    }

    const data = await res.json();
    if (!data?.url || typeof data.url !== 'string') {
      return { ok: false, reason: 'server' };
    }

    await WebBrowser.openBrowserAsync(data.url);
    return { ok: true };
  } catch {
    return { ok: false, reason: 'server' };
  }
}
