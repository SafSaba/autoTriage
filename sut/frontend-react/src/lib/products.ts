import type { Product } from './types';
import { api } from './api';

export const initialProducts: Product[] = [
  {
    id: 'prod_001',
    name: 'Chronograph Excellence',
    description:
      'A masterpiece of precision and style, this chronograph watch is designed for the modern man. Featuring a stainless steel case, sapphire crystal glass, and a sophisticated dial with multiple subdials, it offers both functionality and elegance. Water-resistant up to 100 meters.',
    price: 450.0,
    images: ['https://images.unsplash.com/photo-1524805444758-089113d48a6d?q=80&w=600&auto=format&fit=crop', 'https://placehold.co/600x600.png', 'https://placehold.co/600x600.png'],
    category: 'Watches',
    stock: 15,
    dataAiHint: 'luxury watch'
  },
  {
    id: 'prod_002',
    name: 'Titanium Smartwatch',
    description:
      'Experience the future on your wrist. This smartwatch boasts a lightweight titanium frame, a vibrant AMOLED display, and a suite of health and fitness tracking features. Syncs seamlessly with your smartphone for notifications, calls, and music control. Long-lasting battery life.',
    price: 799.99,
    images: ['https://images.unsplash.com/photo-1546868871-7041f2a55e12?q=80&w=600&auto=format&fit=crop', 'https://placehold.co/600x600.png'],
    category: 'Watches',
    stock: 25,
    dataAiHint: 'smart watch'
  },
  {
    id: 'prod_003',
    name: 'Ultra-Slim Laptop',
    description:
      'Power and portability combined. Our ultra-slim laptop features the latest generation processor, a stunning 4K display, and a sleek aluminum body. With all-day battery life and a backlit keyboard, it’s perfect for professionals on the go. Comes with 16GB RAM and 1TB SSD storage.',
    price: 1399.0,
    images: ['https://images.unsplash.com/photo-1525547719571-a2d4ac8945e2?q=80&w=600&auto=format&fit=crop', 'https://placehold.co/600x600.png'],
    category: 'Laptops',
    stock: 10,
    dataAiHint: 'modern laptop'
  },
  {
    id: 'prod_004',
    name: 'Gaming Beast Laptop',
    description:
      'Unleash your gaming potential with this powerhouse. Equipped with a high-refresh-rate display, a top-tier graphics card, and an advanced cooling system. The customizable RGB keyboard and immersive audio will elevate your gaming experience to new heights.',
    price: 2100.5,
    images: ['https://images.unsplash.com/photo-1593642702821-c8da6771f0c6?q=80&w=600&auto=format&fit=crop', 'https://placehold.co/600x600.png', 'https://placehold.co/600x600.png'],
    category: 'Laptops',
    stock: 5,
    dataAiHint: 'gaming laptop'
  },
  {
    id: 'prod_005',
    name: 'Galaxy Pro Smartphone',
    description:
      'Capture life in stunning detail with the Galaxy Pro. Its professional-grade camera system, brilliant dynamic display, and powerful processor make it a leader in its class. Features an intelligent S-Pen for ultimate productivity and creativity. 5G ready.',
    price: 1199.99,
    images: ['https://images.unsplash.com/photo-1601784551446-20c9e07cdbf1?q=80&w=600&auto=format&fit=crop', 'https://placehold.co/600x600.png'],
    category: 'Smartphones',
    stock: 30,
    dataAiHint: 'modern smartphone'
  },
  {
    id: 'prod_006',
    name: 'Pixel Perfect Smartphone',
    description:
      'The smart choice for a smartphone. Renowned for its exceptional camera powered by AI, clean software experience, and tight integration with Google services. Get the best of Android with timely updates and helpful features that anticipate your needs.',
    price: 899.0,
    images: ['https://images.unsplash.com/photo-1610945415295-d9bbf067e59c?q=80&w=600&auto=format&fit=crop', 'https://placehold.co/600x600.png'],
    category: 'Smartphones',
    stock: 22,
    dataAiHint: 'sleek smartphone'
  },
  {
    id: 'prod_007',
    name: 'Minimalist Digital Watch',
    description:
      'Simplicity meets sophistication. This digital watch features a clean, easy-to-read display in a slim and lightweight case. Perfect for everyday wear, it offers essential features like an alarm, stopwatch, and backlight in an understated design.',
    price: 150.0,
    images: ['https://images.unsplash.com/photo-1523275335684-37898b6baf30?q=80&w=600&auto=format&fit=crop'],
    category: 'Watches',
    stock: 40,
    dataAiHint: 'minimalist watch'
  },
  {
    id: 'prod_008',
    name: 'Creator Pro Laptop',
    description:
      'The ultimate tool for creators. This laptop is built to handle demanding creative workflows with its color-accurate display, powerful GPU, and extensive port selection. Whether you are into video editing, 3D rendering, or graphic design, this machine has you covered.',
    price: 2500.0,
    images: ['https://images.unsplash.com/photo-1589561253898-768105ca91a8?q=80&w=600&auto=format&fit=crop', 'https://placehold.co/600x600.png'],
    category: 'Laptops',
    stock: 8,
    dataAiHint: 'powerful laptop'
  },
];

export async function getProducts(category?: string): Promise<Product[]> {
  return api.products.list(category ? { category } : undefined);
}

export async function getProductById(id: string): Promise<Product | undefined> {
  try {
    return await api.products.getById(id);
  } catch {
    return undefined;
  }
}

export async function getCategories(): Promise<string[]> {
  return api.products.categories();
}
