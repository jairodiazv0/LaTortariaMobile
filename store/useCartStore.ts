import { create } from 'zustand';

// 1. Tipado de la personalización profunda de repostería
export interface Customization {
  custom_text?: string;
  reference_image_url?: string;
  instructions?: string;
  theme?: string;
  color_palette?: string[];
}

// 2. Tipado de los complementos (Velas, tarjetas, etc.)
export interface AddOn {
  id: string;
  name: string;
  price: number;
}

// 3. Estructura de un ítem real dentro del carrito de La Tortaría
export interface CartItem {
  cart_id: string; // ID único para el carrito (evita que se mezclen dos tortas iguales pero con mensajes distintos)
  product_id: string;
  variant_id: string;
  name: string;
  size_label: string; // Ej: "10 Porciones"
  base_price: number;
  quantity: number;
  customization?: Customization;
  add_ons: AddOn[];
  image_url?: string;
}

interface CartState {
  items: CartItem[];
  addItem: (item: Omit<CartItem, 'cart_id'>) => void;
  removeItem: (cart_id: string) => void;
  updateQuantity: (cart_id: string, quantity: number) => void;
  clearCart: () => void;
  getTotalPrice: () => number;
  isVerifyingPayment: boolean;
  setVerifyingPayment: (value: boolean) => void;
}

export const useCartStore = create<CartState>((set, get) => ({
  items: [],
  isVerifyingPayment: false,
  setVerifyingPayment: (value) => set({ isVerifyingPayment: value }),

  addItem: (newItem) => set((state) => {
    // Generamos un hash o ID único combinando variante + textos para saber si es un ítem único
    const customHash = `${newItem.variant_id}-${newItem.customization?.custom_text || ''}-${newItem.add_ons.map(a => a.id).join('-')}`;
    
    const existingItemIndex = state.items.findIndex(item => item.cart_id === customHash);

    if (existingItemIndex > -1) {
      const updatedItems = [...state.items];
      updatedItems[existingItemIndex].quantity += newItem.quantity;
      return { items: updatedItems };
    }

    return { 
      items: [...state.items, { ...newItem, cart_id: customHash }] 
    };
  }),

  removeItem: (cart_id) => set((state) => ({
    items: state.items.filter((item) => item.cart_id !== cart_id),
  })),

  updateQuantity: (cart_id, quantity) => set((state) => ({
    items: state.items.map((item) =>
      item.cart_id === cart_id ? { ...item, quantity: Math.max(1, quantity) } : item
    ),
  })),

  clearCart: () => set({ items: [] }),

  getTotalPrice: () => {
    return get().items.reduce((total, item) => {
      const addOnsTotal = item.add_ons.reduce((sum, addon) => sum + addon.price, 0);
      return total + (item.base_price + addOnsTotal) * item.quantity;
    }, 0);
  },
}));