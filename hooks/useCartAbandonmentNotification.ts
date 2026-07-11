// hooks/useCartAbandonmentNotification.ts
import { useEffect, useState, useRef } from 'react';
import * as Notifications from 'expo-notifications';
import { useCartStore } from '@/store/useCartStore';
import { ANDROID_NOTIFICATION_CHANNEL_ID } from '@/app/_layout';
import { usePushPermissionRequest } from '@/hooks/usePushPermissionRequest';

const CART_ABANDONMENT_NOTIFICATION_ID = 'cart-abandoned-alert';
const ABANDONMENT_DELAY_SECONDS = 1800; // 30 minutos

export function useCartAbandonmentNotification() {
  const items = useCartStore((state) => state.items);
  const [isStoreHydrated, setIsStoreHydrated] = useState(false);
  const prevItemsLengthRef = useRef(0);
  const { checkPushEligibility, requestPushPermission, markPushPermissionAsked } = usePushPermissionRequest();

  const [showAbandonmentModal, setShowAbandonmentModal] = useState(false);

  const onAcceptAbandonmentPush = async () => {
    await requestPushPermission();
    setShowAbandonmentModal(false);
  };

  const onDeclineAbandonmentPush = async () => {
    await markPushPermissionAsked();
    setShowAbandonmentModal(false);
  };

  // Espera a que la rehidratación de AsyncStorage termine antes de evaluar
  // el carrito, para no reiniciar el temporizador de 30 min en cada reapertura.
  useEffect(() => {
    const unsub = useCartStore.persist.onHydrate(() => setIsStoreHydrated(false));
    const unsubFinish = useCartStore.persist.onFinishHydration(() => setIsStoreHydrated(true));

    if (useCartStore.persist.hasHydrated()) {
      setIsStoreHydrated(true);
    }
    return () => {
      unsub();
      unsubFinish();
    };
  }, []);

  useEffect(() => {
    if (!isStoreHydrated) return;

    const manageNotification = async () => {
      await Notifications.cancelScheduledNotificationAsync(CART_ABANDONMENT_NOTIFICATION_ID);
      
      const currentLength = items.length;
      const prevLength = prevItemsLengthRef.current;
      prevItemsLengthRef.current = currentLength;

      if (currentLength === 0) return;

      // Soft-prompt contextual de Permisos de Push
      if (currentLength > 0 && prevLength === 0) {
        const eligible = await checkPushEligibility();
        if (eligible) {
          setShowAbandonmentModal(true);
        }
      }

      await Notifications.scheduleNotificationAsync({
        identifier: CART_ABANDONMENT_NOTIFICATION_ID,
        content: {
          title: 'Dejaste algo delicioso... 🍰',
          body: 'Tu Torta favorita te está esperando en el carrito. ¡Termina tu orden antes de que se agote!',
          sound: true,
          priority: Notifications.AndroidNotificationPriority.HIGH,
          data: { url: '/cart' },
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
          seconds: ABANDONMENT_DELAY_SECONDS,
          channelId: ANDROID_NOTIFICATION_CHANNEL_ID,
        },
      });
    };

    manageNotification();
  }, [items, isStoreHydrated]);

  return {
    showAbandonmentModal,
    onAcceptAbandonmentPush,
    onDeclineAbandonmentPush,
  };
}
