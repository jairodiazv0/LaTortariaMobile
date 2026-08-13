// app/products/[id].tsx
//
// Alias de compatibilidad: fn_notify_stock_drop guarda data.url como
// '/products/<uuid>' (plural), pero la pantalla real de producto vive en
// app/product/[id].tsx (singular). En vez de tocar el trigger en producción,
// este archivo solo redirige al destino real. Cero lógica duplicada.

import { Redirect, useLocalSearchParams } from 'expo-router';

export default function ProductRouteAlias() {
  const { id } = useLocalSearchParams<{ id: string }>();

  if (!id) {
    return <Redirect href="/(tabs)" />;
  }

  return <Redirect href={`/product/${id}`} />;
}
