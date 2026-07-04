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

const CARD_WIDTH = 160;

export function CategorySection({ category, products, onPressProduct }: CategorySectionProps) {
  const router = useRouter();

  if (!products || products.length === 0) return null;

  const handleSeeAll = () => {
    router.push(`/(tabs)/explore?categorySlug=${category.slug}`);
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{category.name}</Text>
        <TouchableOpacity style={styles.headerSeeAll} activeOpacity={0.7} onPress={handleSeeAll}>
          <Text style={styles.headerSeeAllText}>Ver todo →</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.carouselContent}
        style={styles.carousel}>
        <TouchableOpacity style={styles.categoryCard} activeOpacity={0.85} onPress={handleSeeAll}>
          {category.image_url ? (
            <Image source={{ uri: category.image_url }} style={styles.categoryImage} resizeMode="cover" />
          ) : (
            <LinearGradient
              colors={[BRAND.moss, BRAND.ink]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
          )}
          <LinearGradient
            colors={['transparent', 'rgba(0,0,0,0.75)']}
            style={styles.categoryOverlay}
          />
          <View style={styles.categoryContent}>
            <Text style={styles.categoryTitle} numberOfLines={3}>
              {category.name}
            </Text>
            <View style={styles.categoryArrowContainer}>
              <Feather name="arrow-right" size={14} color="#FFFFFF" />
            </View>
          </View>
        </TouchableOpacity>

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
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: 24,
    marginHorizontal: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  headerTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: BRAND.ink,
  },
  headerSeeAll: {
    paddingVertical: 4,
    paddingLeft: 8,
  },
  headerSeeAllText: {
    fontSize: 14,
    fontWeight: '600',
    color: BRAND.moss,
  },
  categoryCard: {
    width: CARD_WIDTH,
    borderRadius: 16,
    overflow: 'hidden',
  },
  categoryImage: {
    ...StyleSheet.absoluteFill,
    width: '100%',
    height: '100%',
  },
  categoryOverlay: {
    ...StyleSheet.absoluteFill,
  },
  categoryContent: {
    flex: 1,
    justifyContent: 'flex-end',
    padding: 12,
    gap: 6,
    minHeight: 220, // matches average ProductCardMobile height visually
  },
  categoryTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  categoryArrowContainer: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    borderRadius: 99,
    padding: 6,
    marginTop: 4,
  },
  carousel: {
    flex: 1,
  },
  carouselContent: {
    gap: 10,
    paddingRight: 4,
    alignItems: 'stretch',
  },
});
