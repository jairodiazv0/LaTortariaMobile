/**
 * useTrendingProducts
 *
 * Hook compartido que encapsula la lógica completa de carga de productos
 * en tendencia, incluyendo el patrón RPC → fallback por interacciones →
 * fallback por is_featured, extraído de explore.tsx para que search.tsx
 * pueda reutilizarlo sin duplicar código.
 */

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

// ─── Tipos de BD ─────────────────────────────────────────────────────────────

export interface TrendingDBProductVariant {
  id: string;
  price: number;
  compare_at_price: number | null;
  is_active: boolean;
}

export interface TrendingDBProductMedia {
  url: string;
  type: string;
  is_cover: boolean;
}

export interface TrendingDBCategory {
  name: string;
  slug: string;
}

export interface TrendingDBProduct {
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
  categories: TrendingDBCategory | null;
  product_variants: TrendingDBProductVariant[];
  product_media: TrendingDBProductMedia[];
}

// ─── Tipo público ─────────────────────────────────────────────────────────────

export interface TrendingProduct {
  id: string;
  variantId: string;
  name: string;
  minPrice: number;
  compareAtPrice?: number | null;
  imageUrl?: string | null;
  rating: number;
  reviewCount: number;
  shortDescription?: string;
  isHealthy?: boolean;
  isFeatured?: boolean;
  variantsCount?: number;
  created_at?: string;
  tags: string[];
}

// ─── Helper de mapeo ─────────────────────────────────────────────────────────

export function mapTrendingDBProduct(dbProd: TrendingDBProduct): TrendingProduct | null {
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
    rating: Number(dbProd.rating_avg) || 0,
    reviewCount: dbProd.review_count || 0,
    shortDescription: dbProd.short_description || '',
    isHealthy: dbProd.is_healthy || false,
    isFeatured: dbProd.is_featured || false,
    variantsCount: activeVariants.length,
    created_at: dbProd.created_at,
    tags: dbProd.tags || [],
  };
}

// ─── Selector de campos (reutilizado en todas las queries) ───────────────────

const PRODUCT_SELECT = `
  id, name, slug, category_id, short_description, is_healthy,
  preparation_hours, is_featured, rating_avg, review_count,
  tags, created_at,
  categories (name, slug),
  product_variants (id, price, compare_at_price, is_active),
  product_media (url, type, is_cover)
`;

// ─── Hook ─────────────────────────────────────────────────────────────────────

interface UseTrendingProductsResult {
  trendingProducts: TrendingProduct[];
  trendingInteractionsCount: { [id: string]: number };
  loadingTrending: boolean;
  errorTrending: boolean;
}

export function useTrendingProducts(): UseTrendingProductsResult {
  const [trendingProducts, setTrendingProducts] = useState<TrendingProduct[]>([]);
  const [trendingInteractionsCount, setTrendingInteractionsCount] = useState<{
    [id: string]: number;
  }>({});
  const [loadingTrending, setLoadingTrending] = useState<boolean>(true);
  const [errorTrending, setErrorTrending] = useState<boolean>(false);

  useEffect(() => {
    let cancelled = false;

    async function fetchTrendingByIds(ids: string[]) {
      const { data, error } = await supabase
        .from('products')
        .select(PRODUCT_SELECT)
        .in('id', ids)
        .eq('is_active', true);

      if (error || !data) {
        await fetchTrendingFallback();
        return;
      }

      const mapped = (data as unknown as TrendingDBProduct[])
        .map(mapTrendingDBProduct)
        .filter((p): p is TrendingProduct => p !== null);

      mapped.sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id));

      if (!cancelled) {
        setTrendingProducts(mapped);
        setLoadingTrending(false);
      }
    }

    async function fetchTrendingFallback() {
      const { data, error } = await supabase
        .from('products')
        .select(PRODUCT_SELECT)
        .eq('is_active', true)
        .eq('is_featured', true)
        .order('rating_avg', { ascending: false })
        .limit(8);

      if (!cancelled) {
        if (error || !data) {
          setTrendingProducts([]);
        } else {
          const mapped = (data as unknown as TrendingDBProduct[])
            .map(mapTrendingDBProduct)
            .filter((p): p is TrendingProduct => p !== null);
          setTrendingProducts(mapped);
        }
        setLoadingTrending(false);
      }
    }

    async function fetchTrending() {
      try {
        setLoadingTrending(true);
        setErrorTrending(false);

        // 1. Intentar RPC
        const { data: rpcData, error: rpcError } = await supabase.rpc('get_trending_products');
        if (!rpcError && rpcData && rpcData.length > 0) {
          const topIds = (rpcData as Array<{ id: string }>).map((p) => p.id).slice(0, 8);
          await fetchTrendingByIds(topIds);
          return;
        }

        // 2. Fallback: calcular scores desde user_interactions (últimos 7 días)
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
        const { data: interactions, error: intError } = await supabase
          .from('user_interactions')
          .select('product_id, interaction_type, created_at')
          .gte('created_at', sevenDaysAgo);

        if (intError || !interactions || interactions.length === 0) {
          await fetchTrendingFallback();
          return;
        }

        const scores: { [id: string]: number } = {};
        const todayInteractionsCount: { [id: string]: number } = {};
        const todayStr = new Date().toDateString();

        interactions.forEach((int) => {
          const pid = int.product_id;
          if (!pid) return;

          let points = 1;
          if (int.interaction_type === 'purchase') points = 3;
          else if (int.interaction_type === 'cart_add') points = 2;
          scores[pid] = (scores[pid] || 0) + points;

          if (int.created_at && new Date(int.created_at).toDateString() === todayStr) {
            todayInteractionsCount[pid] = (todayInteractionsCount[pid] || 0) + 1;
          }
        });

        if (!cancelled) setTrendingInteractionsCount(todayInteractionsCount);

        const topIds = Object.keys(scores)
          .sort((a, b) => scores[b] - scores[a])
          .slice(0, 8);

        if (topIds.length === 0) {
          await fetchTrendingFallback();
        } else {
          await fetchTrendingByIds(topIds);
        }
      } catch (err) {
        if (__DEV__) console.error('[useTrendingProducts] Error:', err);
        if (!cancelled) {
          setErrorTrending(true);
          setLoadingTrending(false);
        }
      }
    }

    fetchTrending();

    return () => {
      cancelled = true;
    };
  }, []);

  return { trendingProducts, trendingInteractionsCount, loadingTrending, errorTrending };
}
