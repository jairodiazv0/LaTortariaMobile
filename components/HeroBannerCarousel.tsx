import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Dimensions,
  Image,
  Linking,
  NativeScrollEvent,
  NativeSyntheticEvent,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { BRAND } from '@/constants/Colors';

export interface HeroBanner {
  id: string;
  title: string | null;
  description: string | null;
  image_url: string;
  link_url: string | null;
  button_text: string | null;
  priority: number;
  is_active: boolean;
}

interface HeroBannerCarouselProps {
  banners: HeroBanner[];
}

const BANNER_HEIGHT = 220;
const HORIZONTAL_MARGIN = 16;
const AUTOPLAY_MS = 5000;

export default function HeroBannerCarousel({ banners }: HeroBannerCarouselProps) {
  const router = useRouter();
  const scrollRef = useRef<ScrollView>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const slideWidth = Dimensions.get('window').width - HORIZONTAL_MARGIN * 2;

  const goToIndex = useCallback(
    (index: number) => {
      if (banners.length === 0) return;
      const next = ((index % banners.length) + banners.length) % banners.length;
      scrollRef.current?.scrollTo({ x: next * slideWidth, animated: true });
      setActiveIndex(next);
    },
    [banners.length, slideWidth]
  );

  const activeIndexRef = useRef(0);

  useEffect(() => {
    activeIndexRef.current = activeIndex;
  }, [activeIndex]);

  useEffect(() => {
    if (banners.length <= 1) return;
    const interval = setInterval(() => {
      goToIndex(activeIndexRef.current + 1);
    }, AUTOPLAY_MS);
    return () => clearInterval(interval);
  }, [banners.length, goToIndex]);

  const handleScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const index = Math.round(e.nativeEvent.contentOffset.x / slideWidth);
    if (index !== activeIndex && index >= 0 && index < banners.length) {
      setActiveIndex(index);
    }
  };

  const handleBannerAction = (banner: HeroBanner) => {
    if (!banner.link_url) return;
    if (banner.link_url.startsWith('http')) {
      Linking.openURL(banner.link_url).catch(() => {});
      return;
    }
    router.push(banner.link_url as any);
  };

  if (!banners || banners.length === 0) return null;

  return (
    <View style={styles.wrapper}>
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        snapToInterval={slideWidth}
        decelerationRate="fast"
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={handleScroll}
        contentContainerStyle={styles.scrollContent}>
        {banners.map((banner) => (
          <View key={banner.id} style={[styles.slide, { width: slideWidth }]}>
            <Image source={{ uri: banner.image_url }} style={styles.image} resizeMode="cover" />
            <LinearGradient
              colors={['transparent', 'rgba(0,0,0,0.6)']}
              style={styles.overlay}
            />
            <View style={styles.copy}>
              {banner.title ? <Text style={styles.title}>{banner.title}</Text> : null}
              {banner.description ? (
                <Text style={styles.description} numberOfLines={2}>
                  {banner.description}
                </Text>
              ) : null}
              {banner.button_text && banner.link_url ? (
                <TouchableOpacity
                  style={styles.cta}
                  activeOpacity={0.85}
                  onPress={() => handleBannerAction(banner)}>
                  <Text style={styles.ctaText}>{banner.button_text}</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          </View>
        ))}
      </ScrollView>

      {banners.length > 1 ? (
        <View style={styles.dots}>
          {banners.map((banner, index) => (
            <View
              key={banner.id}
              style={[styles.dot, index === activeIndex && styles.dotActive]}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginTop: 12,
    marginHorizontal: HORIZONTAL_MARGIN,
    height: BANNER_HEIGHT,
    borderRadius: 20,
    overflow: 'hidden',
  },
  scrollContent: {
    alignItems: 'stretch',
  },
  slide: {
    height: BANNER_HEIGHT,
    borderRadius: 20,
    overflow: 'hidden',
  },
  image: {
    ...StyleSheet.absoluteFill,
    width: '100%',
    height: '100%',
  },
  overlay: {
    ...StyleSheet.absoluteFill,
  },
  copy: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 28,
    gap: 4,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  description: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.8)',
  },
  cta: {
    alignSelf: 'flex-start',
    marginTop: 8,
    backgroundColor: BRAND.lime,
    borderRadius: 99,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  ctaText: {
    fontSize: 13,
    fontWeight: '700',
    color: BRAND.ink,
  },
  dots: {
    position: 'absolute',
    bottom: 10,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.4)',
  },
  dotActive: {
    width: 20,
    backgroundColor: '#FFFFFF',
  },
});
