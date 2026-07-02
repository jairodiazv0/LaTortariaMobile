import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { supabase } from '../../lib/supabase';
import { useCartStore } from '../../store/useCartStore';

// ─── Tipos ───────────────────────────────────────────────────────────────────

type ProductBadge = 'TOP' | 'NUEVO';

interface OccasionOption {
  id: string;
  label: string;
  emoji: string;
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
}

interface DBProduct {
  id: string;
  name: string;
  slug: string;
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
  compareAtPrice?: number | null;
  imageUrl?: string | null;
  badge?: ProductBadge;
  categoryName?: string | null;
  tags: string[];
}

// ─── Datos mock B2C ──────────────────────────────────────────────────────────

const OCCASIONS: OccasionOption[] = [
  { id: 'cumple', label: 'Cumple', emoji: '🎂' },
  { id: 'empresa', label: 'Empresa', emoji: '💼' },
  { id: 'amor', label: 'Amor', emoji: '❤️' },
  { id: 'grado', label: 'Grado', emoji: '🎓' },
];

// ─── Utilidades ──────────────────────────────────────────────────────────────

function formatLocationDate(date: Date): string {
  const weekday = date.toLocaleDateString('es-CO', { weekday: 'long' });
  const capitalized = weekday.charAt(0).toUpperCase() + weekday.slice(1);
  return `Bogotá · ${capitalized}`;
}

function formatCOP(price: number): string {
  return `$${price.toLocaleString('es-CO')}`;
}

// ─── Subcomponentes ──────────────────────────────────────────────────────────

function HomeHeader({
  profileName,
  searchQuery,
  onSearchChange,
}: {
  profileName: string | null;
  searchQuery: string;
  onSearchChange: (text: string) => void;
}) {
  const router = useRouter();
  const locationDate = useMemo(() => formatLocationDate(new Date()), []);

  const displayName = profileName || 'Invitado';
  const firstName = displayName.split(' ')[0];
  const initial = displayName.charAt(0).toUpperCase();

  return (
    <View style={styles.header}>
      <View style={styles.headerTopRow}>
        <View style={styles.headerCopy}>
          <Text style={styles.locationText}>{locationDate}</Text>
          <Text style={styles.greetingText}>Buenas, {firstName}</Text>
          <Text style={styles.guideQuestion}>¿Qué se te antoja hoy?</Text>
        </View>
        {/* ── AVATAR INTERACTIVO CON INICIAL DINÁMICA ── */}
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => router.push('/(tabs)/profile')}
          style={styles.avatar}
        >
          <Text style={styles.avatarInitial}>{initial}</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.searchRow}>
        <View style={styles.searchInputWrapper}>
          <Feather name="search" size={18} color="#8E8E93" style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Buscar pasteles, ocasiones..."
            placeholderTextColor="#8E8E93"
            returnKeyType="search"
            value={searchQuery}
            onChangeText={onSearchChange}
          />
        </View>
        <TouchableOpacity
          style={styles.filterButton}
          activeOpacity={0.85}
          onPress={() => (searchQuery ? onSearchChange('') : null)}
        >
          <Feather name={searchQuery ? 'x' : 'sliders'} size={20} color="#FFFFFF" />
        </TouchableOpacity>
      </View>
    </View>
  );
}

