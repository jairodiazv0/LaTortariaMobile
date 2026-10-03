import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';

const WHEEL_GUEST_ID_KEY = 'wheel_guest_device_id';

export async function getOrCreateGuestWheelId(): Promise<string> {
  let id = await SecureStore.getItemAsync(WHEEL_GUEST_ID_KEY);
  if (!id) {
    id = Crypto.randomUUID();
    await SecureStore.setItemAsync(WHEEL_GUEST_ID_KEY, id);
  }
  return id;
}
