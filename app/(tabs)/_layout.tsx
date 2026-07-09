import React from 'react';
import { Tabs } from 'expo-router';
import { Feather, Ionicons } from '@expo/vector-icons'; // Inyectamos Ionicons
import { Platform } from 'react-native';
import { useFavoritesStore } from '../../store/useFavoritesStore'; // Importamos el Store

// ─── TOKENS VISUALES DE LA MARCA (Sincronizados con tu profile.tsx) ──────────
const BRAND = {
  cream: '#FAF7F2',
  rose: '#C8745A',
  ink: '#2C2018',
  inkMid: '#6B5744',
  divider: '#EDE4D8',
  white: '#FFFFFF',
  fontBody: Platform.select({ ios: 'System', android: 'sans-serif' }) as string,
};

export default function TabsLayout() {
  // Suscripción reactiva al listado global de favoritos
  const { favorites } = useFavoritesStore();
  const hasFavorites = favorites.length > 0;

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: '#2F6B4F',
        tabBarInactiveTintColor: '#8E8E93',
        tabBarStyle: {
          backgroundColor: BRAND.white,
          borderTopWidth: 1,
          borderTopColor: BRAND.divider,
          height: 60,
          paddingBottom: 8,
          paddingTop: 4,
        },
        tabBarLabelStyle: {
          fontFamily: BRAND.fontBody,
          fontSize: 11,
          fontWeight: '600',
        },
        headerShown: false,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Inicio',
          tabBarIcon: ({ color, size }) => <Feather name="home" size={size - 2} color={color} />,
        }}
      />
      <Tabs.Screen
        name="explore"
        options={{
          title: 'Descubrir',
          tabBarIcon: ({ color, size }) => <Feather name="compass" size={size - 2} color={color} />,
        }}
      />
      
      {/* ─── PESTAÑA CORREGIDA: COMPORTAMIENTO DINÁMICO Y REACTIVO ─── */}
      <Tabs.Screen
        name="favorites"
        options={{
          title: 'Favoritos',
          tabBarIcon: ({ focused, color, size }) => {
            if (hasFavorites) {
              // Si tiene elementos, se renderiza relleno y de color rojo vibrante
              return <Ionicons name="heart" size={size} color="#FF3B30" />;
            }
            // Estado base por defecto cuando no hay favoritos guardados
            return (
              <Ionicons 
                name={focused ? "heart" : "heart-outline"} 
                size={size} 
                color={color} 
              />
            );
          },
        }}
      />

      <Tabs.Screen
        name="cart"
        options={{
          title: 'Carrito',
          tabBarIcon: ({ color, size }) => <Feather name="shopping-cart" size={size - 2} color={color} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Cuenta',
          tabBarIcon: ({ color, size }) => <Feather name="user" size={size - 2} color={color} />,
        }}
      />
    </Tabs>
  );
}