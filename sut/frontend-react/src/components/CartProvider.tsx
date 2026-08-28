import type { CartItem, Product } from '@/lib/types';
import React, { createContext, useState, useEffect, useCallback } from 'react';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/use-auth';
import { api } from '@/lib/api';

interface CartContextType {
  cart: CartItem[];
  cartItems: CartItem[];
  addToCart: (product: Product, quantity: number) => void;
  updateQuantity: (productId: string, quantity: number) => void;
  removeFromCart: (productId: string) => void;
  clearCart: () => void;
  cartCount: number;
  cartTotal: number;
}

export const CartContext = createContext<CartContextType | null>(null);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const { toast } = useToast();
  const { user } = useAuth();

  useEffect(() => {
    let cancelled = false;
    const loadCart = async () => {
      const storageKey = user ? `e_automate_cart_${user.uid}` : 'e_automate_guest_cart';
      if (user) {
        try {
          // Check if there are guest cart items to merge into the user's server cart
          const guestRaw = localStorage.getItem('e_automate_guest_cart');
          const guestParsed: CartItem[] = guestRaw ? JSON.parse(guestRaw) : [];
          if (guestParsed.length > 0) {
            const synced = await api.cart.sync(
              guestParsed.map((i) => ({ productId: i.product.id, quantity: i.quantity }))
            );
            localStorage.removeItem('e_automate_guest_cart');
            if (!cancelled) {
              setCartItems(synced.items || []);
              localStorage.setItem(storageKey, JSON.stringify(synced.items || []));
              return;
            }
          }

          const remoteCart = await api.cart.get();
          if (!cancelled) {
            setCartItems(remoteCart.items || []);
            localStorage.setItem(storageKey, JSON.stringify(remoteCart.items || []));
            return;
          }
        } catch {
          // Fallback to localStorage below
        }
      }
      try {
        const savedCart = localStorage.getItem(storageKey);
        if (!cancelled) {
          setCartItems(savedCart ? JSON.parse(savedCart) : []);
        }
      } catch {
        if (!cancelled) setCartItems([]);
      }
    };
    loadCart();
    return () => {
      cancelled = true;
    };
  }, [user]);

  useEffect(() => {
    const storageKey = user ? `e_automate_cart_${user.uid}` : 'e_automate_guest_cart';
    localStorage.setItem(storageKey, JSON.stringify(cartItems));
  }, [cartItems, user]);

  const addToCart = useCallback(
    (product: Product, quantity: number) => {
      if (product.stock <= 0) {
        toast({
          title: 'Out of Stock',
          description: `${product.name} is currently out of stock.`,
          variant: 'destructive',
        });
        return;
      }
      setCartItems((prevItems) => {
        const existingItem = prevItems.find((item) => item.product.id === product.id);
        if (existingItem) {
          const nextQty = Math.min(product.stock, existingItem.quantity + quantity);
          return prevItems.map((item) =>
            item.product.id === product.id ? { ...item, quantity: nextQty } : item
          );
        }
        return [...prevItems, { product, quantity: Math.min(product.stock, quantity) }];
      });
      if (user) {
        api.cart
          .addItem(product.id, quantity)
          .then((res) => {
            if (res?.cart?.items) {
              setCartItems(res.cart.items);
            }
          })
          .catch((err) => {
            console.error('Failed to sync addItem to backend cart:', err);
          });
      }
      toast({
        title: 'Added to cart',
        description: `${product.name} has been added to your cart.`,
      });
    },
    [toast, user]
  );

  const updateQuantity = useCallback(
    (productId: string, quantity: number) => {
      setCartItems((prevItems) => {
        if (quantity <= 0) {
          return prevItems.filter((item) => item.product.id !== productId);
        }
        return prevItems.map((item) =>
          item.product.id === productId
            ? { ...item, quantity: item.product.stock > 0 ? Math.min(quantity, item.product.stock) : quantity }
            : item
        );
      });
      if (user) {
        if (quantity <= 0) {
          api.cart
            .removeItem(productId)
            .then((res) => setCartItems(res.items || []))
            .catch(() => {});
        } else {
          api.cart
            .updateItem(productId, quantity)
            .then((res) => setCartItems(res.items || []))
            .catch(() => {});
        }
      }
    },
    [user]
  );

  const removeFromCart = useCallback(
    (productId: string) => {
      setCartItems((prevItems) =>
        prevItems.filter((item) => item.product.id !== productId)
      );
      if (user) {
        api.cart
          .removeItem(productId)
          .then((res) => setCartItems(res.items || []))
          .catch(() => {});
      }
      toast({
        title: 'Item removed',
        description: 'An item has been removed from your cart.',
        variant: 'destructive',
      });
    },
    [toast, user]
  );

  const clearCart = useCallback(() => {
    setCartItems([]);
    if (user) {
      api.cart.clear().catch(() => {});
    }
  }, [user]);

  const cartCount = cartItems.reduce((count, item) => count + item.quantity, 0);
  const cartTotal = cartItems.reduce(
    (total, item) => total + item.product.price * item.quantity,
    0
  );

  return (
    <CartContext.Provider
      value={{
        cart: cartItems,
        cartItems,
        addToCart,
        updateQuantity,
        removeFromCart,
        clearCart,
        cartCount,
        cartTotal,
      }}
    >
      {children}
    </CartContext.Provider>
  );
}
