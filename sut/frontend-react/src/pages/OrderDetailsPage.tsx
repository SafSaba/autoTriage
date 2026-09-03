import { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useParams, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Order } from '@/lib/types';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/hooks/use-auth';
import { api } from '@/lib/api';

export default function OrderDetailsPage() {
  const { orderId } = useParams<{ orderId: string }>();
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.push('/login');
      return;
    }

    const fetchOrder = async () => {
      setLoading(true);
      try {
        if (!orderId) return;
        const orderData = await api.orders.getById(orderId);
        setOrder(orderData);
      } catch (error) {
        console.error('Error fetching order:', error);
        setOrder(null);
      } finally {
        setLoading(false);
      }
    };

    fetchOrder();
  }, [orderId, user, authLoading, router]);

  if (loading || authLoading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <Skeleton className="h-10 w-32 mb-8" />
        <Card>
          <CardHeader>
            <Skeleton className="h-8 w-1/2" />
            <Skeleton className="h-4 w-1/4" />
          </CardHeader>
          <CardContent className="space-y-6">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-32 w-full" />
            <Separator />
            <Skeleton className="h-20 w-1/2 ml-auto" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="container mx-auto px-4 py-8 text-center">
        <h1 className="text-2xl font-bold">Order not found</h1>
        <p className="text-muted-foreground">This order may not exist or you may not have permission to view it.</p>
        <Button asChild className="mt-4">
          <Link href="/orders">Back to My Orders</Link>
        </Button>
      </div>
    );
  }

  const orderDate = order.createdAt ? new Date(order.createdAt * 1000).toLocaleDateString() : 'N/A';

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <Button variant="outline" asChild>
          <Link href="/orders">← Back to Orders</Link>
        </Button>
      </div>
      <Card>
        <CardHeader>
          <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-2">
            <div>
              <CardTitle className="text-2xl font-bold font-headline">Order #{order.id.slice(-6)}</CardTitle>
              <p className="text-sm text-muted-foreground">Date: {orderDate}</p>
            </div>
            <div>
              Status: <Badge variant="default">{order.status}</Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-2 gap-8">
            <div>
              <h3 className="font-semibold mb-4">Items Ordered</h3>
              <div className="space-y-4">
                {order.items.map(({ product, quantity }) => (
                  <div key={product.id} className="flex items-center gap-4">
                    <Image src={product.images[0]} alt={product.name} width={64} height={64} className="rounded-md" />
                    <div className="flex-grow">
                      <p className="font-medium">{product.name}</p>
                      <p className="text-sm text-muted-foreground">Qty: {quantity}</p>
                    </div>
                    <p className="font-medium">${(product.price * quantity).toFixed(2)}</p>
                  </div>
                ))}
              </div>
            </div>
            <div className="space-y-6">
              <div>
                <h3 className="font-semibold mb-2">Shipping Address</h3>
                <div className="text-sm text-muted-foreground">
                  <p>{order.shippingAddress.name}</p>
                  <p>{order.shippingAddress.line1}</p>
                  {order.shippingAddress?.line2 && <p>{order.shippingAddress.line2}</p>}
                  <p>
                    {order.shippingAddress.city}, {order.shippingAddress.postal_code} {order.shippingAddress.country}
                  </p>
                </div>
              </div>
            </div>
          </div>
          <Separator className="my-6" />
          <div className="flex justify-end">
            <div className="w-full max-w-xs space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Subtotal</span>
                <span>${order.total.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Shipping</span>
                <span>$0.00</span>
              </div>
              <div className="flex justify-between font-bold text-lg">
                <span>Total</span>
                <span>${order.total.toFixed(2)}</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
