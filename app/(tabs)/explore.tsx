import { Feather } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BRAND } from '@/constants/Colors';
import { ProductCardMobile, ProductCardData } from '@/components/ProductCardMobile';
import { supabase } from '../../lib/supabase';

interface Category {
  id: string;
  name: string;
  slug: string;
}

interface DBProductVariant {
  id: string;
  product_id: string;
  price: number;
  compare_at_price: number | null;
  is_active: boolean;
}

interface DBProductMedia {
  id: string;
  product_id: string;
  variant_id: string | null;
  type: string;
  url: string;
  is_cover: boolean;
}

interface DBCategory {
  name: string;
  slug: string;
}

interface DBProduct {
  id: string;
  name: string;
  slug: string;
  category_id: string | null;
  short_description: string | null;
  is_healthy: boolean;
  preparation_hours: number;
  is_featured: boolean;
  rating_avg: number;
  review_count: number;
  tags: string[] | null;
  categories: DBCategory | null;
  product_variants: DBProductVariant[];
  product_media: DBProductMedia[];
}

interface Product {
  id: string;
  variantId: string;
  name: string;
  sizeLabel: string;
  rating: number;
  reviewCount: number;
  preparation_hours: number;
  basePrice: number;
  minPrice: number;
  compareAtPrice?: number | null;
  imageUrl?: string | null;
  badge?: 'TOP' | 'NUEVO';
  categoryId?: string | null;
  categoryName?: string | null;
  categorySlug?: string | null;
  shortDescription?: string;
  isHealthy?: boolean;
  isFeatured?: boolean;
  variantsCount?: number;
  tags: string[];
}

function toProductCardData(product: Product): ProductCardData {
  return {
    id: product.id,
    name: product.name,
    short_description: product.shortDescription,
    image_url: product.imageUrl,
    minPrice: product.minPrice ?? product.basePrice,
    compare_at_price: product.compareAtPrice,
    is_healthy: product.isHealthy,
    variantsCount: product.variantsCount,
  };
}

