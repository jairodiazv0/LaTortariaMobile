import { LinearGradient } from 'expo-linear-gradient';
import { Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { BRAND } from '@/constants/Colors';

interface CategoryStripProps {
  categories: Array<{
    id: string;
    name: string;
    slug: string;
    image_url?: string | null;
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
        <TouchableOpacity
          style={styles.cardWrapper}
          activeOpacity={0.85}
          onPress={() => onSelect(null)}>
          <View
            style={[
              styles.card,
              styles.allCard,
              selectedId === null && styles.cardSelected,
            ]}>
            <Text style={styles.allLabel}>Todos</Text>
          </View>
          <Text style={[styles.label, selectedId === null && styles.labelActive]}>Todos</Text>
        </TouchableOpacity>

        {categories.map((cat) => {
          const isSelected = selectedId === cat.id;
          return (
            <TouchableOpacity
              key={cat.id}
              style={styles.cardWrapper}
              activeOpacity={0.85}
              onPress={() => onSelect(isSelected ? null : cat.id)}>
              <View style={[styles.card, isSelected && styles.cardSelected]}>
                {cat.image_url ? (
                  <>
                    <Image source={{ uri: cat.image_url }} style={styles.cardImage} resizeMode="cover" />
                    <View style={styles.imageOverlay} />
                  </>
                ) : (
                  <LinearGradient
                    colors={[BRAND.moss, BRAND.ink]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.gradientFallback}>
                    <Text style={styles.initial}>{cat.name.charAt(0).toUpperCase()}</Text>
                  </LinearGradient>
                )}
              </View>
              <Text style={[styles.label, isSelected && styles.labelActive]} numberOfLines={1}>
                {cat.name}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

const CARD_SIZE = 88;

const styles = StyleSheet.create({
  wrapper: {
    marginTop: 16,
  },
  scrollContent: {
    paddingHorizontal: 16,
    gap: 10,
  },
  cardWrapper: {
    alignItems: 'center',
    maxWidth: CARD_SIZE,
  },
  card: {
    width: CARD_SIZE,
    height: CARD_SIZE,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 2.5,
    borderColor: 'transparent',
  },
  cardSelected: {
    borderColor: BRAND.lime,
  },
  allCard: {
    backgroundColor: BRAND.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  allLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  cardImage: {
    width: '100%',
    height: '100%',
  },
  imageOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.2)',
  },
  gradientFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  initial: {
    fontSize: 28,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  label: {
    marginTop: 6,
    fontSize: 10,
    fontWeight: '700',
    color: BRAND.ink,
    textAlign: 'center',
    maxWidth: CARD_SIZE,
  },
  labelActive: {
    color: BRAND.moss,
  },
});
