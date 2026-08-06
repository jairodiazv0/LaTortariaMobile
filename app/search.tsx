/**
 * app/search.tsx
 *
 * Pantalla dedicada de búsqueda de productos.
 * Presentada como modal nativo (slide_from_bottom) desde explore.tsx.
 *
 * Estados UX:
 *  – Vacío    (input sin texto): recientes + trending + chips de categoría
 *  – Buscando (≥2 chars, debounce 300ms): ActivityIndicator + grid de resultados
 *  – Resultados: FlatList numColumns={2} con ProductCardMobile
 *  – Sin resultados: mensaje amable + sugerencias featured
 *  – Error: banner rojo con ícono alert-triangle
 */

import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState, useCallback } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Keyboard,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Platform,
} from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BRAND } from '@/constants/Colors';
import { ProductCardMobile, ProductCardData } from '@/components/ProductCardMobile';
import { supabase } from '@/lib/supabase';
import { useRecentSearchesStore } from '@/store/useRecentSearchesStore';
import {
  useTrendingProducts,
  TrendingProduct,
  TrendingDBProduct,
  mapTrendingDBProduct,
} from '@/hooks/useTrendingProducts';

// ─── Tipos locales de BD ──────────────────────────────────────────────────────

interface SearchDBProductVariant {
  id: string;
  price: number;
  compare_at_price: number | null;
  is_active: boolean;
}

interface SearchDBProductMedia {
  url: string;
  type: string;
  is_cover: boolean;
}

interface SearchDBProduct {
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
  categories: { name: string; slug: string } | null;
  product_variants: SearchDBProductVariant[];
  product_media: SearchDBProductMedia[];
}

interface SearchProduct {
  id: string;
  variantId: string;
  name: string;
  minPrice: number;
  compareAtPrice?: number | null;
  imageUrl?: string | null;
  shortDescription?: string;
  isHealthy?: boolean;
  variantsCount?: number;
  isFeatured?: boolean;
}

interface Category {
  id: string;
  name: string;
  slug: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function mapDBProductToSearchProduct(dbProd: SearchDBProduct): SearchProduct | null {
  const activeVariants = dbProd.product_variants.filter((v) => v.is_active);
  if (activeVariants.length === 0) return null;

  const baseVariant = activeVariants[0];
  const validPrices = activeVariants
    .map((v) => Number(v.price))
    .filter((p) => !Number.isNaN(p) && p > 0);
  const minPrice =
    validPrices.length > 0 ? Math.min(...validPrices) : Number(baseVariant.price);

  const coverImage = dbProd.product_media.find((m) => m.is_cover && m.type === 'image');

  return {
    id: dbProd.id,
    variantId: baseVariant.id,
    name: dbProd.name,
    minPrice,
    compareAtPrice: baseVariant.compare_at_price ? Number(baseVariant.compare_at_price) : null,
    imageUrl: coverImage?.url || null,
    shortDescription: dbProd.short_description || '',
    isHealthy: dbProd.is_healthy || false,
    variantsCount: activeVariants.length,
    isFeatured: dbProd.is_featured || false,
  };
}

function toProductCardData(p: SearchProduct): ProductCardData {
  return {
    id: p.id,
    name: p.name,
    short_description: p.shortDescription,
    image_url: p.imageUrl,
    minPrice: p.minPrice,
    compare_at_price: p.compareAtPrice,
    is_healthy: p.isHealthy,
    variantsCount: p.variantsCount,
  };
}

/**
 * Escapa caracteres especiales de LIKE/PostgREST: % _ \
 * Las comas y paréntesis que romperían .or() se evitan usando
 * Promise.all con dos queries separadas.
 */
function escapeLike(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}

const PRODUCT_SELECT = `
  id, name, slug, category_id, short_description, is_healthy,
  preparation_hours, is_featured, rating_avg, review_count,
  tags, created_at,
  categories (name, slug),
  product_variants (id, price, compare_at_price, is_active),
  product_media (url, type, is_cover)
`;

// ─── Componente principal ─────────────────────────────────────────────────────

export default function SearchScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const inputRef = useRef<TextInput>(null);

  // ── Store ──────────────────────────────────────────────────────────────────
  const { terms: recentTerms, addTerm, removeTerm, clearAll } = useRecentSearchesStore();

  // ── Trending (hook compartido) ─────────────────────────────────────────────
  const { trendingProducts, loadingTrending, errorTrending } = useTrendingProducts();

  // ── Categorías ─────────────────────────────────────────────────────────────
  const [categories, setCategories] = useState<Category[]>([]);

