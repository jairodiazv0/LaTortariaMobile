import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { BRAND } from '@/constants/Colors';

interface CategoryStripProps {
  categories: Array<{
    id: string;
    name: string;
    slug: string;
    image_url?: string | null; // Lo mantenemos en la interfaz para no romper componentes padre
  }>;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}

export function CategoryStrip({ categories, selectedId, onSelect }: CategoryStripProps) {
  if (categories.length === 0) return null;

  return (
    <View style={styles.wrapper}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}>

        {/* Botón de "Todos" */}
        <TouchableOpacity
          style={[
            styles.chip,
            selectedId === null ? styles.chipActive : styles.chipInactive,
          ]}
          activeOpacity={0.8}
          onPress={() => onSelect(null)}>
          <Text
            style={[
              styles.label,
              selectedId === null ? styles.labelActive : styles.labelInactive,
            ]}>
            Todos
          </Text>
        </TouchableOpacity>

        {/* Lista dinámica de categorías */}
        {categories.map((cat) => {
          const isSelected = selectedId === cat.id;
          return (
            <TouchableOpacity
              key={cat.id}
              style={[
                styles.chip,
                isSelected ? styles.chipActive : styles.chipInactive,
              ]}
              activeOpacity={0.8}
              onPress={() => onSelect(isSelected ? null : cat.id)}>
              <Text
                style={[
                  styles.label,
                  isSelected ? styles.labelActive : styles.labelInactive,
                ]}>
                {cat.name}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginTop: 16,
    marginBottom: 8, // Un poco de espacio antes de los productos
  },
  scrollContent: {
    paddingHorizontal: 16,
    gap: 8, // Espaciado moderno y compacto entre píldoras
    alignItems: 'center',
  },
  chip: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 50, // Borde completamente redondeado (ovalado)
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipActive: {
    backgroundColor: BRAND.ink, // Color oscuro de tu marca
    borderColor: BRAND.ink,
  },
  chipInactive: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E5E5EA', // Borde sutil
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
  },
  labelActive: {
    color: '#FFFFFF', // Texto blanco cuando está seleccionado
  },
  labelInactive: {
    color: BRAND.ink, // Texto oscuro cuando está inactivo
  },
});