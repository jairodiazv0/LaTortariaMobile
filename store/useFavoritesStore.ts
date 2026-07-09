import { create } from 'zustand';
import { supabase } from '../lib/supabase';

export interface FavoriteProduct {
  id: string;
  product_id: string;
  name: string;
  rating_avg: number | null;
  coverUrl: string | null;
  basePrice: number;
}

interface FavoritesState {
  favorites: FavoriteProduct[];
  loading: boolean;
  fetchFavorites: (userId: string) => Promise<void>;
  clearFavorites: () => void;
}

export const useFavoritesStore = create<FavoritesState>((set) => ({
  favorites: [],
  loading: false,

  fetchFavorites: async (userId: string) => {
    try {
      set({ loading: true });
      const { data, error } = await supabase
        .from('user_interactions')
        .select(`
          id,
          product_id,
          products (
            name,
            rating_avg,
            product_variants ( price, is_active ),
            product_media ( url, is_cover )
          )
        `)
        .eq('user_id', userId)
        .eq('interaction_type', 'favorite')
        .order('created_at', { ascending: false });

      if (error) throw error;

      if (data) {
        // Mapeo relacional idéntico a tu lógica de negocio original
        const mapped: FavoriteProduct[] = data.map((row: any) => {
          const prod = row.products;
          const cover = prod?.product_media?.find((m: any) => m.is_cover)?.url ?? prod?.product_media?.[0]?.url ?? null;
          const activeVars = prod?.product_variants?.filter((v: any) => v.is_active) ?? [];
          const price = activeVars.length > 0 ? Number(activeVars[0].price) : 0;

          return {
            id: row.id,
            product_id: row.product_id,
            name: prod?.name ?? 'Producto',
            rating_avg: prod?.rating_avg ?? null,
            coverUrl: cover,
            basePrice: price,
          };
        });
        
        set({ favorites: mapped, loading: false });
      }
    } catch (err) {
      console.error('Error fetching favorites globally:', err);
      set({ loading: false });
    }
  },

  clearFavorites: () => set({ favorites: [] }),
}));
