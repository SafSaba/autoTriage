
'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useCart } from '@/hooks/use-cart';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { QuantitySelector } from '@/components/QuantitySelector';
import { Trash2, ShoppingCart, Info } from 'lucide-react';
import { logEvent } from '@/lib/analytics';
import { useAuth } from '@/hooks/use-auth';
import { useRouter } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export default function CartPage() {
  const { cartItems, cartTotal, removeFromCart, updateQuantity } = useCart();
  const { user } = useAuth();
  const router = useRouter();
  const { toast } = useToast();

  const handleRemoveFromCart = (productId: string, productName: string) => {
    removeFromCart(productId);
    logEvent('remove_from_cart', {
      item_id: productId,
      item_name: productName
    });
  }

  const handleUpdateQuantity = (productId: string, newQuantity: number) => {
    updateQuantity(productId, newQuantity);
    logEvent('update_cart_quantity', {
      item_id: productId,
      quantity: newQuantity
    });
  }

  const handleProceedToCheckout = () => {
    if (!user) {
      toast({
        title: "Login Required",
        description: "Please login to proceed to checkout.",
        variant: "destructive",
      });
      router.push('/login?redirect=/cart');
      return;
    }

    logEvent('begin_checkout', {
      currency: 'USD',
      value: cartTotal,
      items: cartItems.map(({ product, quantity }) => ({
        item_id: product.id,
        item_name: product.name,
        price: product.price,
        quantity: quantity
      }))
    });
    router.push('/checkout');
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold tracking-tight font-headline">Shopping Cart</h1>
        {!user && (
          <Alert className="max-w-md">
            <Info className="h-4 w-4" />
            <AlertTitle>Guest Session</AlertTitle>
            <AlertDescription>
              You are currently using a guest cart. <Link href="/login" className="font-semibold underline">Login</Link> to access your saved items.
            </AlertDescription>
          </Alert>
        )}
      </div>
      {cartItems.length === 0 ? (
        <div className="text-center py-16 border-2 border-dashed rounded-lg">
          <ShoppingCart className="mx-auto h-16 w-16 text-muted-foreground" />
          <h2 className="mt-6 text-xl font-semibold">Your cart is empty</h2>
          <p className="mt-2 text-muted-foreground">Looks like you haven't added anything to your cart yet.</p>
          <Button asChild className="mt-6">
            <Link href="/products">Continue Shopping</Link>
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2">
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[100px]">Product</TableHead>
                      <TableHead></TableHead>
                      <TableHead>Quantity</TableHead>
                      <TableHead>Price</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {cartItems.map(({ product, quantity }) => (
                      <TableRow key={product.id} data-testid={`cart-item-${product.id}`}>
                        <TableCell>
                          <Image
                            src={product.images[0]}
                            alt={product.name}
                            width={80}
                            height={80}
                            className="rounded-md object-cover"
                            data-ai-hint={product.dataAiHint}
                          />
                        </TableCell>
                        <TableCell className="font-medium">
                          <Link href={`/products/${product.id}`} className="hover:underline">
                            {product.name}
                          </Link>
                        </TableCell>
                        <TableCell>
                          <QuantitySelector
                            quantity={quantity}
                            onQuantityChange={(newQuantity) => handleUpdateQuantity(product.id, newQuantity)}
                            data-testid={`quantity-selector-${product.id}`}
                          />
                        </TableCell>
                        <TableCell>${product.price.toFixed(2)}</TableCell>
                        <TableCell className="text-right font-medium">
                          ${(product.price * quantity).toFixed(2)}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleRemoveFromCart(product.id, product.name)}
                            aria-label={`Remove ${product.name} from cart`}
                            data-testid={`remove-item-${product.id}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
          <div className="lg:col-span-1">
            <Card>
              <CardHeader>
                <CardTitle>Order Summary</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex justify-between">
                  <span>Subtotal</span>
                  <span id="cart-subtotal">${cartTotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Shipping</span>
                  <span>Free</span>
                </div>
                <div className="flex justify-between">
                  <span>Tax (10%)</span>
                  <span>${(cartTotal * 0.1).toFixed(2)}</span>
                </div>
                <div className="flex justify-between font-bold text-lg">
                  <span>Total</span>
                  <span id="cart-total">${(cartTotal * 1.1).toFixed(2)}</span>
                </div>
              </CardContent>
              <CardFooter>
                <Button onClick={handleProceedToCheckout} className="w-full" size="lg">
                  Proceed to Checkout
                </Button>
              </CardFooter>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