function OccasionSection() {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Para la ocasión</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.occasionScroll}>
        {OCCASIONS.map((occasion) => (
          <TouchableOpacity
            key={occasion.id}
            style={styles.occasionChip}
            activeOpacity={0.75}>
            <Text style={styles.occasionEmoji}>{occasion.emoji}</Text>
            <Text style={styles.occasionLabel}>{occasion.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

interface ProductCardProps {
  product: Product;
  onAdd: (product: Product) => void;
  onPress: () => void;
}

function ProductCard({ product, onAdd, onPress }: ProductCardProps) {
  return (
    <TouchableOpacity
      style={styles.productCard}
      activeOpacity={0.9}
      onPress={onPress}>
      <View style={styles.productImageWrapper}>
        {product.imageUrl ? (
          <Image
            source={{ uri: product.imageUrl }}
            style={styles.productImage}
            resizeMode="cover"
          />
        ) : (
          <View style={styles.productImagePlaceholder}>
            <Text style={styles.productImageEmoji}>🍰</Text>
          </View>
        )}
        {product.badge ? (
          <View
            style={[
              styles.productBadge,
              product.badge === 'NUEVO' && styles.productBadgeNew,
            ]}>
            <Text style={styles.productBadgeText}>{product.badge}</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.productDetails}>
        <Text style={styles.productName} numberOfLines={2}>
          {product.name} — {product.sizeLabel}
        </Text>
        <Text style={styles.productRating}>
          ⭐ {product.rating.toFixed(1)} · {product.reviewCount} reseñas
        </Text>
        <Text style={styles.productPrepTime}>🕒 {product.preparation_hours}h preparación</Text>

        <View style={styles.productFooter}>
          <Text style={styles.productPrice}>{formatCOP(product.basePrice)}</Text>
          <TouchableOpacity
            style={styles.addButton}
            activeOpacity={0.85}
            onPress={onPress}>
            <Feather name="shopping-cart" size={16} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
      </View>
    </TouchableOpacity>
  );
}

interface FeaturedSectionProps {
  products: Product[];
  onAddProduct: (product: Product) => void;
  onPressProduct: (product: Product) => void;
}

function FeaturedSection({ products, onAddProduct, onPressProduct }: FeaturedSectionProps) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Más amados</Text>
      <View style={styles.productList}>
        {products.map((product) => (
          <ProductCard
            key={product.id}
            product={product}
            onAdd={onAddProduct}
            onPress={() => onPressProduct(product)}
          />
        ))}
      </View>
    </View>
  );
}

// ─── Pantalla principal ──────────────────────────────────────────────────────

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const addItem = useCartStore((state) => state.addItem);
  const [profileName, setProfileName] = useState<string | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // ── Auth Listener: sincroniza el nombre del usuario en tiempo real ──────────
  useEffect(() => {
    const fetchProfileName = async (currUser: any) => {
      if (!currUser) {
        setProfileName(null);
        return;
      }

      // 1. Intentar leer de la tabla pública 'profiles'
      const { data } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', currUser.id)
        .single();

      // Si existe un nombre real en la base de datos y no es el genérico 'Cliente'
      if (data?.full_name && data.full_name !== 'Cliente') {
        setProfileName(data.full_name);
      } else {
        // 2. Fallback Inmediato: Extraer de los metadatos nativos de Google (full_name o name)
        const googleName = currUser.user_metadata?.full_name || currUser.user_metadata?.name;
        
        // 3. Segundo Fallback: El prefijo de su correo (ej: 'deisytamayo' si es deisytamayo@gmail.com)
        const emailPrefix = currUser.email ? currUser.email.split('@')[0] : null;

        // Asignamos el primer nombre real que encontremos, capitalizando la inicial
        const finalName = googleName || emailPrefix || 'Cliente';
        setProfileName(finalName);
      }
    };

    // Leer sesión inicial al montar la pantalla (Pasamos el usuario directamente)
    supabase.auth.getSession().then(({ data: { session } }) => {
      fetchProfileName(session?.user ?? null);
    });

    // Escuchar cambios globales: login, logout, OAuth callback
    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      fetchProfileName(session?.user ?? null);
    });

    return () => authListener.subscription.unsubscribe();
  }, []);

  // ── Carga de productos desde Supabase ────────────────────────────────────────
  useEffect(() => {
    async function fetchProducts() {
      try {
        setLoading(true);
        setError(null);

        // Consultamos la tabla products con JOINs a variants y media
        const { data, error: sbError } = await supabase
          .from('products')
          .select(`
            id,
            name,
            slug,
            preparation_hours,
            is_featured,
            rating_avg,
            review_count,
            tags,
            categories (
              name
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

        if (sbError) {
          throw sbError;
        }

        if (!data) {
          setProducts([]);
          return;
        }

        // Mapeamos los datos reales a la interfaz Product
        const mappedProducts = (data as unknown as DBProduct[])
          .map((dbProd): Product | null => {
            // Filtrar variantes activas
            const activeVariants = dbProd.product_variants.filter((v) => v.is_active);
            if (activeVariants.length === 0) {
              return null; // Si no tiene variantes activas, no se puede vender
            }

            // Tomamos el primer registro de variante disponible para mostrar el "precio base"
            const baseVariant = activeVariants[0];

            // Buscar la media de portada (is_cover = true y type = 'image')
            const coverImage = dbProd.product_media.find(
              (m) => m.is_cover && m.type === 'image'
            );

            // Determinar badge dinámicamente
            let badge: ProductBadge | undefined;
            if (dbProd.is_featured) {
              badge = 'TOP';
            }

            return {
              id: dbProd.id,
              variantId: baseVariant.id,
              name: dbProd.name,
              sizeLabel: 'Porción estándar',
              rating: Number(dbProd.rating_avg) || 0,
              reviewCount: dbProd.review_count || 0,
              preparation_hours: dbProd.preparation_hours,
              basePrice: Number(baseVariant.price),
              compareAtPrice: baseVariant.compare_at_price ? Number(baseVariant.compare_at_price) : null,
              imageUrl: coverImage?.url || null,
              badge,
              categoryName: dbProd.categories?.name || null,
              tags: dbProd.tags || [],
            };
          })
          .filter((p): p is Product => p !== null);

        setProducts(mappedProducts);
      } catch (err: any) {
        console.error('Error fetching products from Supabase:', err);
        setError(err.message || 'Error de conexión con la base de datos.');
      } finally {
        setLoading(false);
      }
    }

    fetchProducts();
  }, []);

  // ── Búsqueda reactiva con tolerancia a errores ortográficos (ej: "Thorta" -> "torta") ──
  const filteredProducts = useMemo(() => {
    if (!searchQuery.trim()) return products;

    // Normaliza texto: minúsculas, sin tildes y sin 'h' muda
    const normalize = (str: string) =>
      str
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '') // Elimina acentos
        .replace(/h/g, ''); // Remueve la 'h' para tolerar "Thorta" o "Tortha" -> "torta"

    const target = normalize(searchQuery);
    return products.filter((product) => {
      const haystack = [
        product.name,
        product.sizeLabel,
        product.categoryName || '',
        ...(product.tags || []),
      ]
        .map(normalize)
        .join(' ');

      return haystack.includes(target);
    });
  }, [products, searchQuery]);

  const handleAddProduct = (product: Product) => {
    addItem({
      product_id: product.id,
      variant_id: product.variantId,
      name: product.name,
      size_label: product.sizeLabel,
      base_price: product.basePrice,
      quantity: 1,
      add_ons: [],
      image_url: product.imageUrl || undefined,
    });
  };

  const handlePressProduct = (product: Product) => {
    router.push({
      pathname: "/product/[id]",
      params: { id: product.id }
    });
  };

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 100 },
      ]}
      showsVerticalScrollIndicator={false}>
      <HomeHeader profileName={profileName} searchQuery={searchQuery} onSearchChange={setSearchQuery} />
      <OccasionSection />

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={BRAND.orange} />
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
          <Text style={styles.emptyText}>Por el momento no hay productos disponibles.</Text>
        </View>
      ) : (
        <FeaturedSection
          products={filteredProducts}
          onAddProduct={handleAddProduct}
          onPressProduct={handlePressProduct}
        />
      )}
    </ScrollView>
  );
}

// ─── Estilos ─────────────────────────────────────────────────────────────────

const BRAND = {
  orange: '#FF6B00',
  background: '#F5F7FA',
  surface: '#FFFFFF',
  textPrimary: '#1A1A1A',
  textSecondary: '#8E8E93',
  textMuted: '#3A3A3C',
  border: '#E5E5EA',
  imagePlaceholder: '#EDEEF2',
} as const;

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: BRAND.background,
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: 20,
  },

  // Header
  header: {
    marginBottom: 28,
  },
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  headerCopy: {
    flex: 1,
    paddingRight: 16,
  },
  locationText: {
    fontSize: 13,
    color: BRAND.textSecondary,
    marginBottom: 6,
  },
  greetingText: {
    fontSize: 28,
    fontWeight: '700',
    color: BRAND.textPrimary,
    marginBottom: 4,
  },
  guideQuestion: {
    fontSize: 16,
    color: BRAND.textMuted,
    fontWeight: '500',
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: BRAND.orange,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    fontSize: 20,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  searchInputWrapper: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: BRAND.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: BRAND.border,
    paddingHorizontal: 14,
    height: 48,
  },
  searchIcon: {
    marginRight: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: BRAND.textPrimary,
    paddingVertical: 0,
  },
  filterButton: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: BRAND.orange,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Secciones
  section: {
    marginBottom: 28,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: BRAND.textPrimary,
    marginBottom: 14,
  },

  // Ocasiones
  occasionScroll: {
    gap: 12,
    paddingRight: 4,
  },
  occasionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: BRAND.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: BRAND.border,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginRight: 0,
  },
  occasionEmoji: {
    fontSize: 18,
    marginRight: 8,
  },
  occasionLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: BRAND.textMuted,
  },

  // Productos
  productList: {
    gap: 14,
  },
  productCard: {
    flexDirection: 'row',
    backgroundColor: BRAND.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: BRAND.border,
    padding: 12,
    alignItems: 'stretch',
  },
  productImageWrapper: {
    position: 'relative',
    marginRight: 14,
  },
  productImagePlaceholder: {
    width: 96,
    height: 96,
    borderRadius: 14,
    backgroundColor: BRAND.imagePlaceholder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  productImageEmoji: {
    fontSize: 32,
  },
  productBadge: {
    position: 'absolute',
    top: 6,
    left: 6,
    backgroundColor: BRAND.orange,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  productBadgeNew: {
    backgroundColor: '#34C759',
  },
  productBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  productDetails: {
    flex: 1,
    justifyContent: 'space-between',
    paddingVertical: 2,
  },
  productName: {
    fontSize: 15,
    fontWeight: '700',
    color: BRAND.textPrimary,
    lineHeight: 20,
    marginBottom: 6,
  },
  productRating: {
    fontSize: 13,
    color: BRAND.textSecondary,
    marginBottom: 4,
  },
  productPrepTime: {
    fontSize: 13,
    color: BRAND.textMuted,
    marginBottom: 10,
  },
  productFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  productPrice: {
    fontSize: 17,
    fontWeight: '700',
    color: BRAND.textPrimary,
  },
  addButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: BRAND.orange,
    alignItems: 'center',
    justifyContent: 'center',
  },

  productImage: {
    width: 96,
    height: 96,
    borderRadius: 14,
  },
  loadingContainer: {
    paddingVertical: 60,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 15,
    color: BRAND.textSecondary,
    fontWeight: '500',
  },
  errorContainer: {
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
    textAlign: 'center',
  },
  emptyContainer: {
    paddingVertical: 60,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyEmoji: {
    fontSize: 48,
    marginBottom: 10,
  },
  emptyText: {
    fontSize: 15,
    color: BRAND.textSecondary,
    textAlign: 'center',
    fontWeight: '500',
  },
});
