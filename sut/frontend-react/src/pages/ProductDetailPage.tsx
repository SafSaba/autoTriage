import { useState, useEffect } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useParams, useRouter, usePathname } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { QuantitySelector } from '@/components/QuantitySelector';
import { useCart } from '@/hooks/use-cart';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import type { Product } from '@/lib/types';
import { getProductById } from '@/lib/products';
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from '@/components/ui/carousel';
import { Card, CardContent } from '@/components/ui/card';
import { CheckCircle, Shield, Truck } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { logEvent } from '@/lib/analytics';

export default function ProductDetailPage() {
  const { productId } = useParams<{ productId: string }>();
  const [quantity, setQuantity] = useState(1);
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const { addToCart } = useCart();
  const { user } = useAuth();
  const { toast } = useToast();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const fetchProduct = async () => {
      setLoading(true);
      try {
        if (!productId) {
          setProduct(null);
          return;
        }
        const fetchedProduct = await getProductById(productId);
        if (fetchedProduct) {
          setProduct(fetchedProduct);
          logEvent('view_item', {
            item_id: fetchedProduct.id,
            item_name: fetchedProduct.name,
            price: fetchedProduct.price,
            item_category: fetchedProduct.category,
          });
        } else {
          setProduct(null);
        }
      } catch (error) {
        console.error('Error fetching product:', error);
        setProduct(null);
      } finally {
        setLoading(false);
      }
    };
    fetchProduct();
  }, [productId]);

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8 md:py-12">
        <div className="grid md:grid-cols-2 gap-8 lg:gap-16">
          <div>
            <Skeleton className="w-full aspect-square" />
          </div>
          <div className="space-y-4">
            <Skeleton className="h-6 w-1/4" />
            <Skeleton className="h-12 w-3/4" />
            <Skeleton className="h-8 w-1/2" />
            <Skeleton className="h-24 w-full" />
            <Separator />
            <div className="flex gap-4">
              <Skeleton className="h-12 w-24" />
              <Skeleton className="h-12 w-48" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[70vh] px-4 space-y-6 text-center">
        <h1 className="text-4xl font-headline font-bold text-primary">Product Not Found</h1>
        <p className="text-muted-foreground max-w-md">
          The product you are looking for does not exist.
        </p>
        <Button asChild>
          <Link href="/products">Back to Products</Link>
        </Button>
      </div>
    );
  }

  const handleAddToCart = () => {
    if (!user) {
      toast({
        title: 'Authentication Required',
        description: 'Please login to add items to your cart.',
        variant: 'destructive',
      });
      router.push(`/login?redirect=${pathname}`);
      return;
    }
    addToCart(product, quantity);
    logEvent('add_to_cart', {
      item_id: product.id,
      item_name: product.name,
      price: product.price,
      quantity,
    });
    setQuantity(1);
  };

  const features = [
    { icon: CheckCircle, text: 'In Stock & Ready to Ship' },
    { icon: Truck, text: 'Free, Fast Shipping' },
    { icon: Shield, text: '2-Year Warranty' },
  ];

  return (
    <div className="container mx-auto px-4 py-8 md:py-12">
      <div className="grid md:grid-cols-2 gap-8 lg:gap-16">
        <div>
          <Carousel className="w-full max-w-lg mx-auto" data-testid="product-image-carousel">
            <CarouselContent>
              {product.images.map((img, index) => (
                <CarouselItem key={index}>
                  <Card className="overflow-hidden">
                    <CardContent className="p-0 aspect-square flex items-center justify-center">
                      <Image
                        src={img}
                        alt={`${product.name} - image ${index + 1}`}
                        width={600}
                        height={600}
                        className="object-cover w-full h-full"
                        priority={index === 0}
                      />
                    </CardContent>
                  </Card>
                </CarouselItem>
              ))}
            </CarouselContent>
            {product.images.length > 1 && (
              <>
                <CarouselPrevious />
                <CarouselNext />
              </>
            )}
          </Carousel>
        </div>
        <div className="flex flex-col justify-center">
          <span className="text-sm font-medium text-primary mb-2">{product.category}</span>
          <h1 className="text-3xl lg:text-4xl font-bold tracking-tight mb-4 font-headline" data-testid="product-name">
            {product.name}
          </h1>
          <div className="mb-6">
            <p className="text-2xl lg:text-3xl font-semibold" data-testid="product-price">
              ${product.price.toFixed(2)}
            </p>
            <div className="text-sm text-muted-foreground mt-1">
              <p>+ Tax: ${(product.price * 0.1).toFixed(2)}</p>
              <p className="font-medium text-foreground">Total: ${(product.price * 1.1).toFixed(2)}</p>
            </div>
          </div>
          <p className="text-muted-foreground leading-relaxed mb-6" data-testid="product-description">
            {product.description}
          </p>

          <Separator className="my-6" />

          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 mb-8">
            <QuantitySelector quantity={quantity} onQuantityChange={setQuantity} data-testid="quantity-selector" />
            <Button size="lg" onClick={handleAddToCart} data-testid="add-to-cart-button" className="w-full sm:w-auto">
              Add to Cart
            </Button>
          </div>

          <div className="space-y-3">
            {features.map((feature) => (
              <div key={feature.text} className="flex items-center gap-3 text-sm">
                <feature.icon className="w-5 h-5 text-green-600" />
                <span className="text-muted-foreground">{feature.text}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
