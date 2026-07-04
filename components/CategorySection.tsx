import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import { Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { BRAND } from '@/constants/Colors';
import { ProductCardMobile, ProductCardData } from '@/components/ProductCardMobile';

interface CategorySectionProps {
  category: {
    id: string;
    name: string;
    slug: string;
    image_url?: string | null;
    description?: string | null;
  };
  products: ProductCardData[];
  onPressProduct?: (productId: string) => void;
}

const PANEL_WIDTH = 160;
const PANEL_HEIGHT = 180;
const CARD_WIDTH = 160;

export function CategorySection({ category, products, onPressProduct }: CategorySectionProps) {
  const router = useRouter();

  if (!products || products.length === 0) return null;

  const handleSeeAll = () => {
    router.push('/(tabs)/explore');
  };

  return (
    <View style={styles.container}>
      <View style={styles.row}>
        <View style={styles.panel}>
          {category.image_url ? (
            <Image source={{ uri: category.image_url }} style={styles.panelImage} resizeMode="cover" />
          ) : (
            <LinearGradient
              colors={[BRAND.moss, BRAND.ink]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
          )}
          <LinearGradient
            colors={['transparent', 'rgba(0,0,0,0.7)']}
            style={styles.panelOverlay}
          />
          <View style={styles.panelContent}>
            <Text style={styles.panelTitle}>{category.name}</Text>
            {category.description ? (
              <Text style={styles.panelDescription} numberOfLines={2}>
                {category.description}
              </Text>
            ) : null}
            <TouchableOpacity style={styles.seeAllButton} activeOpacity={0.85} onPress={handleSeeAll}>
              <Text style={styles.seeAllText}>Ver todo</Text>
              <Feather name="arrow-right" size={12} color={BRAND.ink} />
            </TouchableOpacity>
          </View>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.carouselContent}
          style={styles.carousel}>
          {products.map((product) => (
            <ProductCardMobile
              key={product.id}
              product={product}
              width={CARD_WIDTH}
              onPress={() => onPressProduct?.(product.id)}
            />
          ))}
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: 24,
    marginHorizontal: 16,
  },
  row: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'stretch',
  },
  panel: {
    width: PANEL_WIDTH,
    height: PANEL_HEIGHT,
    borderRadius: 16,
    overflow: 'hidden',
  },
  panelImage: {
    ...StyleSheet.absoluteFill,
    width: '100%',
    height: '100%',
  },
  panelOverlay: {
    ...StyleSheet.absoluteFill,
  },
  panelContent: {
    flex: 1,
    justifyContent: 'flex-end',
    padding: 12,
    gap: 4,
  },
  panelTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  panelDescription: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.7)',
  },
  seeAllButton: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 4,
    marginTop: 6,
    backgroundColor: BRAND.lime,
    borderRadius: 99,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  seeAllText: {
    fontSize: 11,
    fontWeight: '700',
    color: BRAND.ink,
  },
  carousel: {
    flex: 1,
  },
  carouselContent: {
    gap: 10,
    paddingRight: 4,
  },
});
