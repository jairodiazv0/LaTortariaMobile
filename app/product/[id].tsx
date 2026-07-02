import { Feather } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState, useMemo, useRef } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Image,
  Pressable,
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

interface DBProductVariant {
  id: string;
  product_id: string;
  price: number;
  compare_at_price: number | null;
  is_active: boolean;
  sku: string;
}

interface DBProductMedia {
  id: string;
  product_id: string;
  variant_id: string | null;
  type: string;
  url: string;
  is_cover: boolean;
}

interface DBProduct {
  id: string;
  name: string;
  slug: string;
  preparation_hours: number;
  is_featured: boolean;
  rating_avg: number;
  review_count: number;
  category_id: string;
  short_description?: string;
  long_description?: string;
  product_variants: DBProductVariant[];
  product_media: DBProductMedia[];
}

interface RelatedProduct {
  id: string;
  name: string;
  preparation_hours: number;
  rating_avg: number;
  review_count: number;
  basePrice: number;
  imageUrl: string | null;
}

interface AddOnOption {
  id: string;
  name: string;
  price: number;
}

const COMPLEMENTS: AddOnOption[] = [
  { id: 'velas', name: 'Velas de cumpleaños', price: 3000 },
  { id: 'tarjeta', name: 'Tarjeta dedicatoria', price: 0 },
];

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// ─── Utilidades ──────────────────────────────────────────────────────────────

function formatCOP(price: number): string {
  return `$${price.toLocaleString('es-CO')}`;
}

function getVariantLabel(sku: string, index: number): string {
  const match = sku.match(/(\d+)\s*(p|porciones|por)/i);
  if (match) return `${match[1]} porciones`;
  if (sku.toLowerCase().includes('individual')) return 'Individual';
  if (sku.toLowerCase().includes('mediano')) return 'Mediano';
  if (sku.toLowerCase().includes('grande')) return 'Grande';
  return `Tamaño ${index + 1}`;
}

