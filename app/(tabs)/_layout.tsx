import React from 'react';
import { Tabs } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { Platform } from 'react-native';

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
  return (
    <Tabs
      screenOptions={{
        // Color del icono y texto cuando la pestaña está seleccionada
        tabBarActiveTintColor: '#2F6B4F',
        // Color del icono y texto cuando la pestaña está inactiva
        tabBarInactiveTintColor: '#8E8E93',
        // Estilización premium de la barra inferior de La Tortaría
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
        // Ocultamos el header nativo de Expo para usar tus propios diseños limpios
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
          title: 'Explorar',
          tabBarIcon: ({ color, size }) => <Feather name="search" size={size - 2} color={color} />,
        }}
      />
      <Tabs.Screen
        name="favorites"
        options={{
          title: 'Favoritos',
          tabBarIcon: ({ color, size }) => <Feather name="heart" size={size - 2} color={color} />,
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