import Image from 'next/image';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { useCart } from '@/hooks/use-cart';
import { useAuth } from '@/hooks/use-auth';
import { useRouter, usePathname } from 'next/navigation';
import type { Product } from '@/lib/types';
import { ShoppingCart } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { logEvent } from '@/lib/analytics';

interface ProductCardProps {
  product: Product;
}

export function ProductCard({ product }: ProductCardProps) {
  const { addToCart } = useCart();
  const { user } = useAuth();
  const { toast } = useToast();
  const router = useRouter();
  const pathname = usePathname();

  const handleAddToCart = (e: React.MouseEvent<HTMLButtonElement, MouseEvent>) => {
    e.preventDefault();

    if (!user) {
      toast({
        title: 'Authentication Required',
        description: 'Please login to add items to your cart.',
        variant: 'destructive',
      });
      router.push(`/login?redirect=${pathname}`);
      return;
    }

    addToCart(product, 1);
    logEvent('add_to_cart', {
      item_id: product.id,
      item_name: product.name,
      price: product.price,
      quantity: 1,
    });
  };

  const outOfStock = product.stock <= 0;
  const lowStock = product.stock > 0 && product.stock <= 5;

  return (
    <Card
      className="w-full max-w-sm overflow-hidden rounded-lg shadow-lg transition-transform duration-300 hover:scale-105 hover:shadow-xl flex flex-col"
      data-testid={`product-card-${product.id}`}
    >
      <Link
        href={`/products/${product.id}`}
        className="flex flex-col h-full"
        onClick={() => logEvent('select_item', { item_id: product.id, item_name: product.name })}
      >
        <CardHeader className="p-0">
          <div className="aspect-square relative">
            <Image
              src={product.images[0]}
              alt={product.name}
              fill
              className="object-cover"
              sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
              data-ai-hint={product.dataAiHint}
            />
            <div className="absolute top-2 right-2">
              {outOfStock ? (
                <Badge variant="destructive">Out of Stock</Badge>
              ) : lowStock ? (
                <Badge variant="secondary" className="bg-amber-500/90 text-white">
                  Only {product.stock} left
                </Badge>
              ) : (
                <Badge variant="secondary" className="bg-background/80 backdrop-blur-sm">
                  {product.stock} in stock
                </Badge>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-4 flex-grow">
          <div className="text-xs font-medium text-muted-foreground mb-1">{product.category}</div>
          <CardTitle className="text-lg font-semibold leading-tight mb-2">{product.name}</CardTitle>
          <p className="text-muted-foreground text-sm line-clamp-2">{product.description}</p>
        </CardContent>
        <CardFooter className="p-4 flex justify-between items-center mt-auto">
          <p className="text-xl font-bold text-primary">${product.price.toFixed(2)}</p>
          <Button
            onClick={handleAddToCart}
            size="icon"
            disabled={outOfStock}
            aria-label={`Add ${product.name} to cart`}
            data-testid="add-to-cart-button"
          >
            <ShoppingCart className="h-5 w-5" />
          </Button>
        </CardFooter>
      </Link>
    </Card>
  );
}
