
export interface Product {
  id: string;
  name: string;
  description: string;
  price: number;
  images: string[];
  category: string;
  dataAiHint: string;
  stock: number;
}

export interface CartItem {
  product: Product;
  quantity: number;
}

export interface Order {
  id: string;
  userId: string;
  items: CartItem[];
  total: number;
  status: string;
  createdAt: any;
  shippingAddress: ShippingAddress;
}

export interface ShippingAddress {
  name: string;
  line1: string;
  line2?: string;
  city: string;
  state: string;
  postal_code: string;
  country: string;
}

export interface UserProfile {
  uid: string;
  email: string;
  displayName?: string;
  phoneNumber?: string;
  shippingAddress?: ShippingAddress;
  createdAt?: any;
  updatedAt?: any;
}

export type HealthStatus = 'healthy' | 'degraded' | 'down' | 'running';

export interface SystemHealth {
  status: HealthStatus;
  lastChecked: any;
  uptime: string;
  responseTime: number; // ms
  region: string;
}

export interface TestRun {
  id: string;
  name: string;
  type: 'smoke' | 'regression' | 'integration' | 'api';
  suite: 'Smoke' | 'Regression' | 'Integration' | 'API';
  status: 'passed' | 'failed' | 'running' | 'skipped';
  timestamp: any;
  duration: string;
  features: number;
  scenarios: number;
  details?: string;
  environment: string;
}