export default function ExploreScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { categorySlug } = useLocalSearchParams<{ categorySlug?: string }>();

  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch Categories
  useEffect(() => {
    async function fetchCategories() {
      try {
        const { data } = await supabase
          .from('categories')
          .select('id, name, slug')
          .eq('is_active', true);
        if (data) {
          setCategories(data);
        }
      } catch (err) {
        console.error('Error fetching categories:', err);
      }
    }
    fetchCategories();
  }, []);

  // Fetch Products
  useEffect(() => {
    async function fetchProducts() {
      try {
        setLoading(true);
        setError(null);

        const { data, error: sbError } = await supabase
          .from('products')
          .select(`
            id,
            name,
            slug,
            category_id,
            short_description,
            is_healthy,
            preparation_hours,
            is_featured,
            rating_avg,
            review_count,
            tags,
            categories (
              name,
              slug
            ),
            product_variants (
              id,
              price,
              compare_at_price,
              is_active
            ),
            product_media (
              url,
              type,
              is_cover
            )
          `)
          .eq('is_active', true)
          .order('is_featured', { ascending: false })
          .order('rating_avg', { ascending: false });

        if (sbError) throw sbError;

        if (!data) {
          setProducts([]);
          return;
        }

        const mappedProducts = (data as unknown as DBProduct[])
          .map((dbProd): Product | null => {
            const activeVariants = dbProd.product_variants.filter((v) => v.is_active);
            if (activeVariants.length === 0) return null;

            const baseVariant = activeVariants[0];
            const validPrices = activeVariants
              .map((v) => Number(v.price))
              .filter((price) => !Number.isNaN(price) && price > 0);
            const minPrice =
              validPrices.length > 0 ? Math.min(...validPrices) : Number(baseVariant.price);

            const coverImage = dbProd.product_media.find(
              (m) => m.is_cover && m.type === 'image'
            );

            return {
              id: dbProd.id,
              variantId: baseVariant.id,
              name: dbProd.name,
              sizeLabel: 'Porción estándar',
              rating: Number(dbProd.rating_avg) || 0,
              reviewCount: dbProd.review_count || 0,
              preparation_hours: dbProd.preparation_hours,
              basePrice: Number(baseVariant.price),
              minPrice,
              compareAtPrice: baseVariant.compare_at_price ? Number(baseVariant.compare_at_price) : null,
              imageUrl: coverImage?.url || null,
              categoryId: dbProd.category_id,
              categoryName: dbProd.categories?.name || null,
              categorySlug: dbProd.categories?.slug || null,
              shortDescription: dbProd.short_description || '',
              isHealthy: dbProd.is_healthy || false,
              isFeatured: dbProd.is_featured || false,
              variantsCount: activeVariants.length,
              tags: dbProd.tags || [],
            };
          })
          .filter((p): p is Product => p !== null);

        setProducts(mappedProducts);
      } catch (err: any) {
        console.error('Error fetching products:', err);
        setError(err.message || 'Error al conectar con la base de datos.');
      } finally {
        setLoading(false);
      }
    }

    fetchProducts();
  }, []);

  // Filter products by categorySlug
  const filteredProducts = useMemo(() => {
    if (!categorySlug) return products;
    return products.filter((p) => p.categorySlug === categorySlug);
  }, [products, categorySlug]);

  // Determine Title to display
  const title = useMemo(() => {
    if (!categorySlug) return 'Explorar';
    const found = categories.find((c) => c.slug === categorySlug);
    return found ? found.name : categorySlug.toUpperCase();
  }, [categories, categorySlug]);

  const handleClearFilter = () => {
    router.replace('/(tabs)/explore');
  };

  const handlePressProduct = (product: Product) => {
    router.push({
      pathname: '/product/[id]',
      params: { id: product.id },
    });
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top + 16 }]}>
      {/* Header Row */}
      <View style={styles.headerRow}>
        <Text style={styles.headerTitle}>{title}</Text>
        {categorySlug ? (
          <TouchableOpacity style={styles.clearChip} activeOpacity={0.7} onPress={handleClearFilter}>
            <Text style={styles.clearChipText}>× Limpiar filtro</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={BRAND.moss} />
          <Text style={styles.loadingText}>Cargando delicias...</Text>
        </View>
      ) : error ? (
        <View style={styles.errorContainer}>
          <Feather name="alert-triangle" size={32} color="#FF3B30" />
          <Text style={styles.errorText}>No pudimos conectar con la pastelería.</Text>
          <Text style={styles.errorSubtext}>{error}</Text>
        </View>
      ) : filteredProducts.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyEmoji}>🧁</Text>
          <Text style={styles.emptyText}>Por el momento no hay productos en esta categoría.</Text>
        </View>
      ) : (
        <FlatList
          data={filteredProducts}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <View style={styles.gridItem}>
              <ProductCardMobile
                product={toProductCardData(item)}
                onPress={() => handlePressProduct(item)}
              />
            </View>
          )}
          numColumns={2}
          columnWrapperStyle={styles.rowWrapper}
          contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 80 }]}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BRAND.cream,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: BRAND.ink,
  },
  clearChip: {
    backgroundColor: '#FFEAEA',
    borderColor: '#FFD1D1',
    borderWidth: 1,
    borderRadius: 99,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  clearChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#D1221D',
  },
  listContent: {
    paddingHorizontal: 10,
    gap: 12,
  },
  rowWrapper: {
    justifyContent: 'space-between',
    paddingHorizontal: 6,
  },
  gridItem: {
    width: '48%',
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 15,
    color: BRAND.slate,
    fontWeight: '500',
  },
  errorContainer: {
    margin: 16,
    paddingVertical: 40,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFEAEA',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#FFD1D1',
  },
  errorText: {
    marginTop: 10,
    fontSize: 16,
    fontWeight: '700',
    color: '#D1221D',
    textAlign: 'center',
  },
  errorSubtext: {
    marginTop: 4,
    fontSize: 13,
    color: '#8E8E93',
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  emptyEmoji: {
    fontSize: 48,
    marginBottom: 10,
  },
  emptyText: {
    fontSize: 15,
    color: BRAND.slate,
    textAlign: 'center',
    fontWeight: '500',
    lineHeight: 22,
  },
});
