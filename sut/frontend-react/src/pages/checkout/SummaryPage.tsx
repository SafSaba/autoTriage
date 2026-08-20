import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { useCart } from '@/hooks/use-cart';
import { useAuth } from '@/hooks/use-auth';
import { useRouter } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { CartItem } from '@/lib/types';
import { logEvent } from '@/lib/analytics';
import { api } from '@/lib/api';

export default function SummaryPage() {
  const { cartItems, cartTotal, clearCart } = useCart();
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const { toast } = useToast();
  const [isProcessing, setIsProcessing] = useState(false);
  const [isClient, setIsClient] = useState(false);
  const [shippingAddress, setShippingAddress] = useState<any>(null);
  const [paymentDetails, setPaymentDetails] = useState<any>(null);

  useEffect(() => {
    setIsClient(true);
    const savedShippingAddress = localStorage.getItem('shippingAddress');
    const savedPaymentDetails = localStorage.getItem('paymentDetails');

    if (savedShippingAddress) {
      setShippingAddress(JSON.parse(savedShippingAddress));
    }
    if (savedPaymentDetails) {
      const parsedDetails = JSON.parse(savedPaymentDetails);
      setPaymentDetails({ ...parsedDetails, last4: (parsedDetails.cardNumber || '').slice(-4) });
    }

    if (!authLoading && !user) {
      router.push('/login');
    }
    if (!savedShippingAddress) {
      router.push('/checkout');
    }
  }, [user, authLoading, router]);

  const processOrder = async () => {
    setIsProcessing(true);
    logEvent('purchase', {
      transaction_id: `T-${Date.now()}`,
      value: cartTotal,
      currency: 'USD',
      items: cartItems.map(({ product, quantity }) => ({
        item_id: product.id,
        item_name: product.name,
        price: product.price,
        quantity,
      })),
    });

    if (!user || !shippingAddress) {
      toast({
        title: 'Error',
        description: 'You must be logged in and have a shipping address to place an order.',
        variant: 'destructive',
      });
      setIsProcessing(false);
      return;
    }

    try {
      const createdOrder = await api.orders.create({
        items: cartItems.map(({ product, quantity }) => ({
          productId: product.id,
          quantity,
        })),
        shippingAddress,
        paymentDetails: {
          method: 'Card',
          last4: paymentDetails?.last4 || '4242',
          cardNumber: paymentDetails?.cardNumber,
        },
      });

      clearCart();
      localStorage.removeItem('shippingAddress');
      localStorage.removeItem('paymentDetails');

      toast({
        title: 'Order Placed!',
        description: 'Your order has been successfully placed.',
      });
      router.push(`/order-confirmation/${createdOrder.id}`);
    } catch (error: any) {
      console.error('Error placing order: ', error);
      toast({
        title: 'Order Failed',
        description: error?.message || 'There was an error placing your order. Please try again.',
        variant: 'destructive',
      });
      setIsProcessing(false);
    }
  };

  if (!isClient || authLoading || !shippingAddress) {
    return (
      <div className="mx-auto max-w-4xl py-8 px-4">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-8">
          <div className="md:col-span-3 space-y-8">
            <Skeleton className="h-40 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
          <div className="md:col-span-2">
            <Skeleton className="h-80 w-full" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl py-8 px-4">
      <div className="grid grid-cols-1 md:grid-cols-5 gap-8">
        <div className="md:col-span-3 space-y-8">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Shipping Address</CardTitle>
                <CardDescription>Your delivery details.</CardDescription>
              </div>
              <Button variant="outline" size="sm" asChild>
                <Link href="/checkout">Edit</Link>
              </Button>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              <p>{shippingAddress?.name}</p>
              <p>
                {shippingAddress?.line1} {shippingAddress?.line2}
              </p>
              <p>
                {shippingAddress?.city}, {shippingAddress?.state} {shippingAddress?.postal_code}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Payment Method</CardTitle>
                <CardDescription>Your payment details.</CardDescription>
              </div>
              <Button variant="outline" size="sm" asChild>
                <Link href="/checkout/payment">Edit</Link>
              </Button>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              <p>Card ending in {paymentDetails?.last4 || '****'}</p>
            </CardContent>
          </Card>
        </div>

        <div className="md:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Order Summary</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {cartItems.map(({ product, quantity }: CartItem) => (
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
              <Separator className="my-4" />
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span>${cartTotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Shipping</span>
                  <span>$0.00</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Tax (10%)</span>
                  <span>${(cartTotal * 0.1).toFixed(2)}</span>
                </div>
              </div>
              <Separator className="my-4" />
              <div className="flex justify-between font-bold text-lg">
                <span>Total</span>
                <span>${(cartTotal * 1.1).toFixed(2)}</span>
              </div>
            </CardContent>
            <CardFooter>
              <Button onClick={processOrder} disabled={isProcessing} size="lg" className="w-full" data-testid="place-order-button">
                {isProcessing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : 'Place Order'}
              </Button>
            </CardFooter>
          </Card>
        </div>
      </div>
    </div>
  );
}
