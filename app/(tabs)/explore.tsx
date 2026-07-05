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
  ScrollView,
  TextInput,
  Image,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BRAND } from '@/constants/Colors';
import { ProductCardMobile, ProductCardData } from '@/components/ProductCardMobile';
import { supabase } from '../../lib/supabase';
import { useCartStore } from '../../store/useCartStore';

// Constants
const COLLECTIONS = [
  { tag: 'para-regalar', label: 'Para regalar con intención', emoji: '🎁', bg: '#1E3A2F' },
  { tag: 'fin-de-semana', label: 'Perfectas para el domingo', emoji: '☕', bg: '#2C1F15' },
  { tag: 'chocolate', label: 'Si amas el chocolate', emoji: '🍫', bg: '#152033' },
] as const;

// Interfaces
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
  created_at?: string;
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
  created_at?: string;
}

interface InteractionGroup {
  productId: string;
  views: number;
  purchases: number;
  lastSeen: Date;
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

// Helpers for product mapping
function mapDBProductToProduct(dbProd: DBProduct): Product | null {
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
    created_at: dbProd.created_at,
  };
}

export default function ExploreScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { categorySlug, categoryTag } = useLocalSearchParams<{ categorySlug?: string; categoryTag?: string }>();

  // Global State (Catalog)
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Discover Editorial States
  const [userProfile, setUserProfile] = useState<{ full_name?: string } | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [trendingProducts, setTrendingProducts] = useState<Product[]>([]);
  const [trendingInteractionsCount, setTrendingInteractionsCount] = useState<{ [id: string]: number }>({});
  const [loadingTrending, setLoadingTrending] = useState<boolean>(true);
  const [errorTrending, setErrorTrending] = useState<boolean>(false);

  const [collectionCounts, setCollectionCounts] = useState<{ [tag: string]: number }>({});

  const [forYouProducts, setForYouProducts] = useState<Product[]>([]);
  const [forYouInteractions, setForYouInteractions] = useState<{ [id: string]: { views: number; purchases: number } }>({});
  const [loadingForYou, setLoadingForYou] = useState<boolean>(true);
  const [errorForYou, setErrorForYou] = useState<boolean>(false);

  // Check auth and setup listener
  useEffect(() => {
    async function checkUser() {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        setIsAuthenticated(true);
        const { data } = await supabase
          .from('profiles')
          .select('full_name')
          .eq('id', session.user.id)
          .single();
        if (data) {
          setUserProfile(data);
        }
      } else {
        setIsAuthenticated(false);
        setUserProfile(null);
      }
    }

    checkUser();

    const { data: authListener } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session?.user) {
        setIsAuthenticated(true);
        const { data } = await supabase
          .from('profiles')
          .select('full_name')
          .eq('id', session.user.id)
          .single();
        if (data) {
          setUserProfile(data);
        }
      } else {
        setIsAuthenticated(false);
        setUserProfile(null);
      }
    });

    return () => authListener.subscription.unsubscribe();
  }, []);

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

  // Fetch Products (Modo B catalog)
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
            created_at,
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
          .map(mapDBProductToProduct)
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

  // Fetch collections counts
  useEffect(() => {
    async function fetchCollectionCounts() {
      const counts: { [tag: string]: number } = {};
      try {
        for (const col of COLLECTIONS) {
          const { count, error } = await supabase
            .from('products')
            .select('id', { count: 'exact', head: true })
            .eq('is_active', true)
            .contains('tags', [col.tag]);
          if (!error && count !== null) {
            counts[col.tag] = count;
          } else {
            counts[col.tag] = 0;
          }
        }
        setCollectionCounts(counts);
      } catch (err) {
        console.error('Error fetching collection counts:', err);
      }
    }
    fetchCollectionCounts();
  }, []);

  // Fetch Trending products (RPC with client-side fallback)
  useEffect(() => {
    async function fetchTrending() {
      try {
        setLoadingTrending(true);
        setErrorTrending(false);

        // 1. Try RPC
        const { data: rpcData, error: rpcError } = await supabase.rpc('get_trending_products');

        if (!rpcError && rpcData && rpcData.length > 0) {
          const topProductIds = rpcData.map((p: any) => p.id).slice(0, 8);
          await fetchTrendingByIds(topProductIds);
          return;
        }

        // 2. Fallback to client-side score computation from user_interactions (last 7 days)
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
        const { data: interactions, error: intError } = await supabase
          .from('user_interactions')
          .select('product_id, interaction_type, created_at')
          .gte('created_at', sevenDaysAgo);

        if (intError || !interactions || interactions.length === 0) {
          // 3. Secondary Fallback: featured products ordered by rating
          await fetchTrendingFallback();
          return;
        }

        // Calculate scores
        const scores: { [id: string]: number } = {};
        const todayInteractionsCount: { [id: string]: number } = {};
        const todayStr = new Date().toDateString();

        interactions.forEach((int) => {
          const pid = int.product_id;
          if (!pid) return;

          // Scores: purchase = 3, cart_add = 2, view = 1
          let points = 1;
          if (int.interaction_type === 'purchase') points = 3;
          else if (int.interaction_type === 'cart_add') points = 2;

          scores[pid] = (scores[pid] || 0) + points;

          // Count today's interactions for the badge
          if (int.created_at && new Date(int.created_at).toDateString() === todayStr) {
            todayInteractionsCount[pid] = (todayInteractionsCount[pid] || 0) + 1;
          }
        });

        setTrendingInteractionsCount(todayInteractionsCount);

        const topProductIds = Object.keys(scores)
          .sort((a, b) => scores[b] - scores[a])
          .slice(0, 8);

        if (topProductIds.length === 0) {
          await fetchTrendingFallback();
        } else {
          await fetchTrendingByIds(topProductIds);
        }
      } catch (err) {
        console.error('Error fetching trending products:', err);
        setErrorTrending(true);
        setLoadingTrending(false);
      }
    }

    async function fetchTrendingByIds(ids: string[]) {
      const { data, error } = await supabase
        .from('products')
        .select(`
          id, name, slug, category_id, short_description, is_healthy,
          preparation_hours, is_featured, rating_avg, review_count,
          tags, created_at,
          categories (name, slug),
          product_variants (id, price, compare_at_price, is_active),
          product_media (url, type, is_cover)
        `)
        .in('id', ids)
        .eq('is_active', true);

      if (error || !data) {
        await fetchTrendingFallback();
        return;
      }

      const mapped = (data as unknown as DBProduct[])
        .map(mapDBProductToProduct)
        .filter((p): p is Product => p !== null);

      // Sort mapped products in the order of the original ids
      mapped.sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id));

      setTrendingProducts(mapped);
      setLoadingTrending(false);
    }

    async function fetchTrendingFallback() {
      const { data, error } = await supabase
        .from('products')
        .select(`
          id, name, slug, category_id, short_description, is_healthy,
          preparation_hours, is_featured, rating_avg, review_count,
          tags, created_at,
          categories (name, slug),
          product_variants (id, price, compare_at_price, is_active),
          product_media (url, type, is_cover)
        `)
        .eq('is_active', true)
        .eq('is_featured', true)
        .order('rating_avg', { ascending: false })
        .limit(8);

      if (error || !data) {
        setTrendingProducts([]);
      } else {
        const mapped = (data as unknown as DBProduct[])
          .map(mapDBProductToProduct)
          .filter((p): p is Product => p !== null);
        setTrendingProducts(mapped);
      }
      setLoadingTrending(false);
    }

    fetchTrending();
  }, []);

  // Fetch Para Ti (personalized)
  useEffect(() => {
    async function fetchForYou() {
      try {
        setLoadingForYou(true);
        setErrorForYou(false);

        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user) {
          setForYouProducts([]);
          setLoadingForYou(false);
          return;
        }

        const { data: interactions, error } = await supabase
          .from('user_interactions')
          .select('product_id, interaction_type, created_at')
          .eq('user_id', session.user.id)
          .order('created_at', { ascending: false });

        if (error || !interactions || interactions.length === 0) {
          setForYouProducts([]);
          setLoadingForYou(false);
          return;
        }

        // Group by product_id
        const groups: { [id: string]: InteractionGroup } = {};
        interactions.forEach((int) => {
          const pid = int.product_id;
          if (!pid) return;

          if (!groups[pid]) {
            groups[pid] = {
              productId: pid,
              views: 0,
              purchases: 0,
              lastSeen: new Date(int.created_at || Date.now()),
            };
          }

          if (int.interaction_type === 'view') {
            groups[pid].views += 1;
          } else if (int.interaction_type === 'purchase') {
            groups[pid].purchases += 1;
          }
        });

        // Store interactions details for display labels
        const forYouIntDetails: { [id: string]: { views: number; purchases: number } } = {};
        Object.keys(groups).forEach((pid) => {
          forYouIntDetails[pid] = {
            views: groups[pid].views,
            purchases: groups[pid].purchases,
          };
        });
        setForYouInteractions(forYouIntDetails);

        // Sort: first those with purchases = 0 and views >= 2, then others. Take top 5
        const sortedIds = Object.values(groups)
          .sort((a, b) => {
            const aIntent = a.purchases === 0 && a.views >= 2;
            const bIntent = b.purchases === 0 && b.views >= 2;
            if (aIntent && !bIntent) return -1;
            if (!aIntent && bIntent) return 1;
            return b.lastSeen.getTime() - a.lastSeen.getTime();
          })
          .slice(0, 5)
          .map((g) => g.productId);

        if (sortedIds.length === 0) {
          setForYouProducts([]);
          setLoadingForYou(false);
          return;
        }

        const { data: prodsData, error: prodsError } = await supabase
          .from('products')
          .select(`
            id, name, slug, category_id, short_description, is_healthy,
            preparation_hours, is_featured, rating_avg, review_count,
            tags, created_at,
            categories (name, slug),
            product_variants (id, price, compare_at_price, is_active),
            product_media (url, type, is_cover)
          `)
          .in('id', sortedIds)
          .eq('is_active', true);

        if (prodsError || !prodsData) {
          setForYouProducts([]);
        } else {
          const mapped = (prodsData as unknown as DBProduct[])
            .map(mapDBProductToProduct)
            .filter((p): p is Product => p !== null);

          // Sort in original sortedIds order
          mapped.sort((a, b) => sortedIds.indexOf(a.id) - sortedIds.indexOf(b.id));
          setForYouProducts(mapped);
        }
        setLoadingForYou(false);
      } catch (err) {
        console.error('Error fetching personalized products:', err);
        setErrorForYou(true);
        setLoadingForYou(false);
      }
    }

    fetchForYou();
  }, [isAuthenticated]);

  // Filter products by categorySlug O categoryTag
  const filteredProducts = useMemo(() => {
    if (!categorySlug && !categoryTag) return products;
    if (categorySlug) {
      return products.filter((p) => p.categorySlug === categorySlug);
    }
    if (categoryTag) {
      return products.filter((p) => p.tags.includes(categoryTag));
    }
    return products;
  }, [products, categorySlug, categoryTag]);

  // Title for Modo B
  const title = useMemo(() => {
    if (categorySlug) {
      const found = categories.find((c) => c.slug === categorySlug);
      return found ? found.name : categorySlug.toUpperCase();
    }
    if (categoryTag) {
      const found = COLLECTIONS.find((c) => c.tag === categoryTag);
      return found ? found.label : categoryTag.toUpperCase();
    }
    return 'Descubrir';
  }, [categories, categorySlug, categoryTag]);

  const handleClearFilter = () => {
    router.replace('/(tabs)/explore');
  };

  const handlePressProduct = (product: Product) => {
    router.push({
      pathname: '/product/[id]',
      params: { id: product.id },
    });
  };

  // Add to cart helper for Para Ti section
  const handleAddToCart = (product: Product) => {
    useCartStore.getState().addItem({
      product_id: product.id,
      variant_id: product.variantId,
      name: product.name,
      size_label: 'Porción estándar',
      base_price: product.basePrice,
      quantity: 1,
      add_ons: [],
      image_url: product.imageUrl || undefined,
    });
  };

  // Weekday helper
  const dateHeader = useMemo(() => {
    const weekday = new Date().toLocaleDateString('es-CO', { weekday: 'long' });
    const capitalized = weekday.charAt(0).toUpperCase() + weekday.slice(1);
    return `Bogotá · ${capitalized}`;
  }, []);

  // Avatar text helper
  const avatarText = useMemo(() => {
    if (userProfile?.full_name) {
      return userProfile.full_name.charAt(0).toUpperCase();
    }
    return 'I';
  }, [userProfile]);

  const isFilteredMode = Boolean(categorySlug || categoryTag);

  // RENDER MODO B: Catálogo Filtrado
  if (isFilteredMode) {
    return (
      <View style={[styles.container, { paddingTop: insets.top + 16 }]}>
        <View style={styles.headerRow}>
          <Text style={styles.headerTitle} numberOfLines={1}>{title}</Text>
          <TouchableOpacity style={styles.clearChip} activeOpacity={0.7} onPress={handleClearFilter}>
            <Text style={styles.clearChipText}>× Limpiar filtro</Text>
          </TouchableOpacity>
        </View>

        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={BRAND.ink} />
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

  // RENDER MODO A: Pantalla Descubrir Completa
  return (
    <ScrollView
      style={[styles.container, { backgroundColor: BRAND.cream }]}
      contentContainerStyle={{ paddingTop: insets.top + 16, paddingBottom: insets.bottom + 90 }}
      showsVerticalScrollIndicator={false}
    >
      {/* HEADER */}
      <View style={styles.headerContainer}>
        <View style={styles.headerCopy}>
          <Text style={styles.locationText}>{dateHeader}</Text>
          <Text style={styles.discoverTitle}>Descubrir</Text>
          <Text style={styles.discoverSubtitle}>Lo que está pasando hoy</Text>
        </View>
        <TouchableOpacity
          style={styles.avatar}
          activeOpacity={0.8}
          onPress={() => router.push('/(tabs)/profile')}
        >
          <Text style={styles.avatarText}>{avatarText}</Text>
        </TouchableOpacity>
      </View>

      {/* BARRA DE BÚSQUEDA */}
      <TouchableOpacity
        style={styles.searchBarWrapper}
        activeOpacity={0.9}
        onPress={() => router.push('/modal')}
      >
        <View style={styles.searchInputContainer}>
          <Feather name="search" size={18} color="#8E8E93" style={styles.searchIcon} />
          <TextInput
            style={styles.searchBarInput}
            placeholder="Buscar pasteles, ocasiones…"
            placeholderTextColor="#8E8E93"
            editable={false}
            pointerEvents="none"
          />
        </View>
        <View style={styles.filterButtonSquare}>
          <Feather name="sliders" size={18} color={BRAND.lime} />
        </View>
      </TouchableOpacity>

      {/* BLOQUE 1 — TENDENCIAS */}
      <View style={styles.sectionHeaderRow}>
        <Text style={styles.sectionTitle}>TENDENCIAS</Text>
        <TouchableOpacity activeOpacity={0.7} onPress={handleClearFilter}>
          <Text style={styles.verTodoText}>Ver todo →</Text>
        </TouchableOpacity>
      </View>

      {loadingTrending ? (
        <View style={styles.blockLoader}>
          <ActivityIndicator size="small" color={BRAND.ink} />
        </View>
      ) : errorTrending ? (
        <View style={styles.blockErrorContainer}>
          <Feather name="alert-circle" size={20} color="#FF3B30" style={{ marginRight: 8 }} />
          <Text style={styles.blockErrorText}>No pudimos cargar tendencias</Text>
        </View>
      ) : trendingProducts.length > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.trendingScrollContent}
        >
          {trendingProducts.map((product) => {
            // Determine Badge
            let badgeText: string | null = null;
            let isNew = false;
            if (product.created_at) {
              const createdDate = new Date(product.created_at);
              const diffTime = Math.abs(Date.now() - createdDate.getTime());
              const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
              if (diffDays < 30) {
                badgeText = 'NUEVO';
                isNew = true;
              }
            }
            if (!badgeText) {
              const count = trendingInteractionsCount[product.id] || 0;
              if (count > 0) {
                badgeText = `${count} hoy`;
              }
            }

            return (
              <TouchableOpacity
                key={product.id}
                style={styles.trendingCard}
                activeOpacity={0.9}
                onPress={() => handlePressProduct(product)}
              >
                <View style={styles.trendingImageContainer}>
                  {product.imageUrl ? (
                    <Image source={{ uri: product.imageUrl }} style={styles.trendingImage} />
                  ) : (
                    <View style={styles.trendingImagePlaceholder} />
                  )}
                  {badgeText ? (
                    <View
                      style={[
                        styles.trendingBadge,
                        isNew
                          ? { backgroundColor: BRAND.lime }
                          : { backgroundColor: 'rgba(0,0,0,0.5)' },
                      ]}
                    >
                      <Text
                        style={[
                          styles.trendingBadgeText,
                          isNew ? { color: BRAND.ink } : { color: '#FFF' },
                        ]}
                      >
                        {badgeText}
                      </Text>
                    </View>
                  ) : null}
                </View>
                <View style={styles.trendingInfo}>
                  <Text style={styles.trendingName} numberOfLines={2}>
                    {product.name}
                  </Text>
                  <Text style={styles.trendingPrice}>
                    ${product.minPrice.toLocaleString('es-CO')}
                  </Text>
                  <View style={styles.trendingRatingRow}>
                    <Text style={styles.trendingRatingStar}>★</Text>
                    <Text style={styles.trendingRatingText}>
                      {product.rating.toFixed(1)}{' '}
                      <Text style={styles.trendingReviewCount}>({product.reviewCount})</Text>
                    </Text>
                  </View>
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      ) : null}

      {/* BLOQUE 2 — COLECCIONES */}
      {Object.values(collectionCounts).some((count) => count > 0) ? (
        <>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>COLECCIONES</Text>
          </View>
          <View style={styles.collectionsContainer}>
            {COLLECTIONS.map((col) => {
              const count = collectionCounts[col.tag] || 0;
              if (count === 0) return null;

              return (
                <TouchableOpacity
                  key={col.tag}
                  style={[styles.collectionCard, { backgroundColor: col.bg }]}
                  activeOpacity={0.85}
                  onPress={() => router.push(`/(tabs)/explore?categoryTag=${col.tag}`)}
                >
                  <View style={styles.collectionLeft}>
                    <Text style={styles.collectionEmoji}>{col.emoji}</Text>
                    <View style={styles.collectionTextCol}>
                      <Text style={styles.collectionLabel}>{col.label}</Text>
                      <Text style={styles.collectionCount}>{count} opciones</Text>
                    </View>
                  </View>
                  <View style={styles.collectionArrow}>
                    <Feather name="arrow-right" size={15} color="#FFF" />
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        </>
      ) : null}

      {/* BLOQUE 3 — PARA TI */}
      <View style={styles.sectionHeaderRow}>
        <Text style={styles.sectionTitle}>PARA TI</Text>
        <Text style={styles.sectionSubtextRight}>Basado en tus visitas</Text>
      </View>

      {!isAuthenticated ? (
        <View style={styles.guestBannerContainer}>
          <View style={[styles.guestBanner, { backgroundColor: BRAND.ink }]}>
            <View style={styles.guestIconCircle}>
              <Feather name="user" size={18} color={BRAND.lime} />
            </View>
            <View style={styles.guestTextCol}>
              <Text style={styles.guestTitle}>Inicia sesión para ver Para ti</Text>
              <Text style={styles.guestSubtitle}>Recomendaciones basadas en tus pedidos</Text>
            </View>
            <TouchableOpacity
              style={[styles.guestLoginButton, { backgroundColor: BRAND.lime }]}
              activeOpacity={0.8}
              onPress={() => router.push('/(tabs)/profile')}
            >
              <Text style={styles.guestLoginText}>Entrar</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : loadingForYou ? (
        <View style={styles.blockLoader}>
          <ActivityIndicator size="small" color={BRAND.ink} />
        </View>
      ) : errorForYou ? (
        <View style={styles.blockErrorContainer}>
          <Feather name="alert-circle" size={20} color="#FF3B30" style={{ marginRight: 8 }} />
          <Text style={styles.blockErrorText}>No pudimos cargar tus recomendaciones</Text>
        </View>
      ) : forYouProducts.length > 0 ? (
        <View style={styles.forYouContainer}>
          {forYouProducts.map((product) => {
            // Determine contextual label
            const int = forYouInteractions[product.id];
            const views = int?.views || 0;
            const purchases = int?.purchases || 0;

            let contextualLabel = 'Te puede interesar';
            if (purchases >= 1) {
              contextualLabel = 'Lo compraste antes';
            } else if (views >= 3) {
              contextualLabel = `Volviste a verlo ${views} veces`;
            }

            return (
              <TouchableOpacity
                key={product.id}
                style={styles.forYouCard}
                activeOpacity={0.9}
                onPress={() => handlePressProduct(product)}
              >
                {product.imageUrl ? (
                  <Image source={{ uri: product.imageUrl }} style={styles.forYouThumbnail} />
                ) : (
                  <View style={styles.forYouThumbnailPlaceholder} />
                )}
                <View style={styles.forYouMiddle}>
                  <Text style={styles.forYouContextLabel}>{contextualLabel}</Text>
                  <Text style={styles.forYouName} numberOfLines={1}>
                    {product.name}
                  </Text>
                  <Text style={styles.forYouPrice}>
                    ${product.minPrice.toLocaleString('es-CO')}
                  </Text>
                </View>
                <TouchableOpacity
                  style={[styles.forYouCartButton, { backgroundColor: BRAND.lime }]}
                  activeOpacity={0.8}
                  onPress={() => handleAddToCart(product)}
                >
                  <Feather name="shopping-cart" size={15} color={BRAND.ink} />
                </TouchableOpacity>
              </TouchableOpacity>
            );
          })}
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAF7F0', // BRAND.cream fallback
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 15,
    color: '#6B7280',
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
    color: '#6B7280',
    textAlign: 'center',
    fontWeight: '500',
    lineHeight: 22,
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
    color: '#1E3A2F',
    flex: 1,
    marginRight: 10,
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

  // Discover screen styles
  headerContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  headerCopy: {
    flex: 1,
  },
  locationText: {
    fontSize: 11,
    color: '#888',
    fontWeight: '500',
    marginBottom: 4,
  },
  discoverTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: '#1E3A2F', // BRAND.ink
  },
  discoverSubtitle: {
    fontSize: 13,
    color: '#888',
    marginTop: 2,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#1E3A2F', // BRAND.ink
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: '#A8D832', // BRAND.lime
    fontSize: 15,
    fontWeight: '700',
  },
  searchBarWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 24,
    gap: 10,
  },
  searchInputContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#eae8e3',
    paddingHorizontal: 12,
    height: 44,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchBarInput: {
    flex: 1,
    fontSize: 14,
    color: '#1E3A2F',
  },
  filterButtonSquare: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#1E3A2F', // BRAND.ink
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#1E3A2F',
    letterSpacing: 0.5,
  },
  verTodoText: {
    fontSize: 11,
    color: '#1E3A2F',
    fontWeight: '700',
  },
  sectionSubtextRight: {
    fontSize: 11,
    color: '#888',
  },
  blockLoader: {
    height: 100,
    justifyContent: 'center',
    alignItems: 'center',
  },
  blockErrorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginBottom: 20,
    padding: 12,
    backgroundColor: '#FFEAEA',
    borderRadius: 12,
  },
  blockErrorText: {
    fontSize: 13,
    color: '#D1221D',
    fontWeight: '600',
  },

  // Trending
  trendingScrollContent: {
    paddingLeft: 16,
    paddingRight: 6,
    gap: 10,
    marginBottom: 24,
  },
  trendingCard: {
    width: 140,
    backgroundColor: '#FFF',
    borderRadius: 14,
    borderWidth: 0.5,
    borderColor: '#eae8e3',
    overflow: 'hidden',
  },
  trendingImageContainer: {
    width: 140,
    height: 100,
    position: 'relative',
  },
  trendingImage: {
    width: 140,
    height: 100,
  },
  trendingImagePlaceholder: {
    width: 140,
    height: 100,
    backgroundColor: '#e0ddd5',
  },
  trendingBadge: {
    position: 'absolute',
    top: 6,
    left: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 99,
  },
  trendingBadgeText: {
    fontSize: 9,
    fontWeight: '800',
  },
  trendingInfo: {
    padding: 8,
  },
  trendingName: {
    fontSize: 11,
    fontWeight: '600',
    color: '#1E3A2F',
    lineHeight: 14,
    height: 28,
  },
  trendingPrice: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1E3A2F',
    marginTop: 4,
  },
  trendingRatingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  trendingRatingStar: {
    fontSize: 10,
    color: '#FFD700',
    marginRight: 2,
  },
  trendingRatingText: {
    fontSize: 9,
    color: '#888',
    fontWeight: '600',
  },
  trendingReviewCount: {
    fontWeight: '400',
  },

  // Collections
  collectionsContainer: {
    paddingHorizontal: 16,
    gap: 8,
    marginBottom: 24,
  },
  collectionCard: {
    height: 72,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    overflow: 'hidden',
  },
  collectionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  collectionEmoji: {
    fontSize: 22,
    marginRight: 12,
  },
  collectionTextCol: {
    flex: 1,
  },
  collectionLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFF',
  },
  collectionCount: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.55)',
    marginTop: 2,
  },
  collectionArrow: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // For You / Guest
  guestBannerContainer: {
    paddingHorizontal: 16,
    marginBottom: 20,
  },
  guestBanner: {
    borderRadius: 14,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  guestIconCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(168,216,50,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  guestTextCol: {
    flex: 1,
  },
  guestTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFF',
  },
  guestSubtitle: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.55)',
    marginTop: 2,
  },
  guestLoginButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 99,
  },
  guestLoginText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#1E3A2F',
  },
  forYouContainer: {
    paddingHorizontal: 16,
    gap: 8,
    marginBottom: 20,
  },
  forYouCard: {
    backgroundColor: '#FFF',
    borderRadius: 14,
    borderWidth: 0.5,
    borderColor: '#eae8e3',
    padding: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  forYouThumbnail: {
    width: 56,
    height: 56,
    borderRadius: 10,
  },
  forYouThumbnailPlaceholder: {
    width: 56,
    height: 56,
    borderRadius: 10,
    backgroundColor: '#e0ddd5',
  },
  forYouMiddle: {
    flex: 1,
  },
  forYouContextLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: '#1E3A2F',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  forYouName: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1E3A2F',
    marginTop: 2,
  },
  forYouPrice: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1E3A2F',
    marginTop: 2,
  },
  forYouCartButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