export default function ProductDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const addItem = useCartStore((state) => state.addItem);

  // Estados de datos
  const [userId, setUserId] = useState<string | null>(null);
  const [product, setProduct] = useState<DBProduct | null>(null);
  const [relatedProducts, setRelatedProducts] = useState<RelatedProduct[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Estados de selección y formulario
  const [selectedVariant, setSelectedVariant] = useState<DBProductVariant | null>(null);
  const [quantity, setQuantity] = useState<number>(1);
  const [customText, setCustomText] = useState<string>('');
  const [cookingInstructions, setCookingInstructions] = useState<string>('');
  const [selectedAddOns, setSelectedAddOns] = useState<AddOnOption[]>([]);
  
  // Estado UI
  const [isCustomizationCollapsed, setIsCustomizationCollapsed] = useState<boolean>(true);
  const [isFavorite, setIsFavorite] = useState<boolean>(false);
  const [activeImageIndex, setActiveImageIndex] = useState<number>(0);
  const imageScrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    if (!id) return;

    async function fetchProductDetails() {
      try {
        setLoading(true);
        setError(null);

        // 0. Verificar sesión activa y estado de favorito para este producto
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          setUserId(session.user.id);

          const { data: favData } = await supabase
            .from('user_interactions')
            .select('id')
            .eq('user_id', session.user.id)
            .eq('product_id', id)
            .eq('interaction_type', 'favorite')
            .maybeSingle();

          if (favData) {
            setIsFavorite(true);
          }
        }

        // 1. Obtener producto detallado
        const { data: prodData, error: prodError } = await supabase
          .from('products')
          .select(`
            id,
            name,
            slug,
            preparation_hours,
            is_featured,
            rating_avg,
            review_count,
            category_id,
            short_description,
            long_description,
            product_variants (
              id,
              price,
              compare_at_price,
              is_active,
              sku
            ),
            product_media (
              id,
              product_id,
              variant_id,
              type,
              url,
              is_cover
            )
          `)
          .eq('id', id)
          .single();

        if (prodError) throw prodError;
        if (!prodData) throw new Error('Producto no encontrado');

        const typedProd = prodData as unknown as DBProduct;
        setProduct(typedProd);

        // Seleccionar variante por defecto (primera variante activa)
        const activeVariants = typedProd.product_variants.filter((v) => v.is_active);
        if (activeVariants.length > 0) {
          setSelectedVariant(activeVariants[0]);
        }

        // 2. Obtener productos recomendados de la misma categoría
        if (typedProd.category_id) {
          const { data: relData, error: relError } = await supabase
            .from('products')
            .select(`
              id,
              name,
              preparation_hours,
              rating_avg,
              review_count,
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
            .eq('category_id', typedProd.category_id)
            .eq('is_active', true)
            .neq('id', typedProd.id)
            .limit(6);

          if (!relError && relData) {
            const mappedRelated: RelatedProduct[] = relData
              .map((rp) => {
                const activeVars = rp.product_variants.filter((v: any) => v.is_active);
                if (activeVars.length === 0) return null;

                const coverImg = rp.product_media.find(
                  (m: any) => m.is_cover && m.type === 'image'
                );

                return {
                  id: rp.id,
                  name: rp.name,
                  preparation_hours: rp.preparation_hours,
                  rating_avg: Number(rp.rating_avg) || 0,
                  review_count: rp.review_count || 0,
                  basePrice: Number(activeVars[0].price),
                  imageUrl: coverImg?.url || null,
                };
              })
              .filter((rp): rp is RelatedProduct => rp !== null);

            setRelatedProducts(mappedRelated);
          }
        }
      } catch (err: any) {
        console.error('Error fetching product detail:', err);
        setError(err.message || 'Error al obtener los detalles del producto.');
      } finally {
        setLoading(false);
      }
    }

    fetchProductDetails();
  }, [id]);

  // Cálculos dinámicos
  const addOnsCost = useMemo(() => {
    return selectedAddOns.reduce((sum, item) => sum + item.price, 0);
  }, [selectedAddOns]);

  const pricePerUnit = useMemo(() => {
    if (!selectedVariant) return 0;
    return Number(selectedVariant.price) + addOnsCost;
  }, [selectedVariant, addOnsCost]);

  const totalPrice = useMemo(() => {
    return pricePerUnit * quantity;
  }, [pricePerUnit, quantity]);

  const handleToggleFavorite = async () => {
    if (!userId) {
      Alert.alert(
        'Inicia sesión',
        'Debes tener una cuenta activa para guardar tus pasteles favoritos.',
        [
          { text: 'Cancelar', style: 'cancel' },
          { text: 'Ir a mi Cuenta', onPress: () => router.push('/profile') },
        ]
      );
      return;
    }

    const nextState = !isFavorite;
    setIsFavorite(nextState); // Actualización optimista instantánea para excelente UX

    try {
      if (nextState) {
        // Guardar en favoritos
        const { error } = await supabase
          .from('user_interactions')
          .insert({
            user_id: userId,
            product_id: id,
            interaction_type: 'favorite',
          });
        if (error) throw error;
      } else {
        // Eliminar de favoritos
        const { error } = await supabase
          .from('user_interactions')
          .delete()
          .eq('user_id', userId)
          .eq('product_id', id)
          .eq('interaction_type', 'favorite');
        if (error) throw error;
      }
    } catch (err: any) {
      setIsFavorite(!nextState); // Revertir el estado visual si la red falla
      console.error('Error actualizando favoritos:', err);
      Alert.alert('Error', 'No pudimos procesar la solicitud en tus favoritos. Intenta nuevamente.');
    }
  };

  const handleToggleAddOn = (addon: AddOnOption) => {
    setSelectedAddOns((prev) =>
      prev.some((item) => item.id === addon.id)
        ? prev.filter((item) => item.id !== addon.id)
        : [...prev, addon]
    );
  };

  const handleAddToCart = () => {
    if (!product || !selectedVariant) return;

    const coverImage = product.product_media.find(m => m.type === 'image' && m.is_cover) 
                    || product.product_media.find(m => m.type === 'image');

    addItem({
      product_id: product.id,
      variant_id: selectedVariant.id,
      name: product.name,
      size_label: getVariantLabel(selectedVariant.sku, 0),
      base_price: Number(selectedVariant.price),
      quantity,
      customization: {
        custom_text: customText || undefined,
        instructions: cookingInstructions || undefined,
      },
      add_ons: selectedAddOns.map((a) => ({
        id: a.id,
        name: a.name,
        price: a.price,
      })),
      image_url: coverImage?.url,
    });

    // Redirigir a la pestaña del carrito
    router.push('/(tabs)/cart');
  };

  if (loading) {
    return (
      <View style={[styles.loadingCenter, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color="#FF6B00" />
        <Text style={styles.loadingText}>Cargando detalles premium...</Text>
      </View>
    );
  }

  if (error || !product) {
    return (
      <View style={[styles.errorCenter, { paddingTop: insets.top }]}>
        <Feather name="alert-circle" size={48} color="#FF3B30" />
        <Text style={styles.errorTitle}>¡Ups! Algo salió mal</Text>
        <Text style={styles.errorText}>{error || 'El producto no está disponible.'}</Text>
        <TouchableOpacity style={styles.backButtonAction} onPress={() => router.back()}>
          <Text style={styles.backButtonActionText}>Volver al Inicio</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Filtrar variantes activas
  const activeVariants = product.product_variants.filter((v) => v.is_active);
  // Obtener imágenes
  const productImages = product.product_media.filter((m) => m.type === 'image');

  return (
    <View style={styles.container}>
      <Stack.Screen 
        options={{ 
          title: product.name, 
          headerShown: true,
          headerStyle: { backgroundColor: '#FAF7F2' },
          headerTintColor: '#2C2018',
          headerTitleStyle: { fontWeight: '700', fontSize: 16 }
        }} 
      />
      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 120 }}
        showsVerticalScrollIndicator={false}>
        
        {/* Cabecera / Galería de fotos */}
        <View style={styles.galleryWrapper}>
          {productImages.length > 0 ? (
            <ScrollView
              ref={imageScrollRef}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              onScroll={(e) => {
                const offsetX = e.nativeEvent.contentOffset.x;
                const index = Math.round(offsetX / SCREEN_WIDTH);
                setActiveImageIndex(index);
              }}
              scrollEventThrottle={16}>
              {productImages.map((img) => (
                <Image
                  key={img.id}
                  source={{ uri: img.url }}
                  style={styles.galleryImage}
                  resizeMode="cover"
                />
              ))}
            </ScrollView>
          ) : (
            <View style={styles.galleryFallback}>
              <Text style={styles.fallbackEmoji}>🍰</Text>
            </View>
          )}

          {/* Indicadores de paginación */}
          {productImages.length > 1 && (
            <View style={styles.paginationDots}>
              {productImages.map((_, i) => (
                <View
                  key={i}
                  style={[
                    styles.paginationDot,
                    activeImageIndex === i && styles.paginationDotActive,
                  ]}
                />
              ))}
            </View>
          )}

          {/* Botones de acción flotantes sobre imagen */}
          <View style={[styles.floatingHeader, { paddingTop: Math.max(insets.top, 16) }]}>
            <TouchableOpacity
              style={styles.floatingButton}
              activeOpacity={0.8}
              onPress={() => router.back()}>
              <Feather name="arrow-left" size={22} color="#1A1A1A" />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.floatingButton}
              activeOpacity={0.8}
              onPress={handleToggleFavorite}>
              <Feather
                name="heart"
                size={22}
                color={isFavorite ? '#FF3B30' : '#1A1A1A'}
                style={isFavorite ? styles.favoritedIcon : null}
              />
            </TouchableOpacity>
          </View>
        </View>

        {productImages.length > 1 && (
          <ScrollView 
            horizontal 
            showsHorizontalScrollIndicator={false} 
            contentContainerStyle={{ gap: 8, paddingHorizontal: 20, marginVertical: 12 }}
          >
            {productImages.map((img, index) => {
              const isSelected = activeImageIndex === index;
              return (
                <TouchableOpacity
                  key={img.id}
                  activeOpacity={0.8}
                  onPress={() => imageScrollRef.current?.scrollTo({ x: index * SCREEN_WIDTH, animated: true })}
                  style={{
                    width: 56,
                    height: 56,
                    borderRadius: 10,
                    borderWidth: 2,
                    borderColor: isSelected ? '#FF6B00' : '#E5E5EA',
                    overflow: 'hidden',
                    backgroundColor: '#FFFFFF'
                  }}
                >
                  <Image source={{ uri: img.url }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}

        {/* Detalles Base */}
        <View style={styles.body}>
          <View style={styles.metaRow}>
            {product.is_featured ? (
              <View style={styles.featuredBadge}>
                <Text style={styles.featuredBadgeText}>✨ LO MÁS VENDIDO</Text>
              </View>
            ) : (
              <View style={styles.ratingBadge}>
                <Text style={styles.ratingText}>
                  ⭐ {Number(product.rating_avg).toFixed(1)} ({product.review_count || 0} reseñas)
                </Text>
              </View>
            )}
            <View style={styles.prepBadge}>
              <Text style={styles.prepBadgeText}>
                🕒 {product.preparation_hours}h preparación
              </Text>
            </View>
          </View>

          <Text style={styles.productName}>{product.name}</Text>

          {/* Descripción */}
          {(product.short_description || product.long_description) && (
            <Text style={styles.productDescription}>
              {product.long_description || product.short_description}
            </Text>
          )}

          {/* Selector de variantes (Tamaños) */}
          {activeVariants.length > 0 && (
            <View style={styles.selectorSection}>
              <Text style={styles.sectionLabel}>Elige el tamaño:</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.variantsScroll}>
                {activeVariants.map((variant, index) => {
                  const isSelected = selectedVariant?.id === variant.id;
                  return (
                    <TouchableOpacity
                      key={variant.id}
                      activeOpacity={0.8}
                      style={[
                        styles.variantChip,
                        isSelected && styles.variantChipSelected,
                      ]}
                      onPress={() => setSelectedVariant(variant)}>
                      <Text
                        style={[
                          styles.variantChipText,
                          isSelected && styles.variantChipTextSelected,
                        ]}>
                        {getVariantLabel(variant.sku, index)}
                      </Text>
                      <Text
                        style={[
                          styles.variantChipPrice,
                          isSelected && styles.variantChipPriceSelected,
                        ]}>
                        {formatCOP(Number(variant.price))}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>
          )}

          {/* Acordeón de Personalización */}
          <View style={styles.accordionContainer}>
            <TouchableOpacity
              style={styles.accordionHeader}
              activeOpacity={0.8}
              onPress={() => setIsCustomizationCollapsed(!isCustomizationCollapsed)}>
              <View style={styles.accordionHeaderTitleRow}>
                <Feather name="edit-3" size={18} color="#FF6B00" style={styles.accordionIcon} />
                <Text style={styles.accordionHeaderTitle}>Personaliza tu Pastel</Text>
              </View>
              <Feather
                name={isCustomizationCollapsed ? 'chevron-down' : 'chevron-up'}
                size={20}
                color="#8E8E93"
              />
            </TouchableOpacity>

            {!isCustomizationCollapsed && (
              <View style={styles.accordionBody}>
                <Text style={styles.inputLabel}>Dedicatoria o mensaje en el pastel</Text>
                <TextInput
                  style={styles.textInput}
                  placeholder="Ej: ¡Feliz Cumpleaños Jairo! 🎉"
                  placeholderTextColor="#8E8E93"
                  value={customText}
                  onChangeText={setCustomText}
                  maxLength={60}
                />
                <Text style={styles.inputHelper}>Máximo 60 caracteres. Se escribirá en la superficie.</Text>

                <Text style={styles.inputLabel}>Instrucciones especiales para repostería</Text>
                <TextInput
                  style={[styles.textInput, styles.textArea]}
                  placeholder="Ej: Por favor colocar las letras en color chocolate blanco..."
                  placeholderTextColor="#8E8E93"
                  value={cookingInstructions}
                  onChangeText={setCookingInstructions}
                  multiline
                  numberOfLines={3}
                  maxLength={200}
                />
              </View>
            )}
          </View>

          {/* Complementos Extra */}
          <View style={styles.complementsSection}>
            <Text style={styles.sectionLabel}>Complementos Extra:</Text>
            {COMPLEMENTS.map((addon) => {
              const isChecked = selectedAddOns.some((item) => item.id === addon.id);
              return (
                <Pressable
                  key={addon.id}
                  style={styles.checkboxRow}
                  onPress={() => handleToggleAddOn(addon)}>
                  <Feather
                    name={isChecked ? 'check-square' : 'square'}
                    size={22}
                    color={isChecked ? '#FF6B00' : '#8E8E93'}
                  />
                  <View style={styles.checkboxLabelContainer}>
                    <Text style={styles.checkboxLabel}>{addon.name}</Text>
                    <Text style={styles.checkboxPrice}>
                      {addon.price > 0 ? `+ ${formatCOP(addon.price)}` : 'Gratis'}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </View>

          {/* Carrusel de Productos Relacionados */}
          {relatedProducts.length > 0 && (
            <View style={styles.relatedSection}>
              <Text style={styles.sectionLabel}>También podría gustarte</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.relatedScroll}>
                {relatedProducts.map((item) => (
                  <TouchableOpacity
                    key={item.id}
                    style={styles.relatedCard}
                    activeOpacity={0.85}
                    onPress={() => router.push({ pathname: "/product/[id]", params: { id: item.id } })}>
                    <View style={styles.relatedImageWrapper}>
                      {item.imageUrl ? (
                        <Image
                          source={{ uri: item.imageUrl }}
                          style={styles.relatedImage}
                          resizeMode="cover"
                        />
                      ) : (
                        <View style={styles.relatedFallback}>
                          <Text style={styles.relatedFallbackEmoji}>🍰</Text>
                        </View>
                      )}
                    </View>
                    <View style={styles.relatedDetails}>
                      <Text style={styles.relatedName} numberOfLines={1}>
                        {item.name}
                      </Text>
                      <Text style={styles.relatedPrice}>{formatCOP(item.basePrice)}</Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}
        </View>
      </ScrollView>

      {/* Barra Inferior Fija de Compra */}
      <View style={[styles.bottomBar, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        <View style={styles.bottomBarContent}>
          
          {/* Selector de cantidad */}
          <View style={styles.quantitySelector}>
            <TouchableOpacity
              style={styles.qtyButton}
              activeOpacity={0.8}
              onPress={() => setQuantity(Math.max(1, quantity - 1))}>
              <Feather name="minus" size={16} color="#1A1A1A" />
            </TouchableOpacity>
            <Text style={styles.qtyText}>{quantity}</Text>
            <TouchableOpacity
              style={styles.qtyButton}
              activeOpacity={0.8}
              onPress={() => setQuantity(quantity + 1)}>
              <Feather name="plus" size={16} color="#1A1A1A" />
            </TouchableOpacity>
          </View>

          {/* Botón de compra */}
          <TouchableOpacity
            style={styles.buyButton}
            activeOpacity={0.85}
            onPress={handleAddToCart}>
            <Text style={styles.buyButtonText}>Agregar</Text>
            <View style={styles.buyButtonDivider} />
            <Text style={styles.buyButtonPrice}>{formatCOP(totalPrice)}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
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
  container: {
    flex: 1,
    backgroundColor: BRAND.background,
  },
  loadingCenter: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: BRAND.background,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 15,
    color: BRAND.textSecondary,
    fontWeight: '500',
  },
  errorCenter: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    backgroundColor: BRAND.background,
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: BRAND.textPrimary,
    marginTop: 16,
    marginBottom: 8,
  },
  errorText: {
    fontSize: 15,
    color: BRAND.textSecondary,
    textAlign: 'center',
    marginBottom: 24,
  },
  backButtonAction: {
    backgroundColor: BRAND.orange,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 12,
  },
  backButtonActionText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 15,
  },

  // Galería de fotos
  galleryWrapper: {
    width: '100%',
    height: 320,
    backgroundColor: BRAND.imagePlaceholder,
    position: 'relative',
  },
  galleryImage: {
    width: SCREEN_WIDTH,
    height: 320,
  },
  galleryFallback: {
    width: SCREEN_WIDTH,
    height: 320,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: BRAND.imagePlaceholder,
  },
  fallbackEmoji: {
    fontSize: 80,
  },
  paginationDots: {
    position: 'absolute',
    bottom: 16,
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
  },
  paginationDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255, 255, 255, 0.4)',
  },
  paginationDotActive: {
    backgroundColor: '#FFFFFF',
    width: 14,
  },
  floatingHeader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
  },
  floatingButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  favoritedIcon: {
    textShadowColor: 'rgba(255, 59, 48, 0.2)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },

  // Detalles de Producto
  body: {
    padding: 20,
  },
  metaRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 12,
  },
  featuredBadge: {
    backgroundColor: '#FFF2E6',
    borderRadius: 8,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: '#FFE0C2',
  },
  featuredBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: BRAND.orange,
    letterSpacing: 0.5,
  },
  ratingBadge: {
    backgroundColor: 'rgba(26, 26, 26, 0.05)',
    borderRadius: 8,
    paddingVertical: 4,
    paddingHorizontal: 10,
  },
  ratingText: {
    fontSize: 12,
    fontWeight: '600',
    color: BRAND.textMuted,
  },
  prepBadge: {
    backgroundColor: '#EEFBF3',
    borderRadius: 8,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: '#D3F5E1',
  },
  prepBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#1E7E34',
  },
  productName: {
    fontSize: 24,
    fontWeight: '800',
    color: BRAND.textPrimary,
    lineHeight: 30,
    marginBottom: 10,
  },
  productDescription: {
    fontSize: 15,
    color: BRAND.textMuted,
    lineHeight: 22,
    marginBottom: 24,
  },

  // Selector de variantes
  selectorSection: {
    marginBottom: 24,
  },
  sectionLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: BRAND.textPrimary,
    marginBottom: 12,
  },
  variantsScroll: {
    gap: 12,
    paddingRight: 10,
  },
  variantChip: {
    backgroundColor: BRAND.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: BRAND.border,
    paddingVertical: 10,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  variantChipSelected: {
    borderColor: BRAND.orange,
    backgroundColor: '#FFF5EE',
  },
  variantChipText: {
    fontSize: 14,
    fontWeight: '600',
    color: BRAND.textMuted,
    marginBottom: 2,
  },
  variantChipTextSelected: {
    color: BRAND.orange,
  },
  variantChipPrice: {
    fontSize: 13,
    color: BRAND.textSecondary,
  },
  variantChipPriceSelected: {
    color: BRAND.orange,
    fontWeight: '700',
  },

  // Acordeón de Personalización
  accordionContainer: {
    backgroundColor: BRAND.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: BRAND.border,
    marginBottom: 24,
    overflow: 'hidden',
  },
  accordionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
  },
  accordionHeaderTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  accordionIcon: {
    marginRight: 8,
  },
  accordionHeaderTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: BRAND.textPrimary,
  },
  accordionBody: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: BRAND.border,
    backgroundColor: '#FAFBFD',
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: BRAND.textMuted,
    marginBottom: 6,
  },
  textInput: {
    backgroundColor: BRAND.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: BRAND.border,
    paddingHorizontal: 12,
    height: 44,
    fontSize: 14,
    color: BRAND.textPrimary,
    marginBottom: 4,
  },
  textArea: {
    height: 80,
    paddingVertical: 10,
    textAlignVertical: 'top',
    marginBottom: 8,
  },
  inputHelper: {
    fontSize: 11,
    color: BRAND.textSecondary,
    marginBottom: 16,
  },

  // Complementos
  complementsSection: {
    marginBottom: 28,
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: BRAND.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: BRAND.border,
    padding: 14,
    marginBottom: 10,
  },
  checkboxLabelContainer: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginLeft: 12,
  },
  checkboxLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: BRAND.textMuted,
  },
  checkboxPrice: {
    fontSize: 14,
    fontWeight: '700',
    color: BRAND.textPrimary,
  },

  // Productos Relacionados
  relatedSection: {
    marginTop: 10,
  },
  relatedScroll: {
    gap: 12,
    paddingRight: 10,
  },
  relatedCard: {
    width: 140,
    backgroundColor: BRAND.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: BRAND.border,
    overflow: 'hidden',
  },
  relatedImageWrapper: {
    width: '100%',
    height: 100,
    backgroundColor: BRAND.imagePlaceholder,
  },
  relatedImage: {
    width: '100%',
    height: 100,
  },
  relatedFallback: {
    width: '100%',
    height: 100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  relatedFallbackEmoji: {
    fontSize: 32,
  },
  relatedDetails: {
    padding: 10,
  },
  relatedName: {
    fontSize: 13,
    fontWeight: '700',
    color: BRAND.textPrimary,
    marginBottom: 2,
  },
  relatedPrice: {
    fontSize: 13,
    fontWeight: '600',
    color: BRAND.orange,
  },

  // Barra Inferior de Compra
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: BRAND.surface,
    borderTopWidth: 1,
    borderTopColor: BRAND.border,
    paddingTop: 16,
    paddingHorizontal: 20,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 8,
  },
  bottomBarContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  quantitySelector: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: BRAND.background,
    borderRadius: 14,
    height: 50,
    borderWidth: 1,
    borderColor: BRAND.border,
    paddingHorizontal: 4,
  },
  qtyButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyText: {
    fontSize: 16,
    fontWeight: '700',
    color: BRAND.textPrimary,
    minWidth: 24,
    textAlign: 'center',
  },
  buyButton: {
    flex: 1,
    backgroundColor: BRAND.orange,
    borderRadius: 14,
    height: 50,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  buyButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  buyButtonDivider: {
    width: 1,
    height: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    marginHorizontal: 12,
  },
  buyButtonPrice: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },
});