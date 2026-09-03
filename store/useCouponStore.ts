import { create } from 'zustand';

export interface CouponData {
  code: string;
  discount_type?: string;
  discount_value: number;
  min_order_amount: number;
  expires_at: string;
}

interface CouponState {
  welcomeCouponData: CouponData | null;
  setWelcomeCouponData: (data: CouponData) => void;
  clearWelcomeCoupon: () => void;
}

export const useCouponStore = create<CouponState>((set) => ({
  welcomeCouponData: null,
  setWelcomeCouponData: (data) => set({ welcomeCouponData: data }),
  clearWelcomeCoupon: () => set({ welcomeCouponData: null }),
}));
