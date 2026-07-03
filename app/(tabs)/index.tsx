import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState, useRef, useCallback } from 'react';
import {
  ActivityIndicator,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Animated,
  Modal,
  Easing,
  Share,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

import { supabase } from '../../lib/supabase';
import { useCartStore } from '../../store/useCartStore';

// ─── Tipos ───────────────────────────────────────────────────────────────────

type ProductBadge = 'TOP' | 'NUEVO';

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

function CategorySection({
  categories,
  selectedCategoryId,
  onSelectCategory,
}: {
  categories: Category[];
  selectedCategoryId: string | null;
  onSelectCategory: (id: string | null) => void;
}) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Nuestras Especialidades</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.occasionScroll}>

        {/* Chip dinámico para 'Todos' los productos */}
        <TouchableOpacity
          style={[styles.occasionChip, !selectedCategoryId && styles.occasionChipSelected]}
          activeOpacity={0.75}
          onPress={() => onSelectCategory(null)}>
          <Text style={styles.occasionEmoji}>✨</Text>
          <Text style={[styles.occasionLabel, !selectedCategoryId && styles.occasionLabelSelected]}>
            Todo
          </Text>
        </TouchableOpacity>

        {categories.map((cat) => {
          const isSelected = selectedCategoryId === cat.id;
          // Asignar un emoji por defecto o dinámico basado en el slug
          let emoji = '🍰';
          if (cat.slug.includes('cupcake')) emoji = '🧁';
          if (cat.slug.includes('trufa') || cat.slug.includes('chocolate')) emoji = '🍫';
          if (cat.slug.includes('galleta')) emoji = '🍪';

          return (
            <TouchableOpacity
              key={cat.id}
              style={[styles.occasionChip, isSelected && styles.occasionChipSelected]}
              activeOpacity={0.75}
              onPress={() => onSelectCategory(isSelected ? null : cat.id)}>
              <Text style={styles.occasionEmoji}>{emoji}</Text>
              <Text style={[styles.occasionLabel, isSelected && styles.occasionLabelSelected]}>
                {cat.name}
              </Text>
            </TouchableOpacity>
          );
        })}
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
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);


  // ── Estados de la Ruleta de la Dulzura ────────────────────────────────────
  const [showWheelModal, setShowWheelModal] = useState<boolean>(false);
  const [isSpinning, setIsSpinning] = useState<boolean>(false);
  const [hasSpun, setHasSpun] = useState<boolean>(false);
  const [timerSeconds, setTimerSeconds] = useState<number>(900);
  const [shareExpanded, setShareExpanded] = useState<boolean>(false);
  const wheelRotation = useRef(new Animated.Value(0)).current;
  const confettiParticles = useRef(
    Array.from({ length: 24 }, (_, i) => ({
      x: new Animated.Value(0),
      y: new Animated.Value(0),
      opacity: new Animated.Value(0),
      rotate: new Animated.Value(0),
      color: ['#FF6B00', '#FFD700', '#FF3B9A', '#00C2FF', '#7B61FF', '#FF6B6B', '#4ECDC4', '#45B7D1'][i % 8],
    }))
  ).current;
  const pointerBounce = useRef(new Animated.Value(1)).current;
  const timerOpacity = useRef(new Animated.Value(1)).current;

  const [welcomeCoupon, setWelcomeCoupon] = useState<{ code: string; benefit: number; min_order_amount: number } | null>(null);
  const [currentUser, setCurrentUser] = useState<any>(null);

  const handleCloseWheelModal = useCallback(() => {
    setShowWheelModal(false);
  }, []);

  useEffect(() => {
    if (!hasSpun) return;
    if (timerSeconds <= 0) return;
    const interval = setInterval(() => {
      setTimerSeconds((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [hasSpun, timerSeconds]);

  useEffect(() => {
    if (!hasSpun) return;
    const blink = Animated.loop(
      Animated.sequence([
        Animated.timing(timerOpacity, { toValue: 0.3, duration: 500, useNativeDriver: true }),
        Animated.timing(timerOpacity, { toValue: 1, duration: 500, useNativeDriver: true }),
      ])
    );
    blink.start();
    return () => blink.stop();
  }, [hasSpun, timerOpacity]);

  useEffect(() => {
    const fetchWelcomeCoupon = async () => {
      try {
        const { data, error } = await supabase
          .from('coupons')
          .select('code, discount_value, min_order_amount, is_active')
          .eq('code', 'WELCOME_2026')
          .eq('is_active', true)
          .single();
        if (!error && data) {
          setWelcomeCoupon({
            code: data.code,
            benefit: Number(data.discount_value),
            min_order_amount: Number(data.min_order_amount),
          });
        }
      } catch (e) { }
    };
    fetchWelcomeCoupon();
  }, []);

  const formatTimer = useCallback((secs: number): string => {
    const m = Math.floor(secs / 60).toString().padStart(2, '0');
    const s = (secs % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  }, []);

  const launchConfetti = useCallback(() => {
    const animations = confettiParticles.map((p, i) => {
      const angle = (i / confettiParticles.length) * 2 * Math.PI;
      const radius = 120 + Math.random() * 80;
      p.x.setValue(0);
      p.y.setValue(0);
      p.opacity.setValue(1);
      p.rotate.setValue(0);
      return Animated.parallel([
        Animated.timing(p.x, {
          toValue: Math.cos(angle) * radius,
          duration: 900 + Math.random() * 400,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(p.y, {
          toValue: Math.sin(angle) * radius - 60,
          duration: 900 + Math.random() * 400,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(p.opacity, {
          toValue: 0,
          duration: 1200,
          delay: 400,
          useNativeDriver: true,
        }),
        Animated.timing(p.rotate, {
          toValue: Math.random() * 720 - 360,
          duration: 1200,
          useNativeDriver: true,
        }),
      ]);
    });
    Animated.stagger(20, animations).start();
  }, [confettiParticles]);

  const handleSpin = useCallback(() => {
    if (isSpinning || hasSpun) return;
    setIsSpinning(true);

    const pointerAnim = Animated.loop(
      Animated.sequence([
        Animated.timing(pointerBounce, { toValue: 1.3, duration: 120, useNativeDriver: true }),
        Animated.timing(pointerBounce, { toValue: 1, duration: 120, useNativeDriver: true }),
      ])
    );
    pointerAnim.start();

    // Cálculo determinístico: SIEMPRE debe detenerse en WHEEL_PRIZE_INDEX
    // (el bono real parametrizado en BD), con una micro-variación aleatoria
    // dentro del propio segmento para que cada giro se sienta orgánico,
    // sin riesgo de caer en el borde de la porción vecina.
    const prizeCenterAngle = WHEEL_PRIZE_INDEX * WHEEL_SLICE_ANGLE + WHEEL_SLICE_ANGLE / 2;
    const safeMargin = WHEEL_SLICE_ANGLE / 2 - 10; // deja 10° de margen a cada lado
    const randomOffset = (Math.random() * 2 - 1) * safeMargin;
    const baseRotation = (360 - prizeCenterAngle + randomOffset + 360) % 360;
    const EXTRA_FULL_SPINS = 5;
    const totalRotation = EXTRA_FULL_SPINS * 360 + baseRotation;

    wheelRotation.setValue(0);
    Animated.timing(wheelRotation, {
      toValue: totalRotation,
      duration: 4500,
      easing: Easing.bezier(0.17, 0.67, 0.12, 1.0),
      useNativeDriver: true,
    }).start(() => {
      pointerAnim.stop();
      pointerBounce.setValue(1);
      setIsSpinning(false);
      setHasSpun(true);
      launchConfetti();
      setTimeout(launchConfetti, 600);
    });
  }, [isSpinning, hasSpun, wheelRotation, pointerBounce, launchConfetti]);

  const handleShareWhatsApp = useCallback(async () => {
    const refId = currentUser?.id ?? 'guest';
    const deepLink = `latortariamobile://register?ref=${refId}`;
    const message =
      `🎂✨ ¡Oye! Te estoy invitando a La Tortaria para que pruebes los pasteles más ricos de la ciudad.

` +
      `👉 Regístrate con mi enlace y los dos ganamos: tú obtienes un GIRO GRATIS de la Ruleta de la Dulzura y yo desbloqueo un 6-pack de Cupcakes de regalo. 🧁🎁

` +
      `🔗 ${deepLink}`;
    try {
      await Share.share({ message });
    } catch (_) { }
  }, [currentUser]);

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
      const user = session?.user ?? null;
      fetchProfileName(user);
      setCurrentUser(user);

      // ── Disparador automático de la Ruleta (solo invitados, y solo tras
      // confirmar que no hay sesión activa; nunca antes de saberlo) ──────────
      if (!user) {
        setShowWheelModal(true);
      }
    });

    // Escuchar cambios globales: login, logout, OAuth callback
    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      const user = session?.user ?? null;
      fetchProfileName(user);
      setCurrentUser(user);

      // Si el usuario se autentica mientras la ruleta está abierta (ej. tras
      // registrarse desde el propio modal), la cerramos de inmediato.
      if (user) {
        setShowWheelModal(false);
      }
    });

    return () => authListener.subscription.unsubscribe();
  }, []);

  // ── Carga de categorías raíz (parent_id NULL) para la fila de Especialidades ──
  useEffect(() => {
    async function fetchCategories() {
      try {
        const { data } = await supabase
          .from('categories')
          .select('id, name, slug')
          .eq('is_active', true)
          .is('parent_id', null) // 🛡️ Regla UX: Solo categorías raíz
          .order('sort_order', { ascending: true });
        if (data) setCategories(data);
      } catch (err) {
        console.error('Error cargando categorías:', err);
      }
    }
    fetchCategories();
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

  // ── Búsqueda reactiva + filtro por especialidad seleccionada ─────────────────
  const filteredProducts = useMemo(() => {
    // Primero filtramos por categoría de base de datos si hay una seleccionada
    let baseList = products;
    if (selectedCategoryId) {
      const currentCat = categories.find((c) => c.id === selectedCategoryId);
      baseList = products.filter((p) => p.categoryName === currentCat?.name);
    }

    if (!searchQuery.trim()) return baseList;

    // Normaliza texto: minúsculas, sin tildes y sin 'h' muda
    const normalize = (str: string) =>
      str
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '') // Elimina acentos
        .replace(/h/g, ''); // Remueve la 'h' para tolerar "Thorta" o "Tortha" -> "torta"

    const target = normalize(searchQuery);
    return baseList.filter((product) => {
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
  }, [products, searchQuery, selectedCategoryId, categories]);

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
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 100 },
        ]}
        showsVerticalScrollIndicator={false}>
        <HomeHeader profileName={profileName} searchQuery={searchQuery} onSearchChange={setSearchQuery} />
        <CategorySection
          categories={categories}
          selectedCategoryId={selectedCategoryId}
          onSelectCategory={setSelectedCategoryId}
        />

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

      {/* ══════════════════════════════════════════════════════════════════
          MODAL: LA RULETA DE LA DULZURA (Renderizado en la raíz para centrado absoluto)
      ══════════════════════════════════════════════════════════════════ */}
      <Modal
        visible={showWheelModal}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => { if (!isSpinning) handleCloseWheelModal(); }}>
        <View style={styles.modalOverlay}>
          <ScrollView
            style={styles.modalScrollView}
            contentContainerStyle={styles.modalScrollContent}
            showsVerticalScrollIndicator={false}>
            <View style={styles.modalCard}>
              {!isSpinning && (
                <TouchableOpacity
                  style={styles.modalCloseBtn}
                  onPress={handleCloseWheelModal}>
                  <Feather name="x" size={20} color={BRAND.inkMid} />
                </TouchableOpacity>
              )}
              {!hasSpun && (
                <>
                  <View style={styles.confettiLayer} pointerEvents="none">
                    {confettiParticles.map((p, i) => (
                      <Animated.View
                        key={i}
                        style={[
                          styles.confettiDot,
                          { backgroundColor: p.color },
                          {
                            opacity: p.opacity,
                            transform: [
                              { translateX: p.x },
                              { translateY: p.y },
                              { rotate: p.rotate.interpolate({ inputRange: [-720, 720], outputRange: ['-720deg', '720deg'] }) },
                            ],
                          },
                        ]}
                      />
                    ))}
                  </View>
                  <Text style={styles.modalTitle}>🎉 ¡Tienes (1) Giro Gratis de Bienvenida! 🎉</Text>
                  <Text style={styles.modalSubtitle}>
                    Descubre el regalo exclusivo que la Tortaria tiene para tu primer antojo.
                  </Text>
                  <View style={styles.wheelContainer}>
                    <Animated.View
                      style={[styles.wheelPointer, { transform: [{ scale: pointerBounce }] }]}>
                      <View style={styles.wheelPointerTriangle} />
                    </Animated.View>
                    <Animated.View
                      style={[
                        styles.wheelDisc,
                        {
                          transform: [
                            {
                              rotate: wheelRotation.interpolate({
                                inputRange: [0, 360],
                                outputRange: ['0deg', '360deg'],
                                extrapolate: 'extend',
                              }),
                            },
                          ],
                        },
                      ]}>
                      <Svg width={WHEEL_SIZE} height={WHEEL_SIZE} viewBox={`0 0 ${WHEEL_SIZE} ${WHEEL_SIZE}`}>
                        {WHEEL_SEGMENTS.map((seg, i) => (
                          <Path
                            key={i}
                            d={describeWheelSlice(
                              WHEEL_RADIUS,
                              WHEEL_RADIUS,
                              WHEEL_RADIUS,
                              i * WHEEL_SLICE_ANGLE,
                              (i + 1) * WHEEL_SLICE_ANGLE
                            )}
                            fill={seg.color}
                            stroke="#FFFFFF"
                            strokeWidth={2}
                          />
                        ))}
                      </Svg>
                      {WHEEL_SEGMENTS.map((seg, i) => {
                        const midAngle = i * WHEEL_SLICE_ANGLE + WHEEL_SLICE_ANGLE / 2;
                        return (
                          <View
                            key={i}
                            style={[StyleSheet.absoluteFill, { transform: [{ rotate: `${midAngle}deg` }] }]}
                            pointerEvents="none">
                            <View style={styles.wheelSegmentLabelWrapper}>
                              <Text style={[styles.wheelSegmentText, { color: seg.textColor }]} numberOfLines={3}>
                                {seg.label}
                              </Text>
                            </View>
                          </View>
                        );
                      })}
                      <View style={styles.wheelCenter}>
                        <Text style={styles.wheelCenterEmoji}>🎂</Text>
                      </View>
                    </Animated.View>
                  </View>
                  <TouchableOpacity
                    style={[styles.spinButton, isSpinning && styles.spinButtonDisabled]}
                    activeOpacity={0.85}
                    onPress={handleSpin}
                    disabled={isSpinning}>
                    <Text style={styles.spinButtonText}>
                      {isSpinning ? '¡GIRANDO...! 🌪' : '¡GIRAR AHORA GRATIS! 🎰'}
                    </Text>
                  </TouchableOpacity>
                  <Text style={styles.modalDisclaimer}>
                    Solo disponible para nuevos usuarios · Sin costo · Sin trampas
                  </Text>
                </>
              )}
              {hasSpun && (
                <>
                  <View style={styles.confettiLayer} pointerEvents="none">
                    {confettiParticles.map((p, i) => (
                      <Animated.View
                        key={i}
                        style={[
                          styles.confettiDot,
                          { backgroundColor: p.color },
                          {
                            opacity: p.opacity,
                            transform: [
                              { translateX: p.x },
                              { translateY: p.y },
                              { rotate: p.rotate.interpolate({ inputRange: [-720, 720], outputRange: ['-720deg', '720deg'] }) },
                            ],
                          },
                        ]}
                      />
                    ))}
                  </View>
                  <Text style={styles.winnerTrophy}>🏆</Text>
                  <Text style={styles.winnerTitle}>¡DIOS MÍO!</Text>
                  <Text style={styles.winnerSubtitle}>
                    ¡Tienes una suerte increíble! Acabas de ganar el Bono Oro de{' '}
                    <Text style={styles.winnerAmount}>
                      {welcomeCoupon ? formatCOP(welcomeCoupon.benefit) : '$15.000'}
                    </Text>
                  </Text>
                  <View style={styles.couponCodeBox}>
                    <Text style={styles.couponCodeLabel}>Tu código secreto:</Text>
                    <Text style={styles.couponCode}>
                      {welcomeCoupon?.code ?? 'WELCOME_2026'}
                    </Text>
                  </View>
                  <View style={styles.timerBox}>
                    <Animated.Text style={[styles.timerText, { opacity: timerOpacity }]}>
                      ⏰ {formatTimer(timerSeconds)}
                    </Animated.Text>
                    <Text style={styles.timerCaption}>
                      Tu premio expira en {formatTimer(timerSeconds)}. Regístrate ahora para{' '}
                      <Text style={styles.timerHighlight}>congelar y asegurar este bono</Text>{' '}
                      en tu cuenta antes de que regrese a la cocina.
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={styles.freezeButton}
                    activeOpacity={0.85}
                    onPress={() => {
                      setShowWheelModal(false);
                      router.push('/(tabs)/profile');
                    }}>
                    <Text style={styles.freezeButtonText}>❄️ Congelar mi Premio y Registrarme</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.viralToggle}
                    onPress={() => setShareExpanded((v) => !v)}
                    activeOpacity={0.8}>
                    <Text style={styles.viralToggleText}>
                      ¿Quieres un premio más grande? 🎁 ¡Multiplica tu suerte!
                    </Text>
                    <Feather
                      name={shareExpanded ? 'chevron-up' : 'chevron-down'}
                      size={16}
                      color={BRAND.rose}
                    />
                  </TouchableOpacity>
                  {shareExpanded && (
                    <View style={styles.viralExpanded}>
                      <Text style={styles.viralBody}>
                        Comparte tu <Text style={styles.viralHighlight}>Enlace de la Dulzura</Text> personalizado por WhatsApp.{' '}
                        Cuando ellos se registren: ¡Ellos ganan un giro gratis y tú desbloqueas un{' '}
                        <Text style={styles.viralHighlight}>6-pack de Cupcakes 🧁 de regalo</Text>{' '}
                        en tu próxima compra!
                      </Text>
                      <TouchableOpacity
                        style={styles.whatsappButton}
                        activeOpacity={0.85}
                        onPress={handleShareWhatsApp}>
                        <Text style={styles.whatsappButtonText}>💬 Compartir por WhatsApp</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </>
              )}
            </View>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

// ─── Estilos ─────────────────────────────────────────────────────────────────


// ─── Segmentos de la ruleta (paleta de marca oficial) ────────────────────────
// Mezcla de "premios" con alto valor percibido (productos gratis + bonos).
// El resultado real SIEMPRE es el bono parametrizado en BD (WELCOME_2026);
// el índice WHEEL_PRIZE_INDEX marca qué porción debe ganar el usuario.
const WHEEL_SEGMENTS = [
  { label: '🍰\nCheesecake\nentero', color: '#2D6A4F', textColor: '#FFFFFF' },
  { label: '🎂\nTorta\nPremium', color: '#A85A42', textColor: '#FFFFFF' },
  { label: '🍪\nCaja\nGourmet', color: '#FAF7F2', textColor: '#6B5744' },
  { label: '💰\nBono\n$50.000', color: '#D9A441', textColor: '#FFFFFF' },
  { label: '🧁\nDocena de\nCupcakes', color: '#6B5744', textColor: '#FFFFFF' },
  { label: '🎁\nBono\n$15.000', color: '#C8745A', textColor: '#FFFFFF' },
] as const;

// Índice de la porción que SIEMPRE gana (el bono real parametrizado en BD).
// Si cambias el orden de WHEEL_SEGMENTS, actualiza este índice para que
// siga apuntando a "🎁 Bono $15.000".
const WHEEL_PRIZE_INDEX = 5;

// Geometría del disco SVG
const WHEEL_SIZE = 230;
const WHEEL_RADIUS = WHEEL_SIZE / 2;
const WHEEL_SLICE_ANGLE = 360 / WHEEL_SEGMENTS.length;

/** Convierte un ángulo (medido en sentido horario desde las 12 en punto) a coordenadas x,y sobre el círculo. */
function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const angleRad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(angleRad), y: cy + r * Math.sin(angleRad) };
}

/** Construye el path SVG de una porción de pastel (pie slice) entre dos ángulos. */
function describeWheelSlice(cx: number, cy: number, r: number, startAngle: number, endAngle: number): string {
  const start = polarToCartesian(cx, cy, r, endAngle);
  const end = polarToCartesian(cx, cy, r, startAngle);
  const largeArcFlag = endAngle - startAngle <= 180 ? '0' : '1';
  return `M ${cx} ${cy} L ${start.x} ${start.y} A ${r} ${r} 0 ${largeArcFlag} 0 ${end.x} ${end.y} Z`;
}

const BRAND = {
  orange: '#FF6B00',
  background: '#F5F7FA',
  surface: '#FFFFFF',
  textPrimary: '#1A1A1A',
  textSecondary: '#8E8E93',
  textMuted: '#3A3A3C',
  border: '#E5E5EA',
  imagePlaceholder: '#EDEEF2',

  cream: '#FAF7F2',
  rose: '#C8745A',
  roseDark: '#A85A42',
  roseLight: '#F5E6DF',
  ink: '#2C2018',
  inkMid: '#6B5744',
  inkLight: '#A8917E',
  divider: '#EDE4D8',
  white: '#FFFFFF',
  statusPaid: '#2D6A4F',
  statusPaidBg: '#D8F3DC',
  red: '#B5451B',
  redBg: '#FDEBD0',
  radius: 14,
  radiusSm: 8,
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
  occasionChipSelected: {
    borderColor: BRAND.orange,
    backgroundColor: '#FFF5EE',
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
  occasionLabelSelected: {
    color: BRAND.orange,
    fontWeight: '700',
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

  // ── Modal Overlay ─────────────────────────────────────────────────────────
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(44,32,24,0.78)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  modalScrollView: {
    width: '100%',
  },
  modalScrollContent: {
    flexGrow: 1,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 24,
  },
  modalCard: {
    backgroundColor: BRAND.white,
    borderRadius: 28,
    paddingHorizontal: 22,
    paddingTop: 24,
    paddingBottom: 20,
    width: '100%',
    maxWidth: 400,
    alignItems: 'center',
    shadowColor: BRAND.ink,
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.4,
    shadowRadius: 28,
    elevation: 24,
  },
  modalCloseBtn: {
    position: 'absolute',
    top: 14,
    right: 14,
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: BRAND.divider,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '900',
    color: BRAND.rose,
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 6,
    letterSpacing: -0.3,
    lineHeight: 24,
  },
  modalSubtitle: {
    fontSize: 13,
    color: BRAND.inkMid,
    textAlign: 'center',
    marginBottom: 18,
    lineHeight: 18,
    paddingHorizontal: 8,
  },
  modalDisclaimer: {
    fontSize: 10,
    color: BRAND.inkLight,
    textAlign: 'center',
    marginTop: 10,
  },

  // ── Ruleta gráfica ────────────────────────────────────────────────────────
  wheelContainer: {
    width: 240,
    height: 260,
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginBottom: 16,
  },
  wheelPointer: {
    position: 'absolute',
    top: 0,
    zIndex: 10,
    alignItems: 'center',
  },
  wheelPointerTriangle: {
    width: 0,
    height: 0,
    borderLeftWidth: 12,
    borderRightWidth: 12,
    borderTopWidth: 24,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: BRAND.rose,
    shadowColor: BRAND.rose,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.6,
    shadowRadius: 6,
    elevation: 4,
  },
  wheelDisc: {
    width: 230,
    height: 230,
    borderRadius: 115,
    overflow: 'hidden',
    position: 'relative',
    borderWidth: 4,
    borderColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 10,
  },
  wheelSegmentLabelWrapper: {
    alignItems: 'center',
    alignSelf: 'center',
    marginTop: 34,
    width: 68,
  },
  wheelSegmentText: {
    fontSize: 9,
    fontWeight: '900',
    color: '#FFFFFF',
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.4)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
    lineHeight: 11,
  },
  wheelCenter: {
    position: 'absolute',
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    top: '50%',
    left: '50%',
    marginTop: -26,
    marginLeft: -26,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 6,
    zIndex: 5,
  },
  wheelCenterEmoji: {
    fontSize: 26,
  },

  // ── Botón Girar ───────────────────────────────────────────────────────────
  spinButton: {
    backgroundColor: BRAND.rose,
    borderRadius: BRAND.radius,
    paddingVertical: 16,
    paddingHorizontal: 24,
    width: '100%',
    alignItems: 'center',
    shadowColor: BRAND.rose,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.45,
    shadowRadius: 12,
    elevation: 8,
  },
  spinButtonDisabled: {
    backgroundColor: BRAND.inkLight,
    shadowOpacity: 0.1,
  },
  spinButtonText: {
    color: BRAND.white,
    fontSize: 17,
    fontWeight: '900',
    letterSpacing: 0.5,
  },

  // ── Confeti ───────────────────────────────────────────────────────────────
  confettiLayer: {
    position: 'absolute',
    top: '40%',
    left: '50%',
    zIndex: 20,
    pointerEvents: 'none',
  },
  confettiDot: {
    position: 'absolute',
    width: 10,
    height: 10,
    borderRadius: 3,
  },

  // ── Estado Ganador ────────────────────────────────────────────────────────
  winnerTrophy: {
    fontSize: 52,
    marginTop: 4,
    marginBottom: 2,
  },
  winnerTitle: {
    fontSize: 26,
    fontWeight: '900',
    color: BRAND.rose,
    letterSpacing: -0.5,
    marginBottom: 4,
  },
  winnerSubtitle: {
    fontSize: 13,
    color: BRAND.inkMid,
    textAlign: 'center',
    lineHeight: 19,
    marginBottom: 14,
    paddingHorizontal: 4,
  },
  winnerAmount: {
    fontSize: 16,
    fontWeight: '900',
    color: BRAND.statusPaid,
  },
  couponCodeBox: {
    backgroundColor: BRAND.roseLight,
    borderRadius: BRAND.radius,
    borderWidth: 1.5,
    borderColor: '#E8C4B0',
    paddingVertical: 10,
    paddingHorizontal: 18,
    alignItems: 'center',
    marginBottom: 14,
    width: '100%',
  },
  couponCodeLabel: {
    fontSize: 10,
    color: BRAND.inkLight,
    fontWeight: '600',
    marginBottom: 3,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  couponCode: {
    fontSize: 20,
    fontWeight: '900',
    color: BRAND.rose,
    letterSpacing: 2,
  },

  // ── Timer FOMO ────────────────────────────────────────────────────────────
  timerBox: {
    backgroundColor: BRAND.redBg,
    borderRadius: BRAND.radius,
    borderWidth: 1.5,
    borderColor: '#F5C6A0',
    padding: 12,
    alignItems: 'center',
    marginBottom: 14,
    width: '100%',
  },
  timerText: {
    fontSize: 34,
    fontWeight: '900',
    color: BRAND.red,
    letterSpacing: 2,
    marginBottom: 4,
  },
  timerCaption: {
    fontSize: 11,
    color: BRAND.inkMid,
    textAlign: 'center',
    lineHeight: 16,
  },
  timerHighlight: {
    fontWeight: '800',
    color: BRAND.red,
  },

  // ── Botón Congelar Premio ─────────────────────────────────────────────────
  freezeButton: {
    backgroundColor: BRAND.statusPaid,
    borderRadius: BRAND.radius,
    paddingVertical: 15,
    paddingHorizontal: 24,
    width: '100%',
    alignItems: 'center',
    shadowColor: BRAND.statusPaid,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
    marginBottom: 12,
  },
  freezeButtonText: {
    color: BRAND.white,
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: 0.3,
  },

  // ── Multiplicador viral ───────────────────────────────────────────────────
  viralToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: BRAND.statusPaidBg,
    borderRadius: BRAND.radius,
    borderWidth: 1,
    borderColor: '#B7DEC5',
    padding: 12,
    width: '100%',
    marginBottom: 2,
  },
  viralToggleText: {
    fontSize: 12,
    fontWeight: '700',
    color: BRAND.statusPaid,
    flex: 1,
    marginRight: 8,
  },
  viralExpanded: {
    backgroundColor: BRAND.statusPaidBg,
    borderRadius: BRAND.radius,
    borderWidth: 1,
    borderColor: '#B7DEC5',
    borderTopWidth: 0,
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
    padding: 12,
    width: '100%',
    marginBottom: 4,
  },
  viralBody: {
    fontSize: 11,
    color: BRAND.inkMid,
    lineHeight: 17,
    marginBottom: 12,
    textAlign: 'center',
  },
  viralHighlight: {
    fontWeight: '800',
    color: BRAND.statusPaid,
  },
  whatsappButton: {
    backgroundColor: '#25D366',
    borderRadius: BRAND.radius,
    paddingVertical: 12,
    paddingHorizontal: 20,
    alignItems: 'center',
    shadowColor: '#128C7E',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 5,
  },
  whatsappButtonText: {
    color: BRAND.white,
    fontSize: 15,
    fontWeight: '800',
  },

});