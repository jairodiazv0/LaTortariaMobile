// store/useNotificationStore.ts
//
// Fuente de datos: public.user_notifications (ver 001_user_notifications.sql).
// notification_log sigue siendo el log de auditoría técnica de envíos por
// canal externo y no se usa aquí.
//
// is_read vive en el SERVIDOR. La persistencia local (AsyncStorage) es solo
// caché para pintar algo offline; fetchNotifications siempre trae la verdad
// del servidor al reconectar.

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/lib/supabase';
import type { RealtimeChannel } from '@supabase/supabase-js';

export type NotificationType =
  | 'order_status'
  | 'coupon_expiring'
  | 'stock_drop'
  | 'cart_abandoned'
  | 'system';

export interface NotificationItem {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  related_order_id: string | null;
  related_product_id: string | null;
  data: { url?: string; [key: string]: any };
  is_read: boolean;
  created_at: string;
}

interface NotificationState {
  notifications: NotificationItem[];
  loading: boolean;
  error: string | null;
  realtimeChannel: RealtimeChannel | null;
  lastUserId: string | null;

  fetchNotifications: (userId: string) => Promise<void>;
  subscribeToRealtime: (userId: string) => void;
  unsubscribeFromRealtime: () => void;
  markAsRead: (notificationId: string) => Promise<void>;
  markAllAsRead: (userId: string) => Promise<void>;
  clearLocalState: () => void;
  getUnreadCount: () => number;
}

const PAGE_SIZE = 40;

export const useNotificationStore = create<NotificationState>()(
  persist(
    (set, get) => ({
      notifications: [],
      loading: false,
      error: null,
      realtimeChannel: null,
      lastUserId: null,

      fetchNotifications: async (userId: string) => {
        set({ loading: true, error: null, lastUserId: userId });
        try {
          const { data, error } = await supabase
            .from('user_notifications')
            .select(
              'id, type, title, body, related_order_id, related_product_id, data, is_read, created_at'
            )
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .limit(PAGE_SIZE);

          if (error) throw error;
          set({ notifications: (data ?? []) as NotificationItem[], loading: false });
        } catch (err: any) {
          console.error('[useNotificationStore] fetchNotifications error:', err);
          set({ loading: false, error: err?.message ?? 'Error desconocido' });
        }
      },

      subscribeToRealtime: (userId: string) => {
        get().unsubscribeFromRealtime();

        const channel = supabase
          .channel(`user_notifications_feed:${userId}`)
          .on(
            'postgres_changes',
            {
              event: 'INSERT',
              schema: 'public',
              table: 'user_notifications',
              filter: `user_id=eq.${userId}`,
            },
            (payload) => {
              const nuevo = payload.new as NotificationItem;
              set((state) => ({
                notifications: state.notifications.some((n) => n.id === nuevo.id)
                  ? state.notifications
                  : [nuevo, ...state.notifications],
              }));
            }
          )
          .on(
            'postgres_changes',
            {
              event: 'UPDATE',
              schema: 'public',
              table: 'user_notifications',
              filter: `user_id=eq.${userId}`,
            },
            (payload) => {
              const mutado = payload.new as NotificationItem;
              set((state) => ({
                notifications: state.notifications.map((n) => (n.id === mutado.id ? mutado : n)),
              }));
            }
          )
          .subscribe();

        set({ realtimeChannel: channel });
      },

      unsubscribeFromRealtime: () => {
        const { realtimeChannel } = get();
        if (realtimeChannel) {
          supabase.removeChannel(realtimeChannel);
          set({ realtimeChannel: null });
        }
      },

      markAsRead: async (notificationId: string) => {
        const prev = get().notifications;
        set({
          notifications: prev.map((n) =>
            n.id === notificationId ? { ...n, is_read: true } : n
          ),
        });

        const { error } = await supabase
          .from('user_notifications')
          .update({ is_read: true })
          .eq('id', notificationId);

        if (error) {
          console.error('[useNotificationStore] markAsRead error:', error);
          set({ notifications: prev });
        }
      },

      markAllAsRead: async (userId: string) => {
        const prev = get().notifications;
        set({ notifications: prev.map((n) => ({ ...n, is_read: true })) });

        const { error } = await supabase
          .from('user_notifications')
          .update({ is_read: true })
          .eq('user_id', userId)
          .eq('is_read', false);

        if (error) {
          console.error('[useNotificationStore] markAllAsRead error:', error);
          set({ notifications: prev });
        }
      },

      clearLocalState: () => {
        get().unsubscribeFromRealtime();
        set({ notifications: [], loading: false, error: null, lastUserId: null });
      },

      getUnreadCount: () => get().notifications.filter((n) => !n.is_read).length,
    }),
    {
      name: 'latortaria-notifications-cache',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        notifications: state.notifications,
        lastUserId: state.lastUserId,
      }),
    }
  )
);