  // ── Estado de búsqueda ────────────────────────────────────────────────────
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<SearchProduct[]>([]);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);

  // ── Sugerencias (para estado sin resultados) ──────────────────────────────
  const [suggestions, setSuggestions] = useState<SearchProduct[]>([]);

  // ── requestId para descartar respuestas obsoletas ─────────────────────────
  const requestIdRef = useRef(0);

  // ─── Fetch categorías ──────────────────────────────────────────────────────
  useEffect(() => {
    async function fetchCategories() {
      try {
        const { data } = await supabase
          .from('categories')
          .select('id, name, slug')
          .eq('is_active', true);
        if (data) setCategories(data);
      } catch (err) {
        if (__DEV__) console.error('[Search] fetchCategories error:', err);
      }
    }
    fetchCategories();
  }, []);

  // ─── Fetch sugerencias featured ───────────────────────────────────────────
  useEffect(() => {
    async function fetchSuggestions() {
      try {
        const { data } = await supabase
          .from('products')
          .select(PRODUCT_SELECT)
          .eq('is_active', true)
          .eq('is_featured', true)
          .order('rating_avg', { ascending: false })
          .limit(4);

        if (data) {
          const mapped = (data as unknown as SearchDBProduct[])
            .map(mapDBProductToSearchProduct)
            .filter((p): p is SearchProduct => p !== null);
          setSuggestions(mapped);
        }
      } catch (err) {
        if (__DEV__) console.error('[Search] fetchSuggestions error:', err);
      }
    }
    fetchSuggestions();
  }, []);

  // ─── Debounce ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(query);
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  // ─── Motor de búsqueda ────────────────────────────────────────────────────
  useEffect(() => {
    const trimmed = debouncedQuery.trim();

    // Menos de 2 chars → volver al estado vacío sin parpadeo
    if (trimmed.length < 2) {
      setResults([]);
      setHasSearched(false);
      setSearchError(null);
      setSearching(false);
      return;
    }

    // Incrementar requestId para invalidar respuestas previas
    const currentRequestId = ++requestIdRef.current;

    async function performSearch(searchTerm: string) {
      setSearching(true);
      setSearchError(null);

      try {
        const escaped = escapeLike(searchTerm);

        // Estrategia: dos queries paralelas en vez de .or() para evitar que
        // comas o paréntesis en el término rompan el parseo de PostgREST.
        // La coincidencia en 'name' tiene prioridad (se coloca primero al merge).
        const [nameResult, descResult] = await Promise.all([
          supabase
            .from('products')
            .select(PRODUCT_SELECT)
            .eq('is_active', true)
            .ilike('name', `%${escaped}%`)
            .limit(30),
          supabase
            .from('products')
            .select(PRODUCT_SELECT)
            .eq('is_active', true)
            .ilike('short_description', `%${escaped}%`)
            .limit(20),
        ]);

        // Descartar si llegó una respuesta más nueva mientras esperábamos
        if (currentRequestId !== requestIdRef.current) return;

        const nameError = nameResult.error;
        const descError = descResult.error;

        if (nameError && descError) {
          throw nameError;
        }

        // Mergear deduplicando por id; name-matches primero
        const seen = new Set<string>();
        const merged: SearchDBProduct[] = [];

        const nameData = (nameResult.data || []) as unknown as SearchDBProduct[];
        const descData = (descResult.data || []) as unknown as SearchDBProduct[];

        for (const item of nameData) {
          if (!seen.has(item.id)) {
            seen.add(item.id);
            merged.push(item);
          }
        }
        for (const item of descData) {
          if (!seen.has(item.id)) {
            seen.add(item.id);
            merged.push(item);
          }
        }

        const mapped = merged
          .map(mapDBProductToSearchProduct)
          .filter((p): p is SearchProduct => p !== null);

        setResults(mapped);
        setHasSearched(true);

        // Guardar en recientes solo cuando hay al menos 1 resultado
        if (mapped.length > 0) {
          addTerm(searchTerm.trim());
        }
      } catch (err: any) {
        if (currentRequestId !== requestIdRef.current) return;
        if (__DEV__) console.error('[Search] performSearch error:', err);
        setSearchError(err.message || 'Error al conectar con la pastelería.');
        setHasSearched(true);
      } finally {
        if (currentRequestId === requestIdRef.current) {
          setSearching(false);
        }
      }
    }

    performSearch(trimmed);
  }, [debouncedQuery, addTerm]);

  // ─── Handlers ─────────────────────────────────────────────────────────────

  const handleCancel = useCallback(() => {
    Keyboard.dismiss();
    router.back();
  }, [router]);

  const handleClearInput = useCallback(() => {
    setQuery('');
    inputRef.current?.focus();
  }, []);

  const handlePressProduct = useCallback(
    (id: string) => {
      // Guardar en recientes al tocar un resultado
      const trimmed = query.trim();
      if (trimmed.length >= 2) addTerm(trimmed);

      Keyboard.dismiss();
      router.push({ pathname: '/product/[id]', params: { id } });
    },
    [query, addTerm, router]
  );

  const handleSubmit = useCallback(() => {
    const trimmed = query.trim();
    if (trimmed.length >= 2) {
      addTerm(trimmed);
      setDebouncedQuery(trimmed); // dispara búsqueda inmediatamente al hacer submit
    }
    Keyboard.dismiss();
  }, [query, addTerm]);

  const handleChipPress = useCallback((term: string) => {
    setQuery(term);
    setDebouncedQuery(term);
  }, []);

  const handleCategoryChip = useCallback(
    (slug: string) => {
      Keyboard.dismiss();
      router.back();
      // Pequeño delay para que el modal se cierre antes de navegar
      setTimeout(() => {
        router.push(`/(tabs)/explore?categorySlug=${slug}` as any);
      }, 200);
    },
    [router]
  );

  // ─── Sub-componentes de estado vacío ─────────────────────────────────────

  const renderEmptyState = () => (
    <ScrollView
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      contentContainerStyle={styles.emptyScrollContent}
    >
      {/* RECIENTES */}
      {recentTerms.length > 0 && (
        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>RECIENTES</Text>
            <TouchableOpacity onPress={clearAll} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={styles.clearAllText}>Borrar todo</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.chipsRow}>
            {recentTerms.map((term) => (
              <View key={term} style={styles.recentChip}>
                <TouchableOpacity
                  onPress={() => handleChipPress(term)}
                  hitSlop={{ top: 6, bottom: 6, left: 6, right: 2 }}
                >
                  <Text style={styles.recentChipText}>{term}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => removeTerm(term)}
                  hitSlop={{ top: 8, bottom: 8, left: 4, right: 8 }}
                  style={styles.recentChipClose}
                >
                  <Feather name="x" size={11} color={BRAND.slate} />
                </TouchableOpacity>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* CATEGORÍAS RÁPIDAS */}
      {categories.length > 0 && (
        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>CATEGORÍAS</Text>
          </View>
          <View style={styles.chipsRow}>
            {categories.map((cat) => (
              <TouchableOpacity
                key={cat.id}
                style={styles.categoryChip}
                onPress={() => handleCategoryChip(cat.slug)}
                activeOpacity={0.75}
              >
                <Text style={styles.categoryChipText}>{cat.name}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}

      {/* TENDENCIAS */}
      <View style={styles.section}>
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>TENDENCIAS</Text>
        </View>

        {loadingTrending ? (
          <View style={styles.blockLoader}>
            <ActivityIndicator size="small" color={BRAND.ink} />
          </View>
        ) : errorTrending ? (
          <View style={styles.blockError}>
            <Feather name="alert-circle" size={16} color="#FF3B30" style={{ marginRight: 6 }} />
            <Text style={styles.blockErrorText}>No pudimos cargar tendencias</Text>
          </View>
        ) : (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.trendingScrollContent}
          >
            {trendingProducts.map((product) => (
              <TouchableOpacity
                key={product.id}
                style={styles.trendingCard}
                activeOpacity={0.9}
                onPress={() => handlePressProduct(product.id)}
              >
                <View style={styles.trendingImageContainer}>
                  {product.imageUrl ? (
                    <Image
                      source={{ uri: product.imageUrl }}
                      style={styles.trendingImage}
                      contentFit="cover"
                      cachePolicy="memory-disk"
                      recyclingKey={product.id}
                      transition={150}
                    />
                  ) : (
                    <View style={styles.trendingImagePlaceholder} />
                  )}
                </View>
                <View style={styles.trendingInfo}>
                  <Text style={styles.trendingName} numberOfLines={2}>
                    {product.name}
                  </Text>
                  <Text style={styles.trendingPrice}>
                    ${product.minPrice.toLocaleString('es-CO')}
                  </Text>
                </View>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}
      </View>
    </ScrollView>
  );

  // ─── Sub-componente de skeleton de carga ──────────────────────────────────

  const renderSearchingSkeleton = () => (
    <View style={styles.skeletonContainer}>
      {Array.from({ length: 6 }).map((_, i) => (
        <View key={i} style={styles.skeletonCard} />
      ))}
    </View>
  );

  // ─── Sub-componente sin resultados ────────────────────────────────────────

  const renderNoResults = () => (
    <ScrollView
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={styles.noResultsScroll}
    >
      <View style={styles.noResultsHero}>
        <Text style={styles.noResultsEmoji}>🔍</Text>
        <Text style={styles.noResultsTitle}>
          No encontramos nada para "{debouncedQuery.trim()}"
        </Text>
        <Text style={styles.noResultsSubtitle}>
          Prueba con otro término o explora estas opciones
        </Text>
      </View>

      {suggestions.length > 0 && (
        <>
          <Text style={[styles.sectionTitle, { paddingHorizontal: 16, marginBottom: 12 }]}>
            TE PUEDE INTERESAR
          </Text>
          <View style={styles.suggestionsGrid}>
            {suggestions.map((p) => (
              <View key={p.id} style={styles.gridItem}>
                <ProductCardMobile
                  product={toProductCardData(p)}
                  onPress={() => handlePressProduct(p.id)}
                />
              </View>
            ))}
          </View>
        </>
      )}
    </ScrollView>
  );

  // ─── Render error ─────────────────────────────────────────────────────────

  const renderError = () => (
    <View style={styles.errorContainer}>
      <Feather name="alert-triangle" size={32} color="#FF3B30" />
      <Text style={styles.errorText}>No pudimos conectar con la pastelería.</Text>
      <Text style={styles.errorSubtext}>{searchError}</Text>
    </View>
  );

  // ─── Determinar estado actual ─────────────────────────────────────────────

  const trimmedQuery = query.trim();
  const isEmptyState = trimmedQuery.length < 2 && !hasSearched;

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* HEADER — Input + Cancelar */}
      <View style={styles.header}>
        <View style={styles.inputWrapper}>
          <Feather name="search" size={17} color={BRAND.slate} style={styles.searchIcon} />
          <TextInput
            ref={inputRef}
            style={styles.input}
            placeholder="Buscar pasteles, ocasiones…"
            placeholderTextColor={BRAND.slate}
            value={query}
            onChangeText={setQuery}
            autoFocus
            returnKeyType="search"
            onSubmitEditing={handleSubmit}
            autoCapitalize="none"
            autoCorrect={false}
            clearButtonMode="never" // usamos nuestro propio botón ×
          />
          {/* Botón × dentro del input */}
          {query.length > 0 && (
            <TouchableOpacity
              onPress={handleClearInput}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              style={styles.clearButton}
            >
              <View style={styles.clearButtonInner}>
                <Feather name="x" size={11} color={BRAND.paper} />
              </View>
            </TouchableOpacity>
          )}
          {/* Spinner sutil junto al input mientras busca */}
          {searching && query.length >= 2 && (
            <ActivityIndicator
              size="small"
              color={BRAND.moss}
              style={styles.inputSpinner}
            />
          )}
        </View>

        <TouchableOpacity onPress={handleCancel} style={styles.cancelButton} activeOpacity={0.7}>
          <Text style={styles.cancelText}>Cancelar</Text>
        </TouchableOpacity>
      </View>

      {/* ── CONTENIDO PRINCIPAL ── */}

      {isEmptyState ? (
        renderEmptyState()
      ) : searching && !hasSearched ? (
        renderSearchingSkeleton()
      ) : searchError ? (
        renderError()
      ) : hasSearched && results.length === 0 ? (
        renderNoResults()
      ) : (
        /* RESULTADOS */
        <>
          <Text style={styles.resultsCounter}>
            {results.length} resultado{results.length !== 1 ? 's' : ''} para "
            {debouncedQuery.trim()}"
          </Text>
          <FlatList
            data={results}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <View style={styles.gridItem}>
                <ProductCardMobile
                  product={toProductCardData(item)}
                  onPress={() => handlePressProduct(item.id)}
                />
              </View>
            )}
            numColumns={2}
            columnWrapperStyle={styles.rowWrapper}
            contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 32 }]}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            removeClippedSubviews={true}
            initialNumToRender={6}
            maxToRenderPerBatch={6}
            windowSize={5}
          />
        </>
      )}
    </View>
  );
}

// ─── Estilos ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BRAND.cream,
  },

  // ── Header ─────────────────────────────────────────────────────────────────
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: BRAND.border,
    backgroundColor: BRAND.cream,
  },
  inputWrapper: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: BRAND.paper,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: BRAND.border,
    paddingHorizontal: 12,
    height: 46,
    shadowColor: BRAND.ink,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  searchIcon: {
    marginRight: 8,
  },
  input: {
    flex: 1,
    fontSize: 15,
    color: BRAND.ink,
    // sin padding extra en Android para que el cursor esté centrado
    paddingVertical: 0,
  },
  clearButton: {
    marginLeft: 6,
  },
  clearButtonInner: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: BRAND.slate,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inputSpinner: {
    marginLeft: 8,
  },
  cancelButton: {
    paddingHorizontal: 4,
    paddingVertical: 6,
  },
  cancelText: {
    fontSize: 15,
    fontWeight: '600',
    color: BRAND.moss,
  },

  // ── Estado vacío ───────────────────────────────────────────────────────────
  emptyScrollContent: {
    paddingTop: 20,
    paddingBottom: 40,
  },
  section: {
    marginBottom: 24,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: BRAND.ink,
    letterSpacing: 0.5,
  },
  clearAllText: {
    fontSize: 12,
    fontWeight: '600',
    color: BRAND.slate,
  },

  // Chips recientes
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 16,
    gap: 8,
  },
  recentChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: BRAND.mist,
    borderRadius: 99,
    paddingLeft: 12,
    paddingRight: 8,
    paddingVertical: 7,
    gap: 4,
  },
  recentChipText: {
    fontSize: 13,
    color: BRAND.ink,
    fontWeight: '500',
  },
  recentChipClose: {
    paddingLeft: 2,
  },

  // Chips categoría
  categoryChip: {
    backgroundColor: BRAND.divider,
    borderRadius: 99,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: BRAND.border,
  },
  categoryChipText: {
    fontSize: 13,
    color: BRAND.ink,
    fontWeight: '500',
  },

  // Trending en estado vacío
  trendingScrollContent: {
    paddingLeft: 16,
    paddingRight: 6,
    gap: 10,
  },
  trendingCard: {
    width: 130,
    backgroundColor: BRAND.paper,
    borderRadius: 14,
    borderWidth: 0.5,
    borderColor: BRAND.border,
    overflow: 'hidden',
  },
  trendingImageContainer: {
    width: 130,
    height: 90,
  },
  trendingImage: {
    width: 130,
    height: 90,
  },
  trendingImagePlaceholder: {
    width: 130,
    height: 90,
    backgroundColor: BRAND.mist,
  },
  trendingInfo: {
    padding: 8,
  },
  trendingName: {
    fontSize: 11,
    fontWeight: '600',
    color: BRAND.ink,
    lineHeight: 14,
    height: 28,
  },
  trendingPrice: {
    fontSize: 12,
    fontWeight: '700',
    color: BRAND.ink,
    marginTop: 4,
  },

  // Block loader / error
  blockLoader: {
    height: 80,
    justifyContent: 'center',
    alignItems: 'center',
  },
  blockError: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    padding: 12,
    backgroundColor: '#FFEAEA',
    borderRadius: 12,
  },
  blockErrorText: {
    fontSize: 13,
    color: '#D1221D',
    fontWeight: '600',
  },

  // ── Skeleton ───────────────────────────────────────────────────────────────
  skeletonContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 10,
    gap: 12,
    paddingTop: 16,
  },
  skeletonCard: {
    width: '47%',
    aspectRatio: 0.75,
    borderRadius: 16,
    backgroundColor: BRAND.mist,
  },

  // ── Sin resultados ─────────────────────────────────────────────────────────
  noResultsScroll: {
    paddingTop: 32,
    paddingBottom: 40,
  },
  noResultsHero: {
    alignItems: 'center',
    paddingHorizontal: 32,
    marginBottom: 32,
  },
  noResultsEmoji: {
    fontSize: 48,
    marginBottom: 12,
  },
  noResultsTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: BRAND.ink,
    textAlign: 'center',
    marginBottom: 6,
  },
  noResultsSubtitle: {
    fontSize: 13,
    color: BRAND.slate,
    textAlign: 'center',
    lineHeight: 19,
  },
  suggestionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 10,
    gap: 12,
  },

  // ── Error ──────────────────────────────────────────────────────────────────
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
    color: BRAND.slate,
    textAlign: 'center',
  },

  // ── Grid de resultados ─────────────────────────────────────────────────────
  resultsCounter: {
    fontSize: 12,
    fontWeight: '600',
    color: BRAND.slate,
    paddingHorizontal: 16,
    paddingVertical: 10,
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
});
