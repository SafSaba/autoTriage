/// <reference types="vite/client" />
import type { Product, CartItem, Order, ShippingAddress, UserProfile } from './types';

const TOKEN_KEY = 'e_automate_jwt';

export function getAuthToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setAuthToken(token: string | null): void {
  if (token) {
    localStorage.setItem(TOKEN_KEY, token);
  } else {
    localStorage.removeItem(TOKEN_KEY);
  }
}

const metaEnv = (import.meta as any).env || {};
export const API_BASE = metaEnv.VITE_API_URL !== undefined 
  ? metaEnv.VITE_API_URL 
  : (metaEnv.DEV ? '' : 'https://autotriage-backend.graytree-645df5bf.eastus.azurecontainerapps.io');


export async function apiFetch<T = any>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getAuthToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((init.headers as Record<string, string>) || {}),
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  const url = path.startsWith('http') ? path : `${API_BASE}${path}`;
  const res = await fetch(url, { ...init, headers });
  const text = await res.text();
  let data: any = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }
  if (!res.ok) {
    const message = data?.message || data?.error || `HTTP ${res.status}`;
    throw new Error(message);
  }
  return data as T;
}

export interface AuthResponse {
  token: string;
  user: UserProfile & { role?: string };
}

export interface ContactMessage {
  id: string;
  email: string;
  subject: string;
  message: string;
  status: string;
  createdAt: number;
}

export const api = {
  auth: {
    login: (email: string, password: string) =>
      apiFetch<AuthResponse>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      }),
    signup: (payload: { email: string; password: string; firstName?: string; lastName?: string; displayName?: string }) =>
      apiFetch<AuthResponse>('/api/auth/signup', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    forgotPassword: (email: string) =>
      apiFetch<{ success: boolean; message: string }>('/api/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ email }),
      }),
    getMe: () => apiFetch<UserProfile & { role?: string }>('/api/me'),
    updateMe: (payload: Partial<UserProfile>) =>
      apiFetch<UserProfile & { role?: string }>('/api/me', {
        method: 'PUT',
        body: JSON.stringify(payload),
      }),
  },
  products: {
    list: (params?: { category?: string; q?: string; sort?: string }) => {
      const qs = new URLSearchParams();
      if (params?.category) qs.set('category', params.category);
      if (params?.q) qs.set('q', params.q);
      if (params?.sort) qs.set('sort', params.sort);
      const queryStr = qs.toString() ? `?${qs.toString()}` : '';
      return apiFetch<Product[]>(`/api/products${queryStr}`);
    },
    getById: (id: string) => apiFetch<Product>(`/api/products/${encodeURIComponent(id)}`),
    categories: () => apiFetch<string[]>('/api/products/categories'),
    create: (product: Partial<Product>) =>
      apiFetch<Product>('/api/products', {
        method: 'POST',
        body: JSON.stringify(product),
      }),
    update: (id: string, product: Partial<Product>) =>
      apiFetch<Product>(`/api/products/${encodeURIComponent(id)}`, {
        method: 'PUT',
        body: JSON.stringify(product),
      }),
    delete: (id: string) =>
      apiFetch<{ success: boolean; id: string }>(`/api/products/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      }),
    reset: () =>
      apiFetch<Product[]>('/api/products/reset', {
        method: 'POST',
      }),
  },
  cart: {
    get: () =>
      apiFetch<{ items: CartItem[]; subtotal: number; tax: number; total: number }>('/api/cart'),
    sync: (items: { productId: string; quantity: number }[]) =>
      apiFetch<{ items: CartItem[]; subtotal: number; tax: number; total: number }>('/api/cart/sync', {
        method: 'POST',
        body: JSON.stringify(items),
      }),
    addItem: (productId: string, quantity: number) =>
      apiFetch<{ success: boolean; cart: { items: CartItem[]; subtotal: number; tax: number; total: number } }>(
        '/api/cart/items',
        {
          method: 'POST',
          body: JSON.stringify({ productId, quantity }),
        }
      ),
    updateItem: (productId: string, quantity: number) =>
      apiFetch<{ items: CartItem[]; subtotal: number; tax: number; total: number }>(
        `/api/cart/items/${encodeURIComponent(productId)}`,
        {
          method: 'PUT',
          body: JSON.stringify({ quantity }),
        }
      ),
    removeItem: (productId: string) =>
      apiFetch<{ items: CartItem[]; subtotal: number; tax: number; total: number }>(
        `/api/cart/items/${encodeURIComponent(productId)}`,
        {
          method: 'DELETE',
        }
      ),
    clear: () =>
      apiFetch<{ success: boolean; message: string }>('/api/cart', {
        method: 'DELETE',
      }),
  },
  orders: {
    create: (payload: {
      items: { productId: string; quantity: number }[];
      shippingAddress: ShippingAddress;
      paymentDetails?: Record<string, unknown>;
    }) =>
      apiFetch<Order>('/api/orders', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    list: () => apiFetch<Order[]>('/api/orders'),
    getById: (orderId: string) => apiFetch<Order>(`/api/orders/${encodeURIComponent(orderId)}`),
    adminList: () => apiFetch<Order[]>('/api/admin/orders'),
    adminUpdateStatus: (orderId: string, status: string) =>
      apiFetch<Order>(`/api/admin/orders/${encodeURIComponent(orderId)}/status`, {
        method: 'PUT',
        body: JSON.stringify({ status }),
      }),
  },
  contact: {
    submit: (payload: { email: string; subject: string; message: string }) =>
      apiFetch<ContactMessage>('/api/contact', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    adminList: () => apiFetch<ContactMessage[]>('/api/admin/messages'),
  },
  bugs: {
    getFlags: () => apiFetch<Record<string, boolean>>('/api/admin/bugs'),
    updateFlags: (updates: Record<string, boolean>) =>
      apiFetch<Record<string, boolean>>('/api/admin/bugs', {
        method: 'PUT',
        body: JSON.stringify(updates),
      }),
  },
};
