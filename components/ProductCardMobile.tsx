import { Feather } from '@expo/vector-icons';
import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { BRAND } from '@/constants/Colors';

export interface ProductCardData {
  id: string;
  name: string;
  short_description?: string;
  image_url?: string | null;
  minPrice: number;
  compare_at_price?: number | null;
  is_healthy?: boolean;
  variantsCount?: number;
}

interface ProductCardMobileProps {
  product: ProductCardData;
  width?: number;
  onPress?: () => void;
}

function formatCOP(price: number): string {
  return `$${price.toLocaleString('es-CO')}`;
}

export function ProductCardMobile({ product, width, onPress }: ProductCardMobileProps) {
  const isMultiVariant = (product.variantsCount ?? 1) > 1;
  const hasOffer =
    product.compare_at_price != null &&
    product.compare_at_price > product.minPrice;

  return (
    <TouchableOpacity
      style={[styles.card, width != null && { width }]}
      activeOpacity={0.9}
      onPress={onPress}>
      <View style={styles.imageWrapper}>
        {product.image_url ? (
          <Image source={{ uri: product.image_url }} style={styles.image} resizeMode="cover" />
        ) : (
          <View style={styles.imagePlaceholder}>
            <Text style={styles.placeholderEmoji}>🍰</Text>
          </View>
        )}

        {product.is_healthy ? (
          <View style={[styles.badge, styles.badgeHealthy]}>
            <Text style={styles.badgeHealthyText}>Saludable</Text>
          </View>
        ) : null}

        {!product.is_healthy && hasOffer ? (
          <View style={[styles.badge, styles.badgeOffer]}>
            <Text style={styles.badgeOfferText}>Oferta</Text>
          </View>
        ) : null}

        {product.is_healthy && hasOffer ? (
          <View style={[styles.badge, styles.badgeOffer, styles.badgeOfferOffset]}>
            <Text style={styles.badgeOfferText}>Oferta</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.body}>
        <Text style={styles.name} numberOfLines={2}>
          {product.name}
        </Text>
        {product.short_description ? (
          <Text style={styles.description} numberOfLines={2}>
            {product.short_description}
          </Text>
        ) : null}

        <View style={styles.footer}>
          <View style={styles.priceBlock}>
            {isMultiVariant ? <Text style={styles.fromLabel}>Desde</Text> : null}
            <Text style={styles.price}>{formatCOP(product.minPrice)}</Text>
          </View>
          <TouchableOpacity
            style={styles.cartButton}
            activeOpacity={0.85}
            onPress={onPress}>
            <Feather name="shopping-cart" size={16} color={BRAND.ink} />
          </TouchableOpacity>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: BRAND.paper,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: BRAND.border,
    overflow: 'hidden',
    shadowColor: BRAND.ink,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 3,
  },
  imageWrapper: {
    position: 'relative',
    width: '100%',
    aspectRatio: 1,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    overflow: 'hidden',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  imagePlaceholder: {
    flex: 1,
    backgroundColor: BRAND.divider,
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholderEmoji: {
    fontSize: 32,
  },
  badge: {
    position: 'absolute',
    top: 8,
    left: 8,
    borderRadius: 99,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  badgeHealthy: {
    backgroundColor: '#D1FAE5',
  },
  badgeHealthyText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#065F46',
    textTransform: 'uppercase',
  },
  badgeOffer: {
    backgroundColor: '#FEF3C7',
  },
  badgeOfferOffset: {
    top: 36,
  },
  badgeOfferText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#92400E',
    textTransform: 'uppercase',
  },
  body: {
    padding: 12,
    gap: 4,
  },
  name: {
    fontSize: 14,
    fontWeight: '700',
    color: BRAND.ink,
  },
  description: {
    fontSize: 12,
    color: BRAND.slate,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: BRAND.divider,
  },
  priceBlock: {
    flex: 1,
  },
  fromLabel: {
    fontSize: 9,
    color: BRAND.slate,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  price: {
    fontSize: 18,
    fontWeight: '700',
    color: BRAND.ink,
  },
  cartButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: BRAND.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
