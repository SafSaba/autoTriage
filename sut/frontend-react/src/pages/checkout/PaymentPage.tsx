'use client';

export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CreditCard, Landmark } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { Skeleton } from '@/components/ui/skeleton';

function PayPalIcon() {
    return <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" className="h-6 w-6"><path fill="#003087" d="M12.446.423c-2.484 0-4.634.95-6.264 2.852-1.63 1.901-2.527 4.298-2.527 6.901 0 1.542.428 2.946 1.282 4.202.856 1.256 2.06 2.221 3.611 2.894l.235.103c.227.102.46.22.7.354.24.134.48.283.719.45.239.165.478.349.718.55.24.201.474.42.708.656.234.237.458.49.673.76.215.27.42.556.615.859.195.303.374.621.536.956.162.335.298.685.408 1.052.11.367.19.749.239 1.147.05.398.074.805.074 1.222 0 .146-.008.284-.023.415a.56.56 0 0 1-.555.51h-4.32a.56.56 0 0 1-.55-.615.53.53 0 0 1 .03-.112c.11-.475.253-1.02.43-1.635.175-.615.353-1.161.533-1.635l.082-.22c.008-.024.018-.047.028-.07.01-.024.02-.047.03-.07.012-.024.024-.047.036-.07.012-.023.024-.046.035-.069.282-.58.55-1.057.802-1.432.253-.375.484-.69.69-.944.207-.255.385-.474.53-.657.145-.183.255-.34.33-.47.075-.13.112-.234.112-.313a.47.47 0 0 0-.144-.353.47.47 0 0 0-.353-.145c-.08 0-.16.02-.24.06-.08.04-.15.09-.22.15-.22.18-.47.4-.75.64-.28.25-.59.51-.93.79-.34.28-.71.56-1.1.84s-.81.56-1.25.82c-.44.26-.9.5-1.38.72l-.12.05c-1.35.58-2.5 1.01-3.45 1.3-1.1.34-2.18.51-3.23.51-2.48 0-4.63-.95-6.26-2.85-1.63-1.9-2.52-4.3-2.52-6.9 0-3.9 1.4-7.1 4.2-9.6s6.3-3.8 10.5-3.8c4.2 0 7.7.9 10.5 2.8s4.2 4.5 4.2 8c0 .8-.1 1.5-.4 2.2-.3.7-.7 1.3-1.2 1.8-.5.5-1.1.9-1.8 1.2s-1.5.4-2.3.4h-6.2c-.4 0-.7-.1-1-.2-.3-.2-.5-.4-.7-.7-.2-.3-.3-.6-.4-1-.1-.4-.1-.8-.1-1.2 0-2 .5-3.6 1.6-4.9 1.1-1.3 2.6-1.9 4.6-1.9h.1c.3 0 .6.1.8.2.3.1.5.3.7.5.2.2.4.5.5.8.1.3.2.6.2.9z"/></svg>;
}

function KlarnaIcon() {
    return <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" className="h-6 w-6"><path fill="#FFB3C7" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1.2 14.4H8.4v-2.19l2.4-3.81-2.4-3.81V2.4h2.4v2.19l-2.4 3.81 2.4 3.81v2.2zm4.8 0h-2.4v-2.19l2.4-3.81-2.4-3.81V2.4h2.4v2.19l-2.4 3.81 2.4 3.81v2.2z"/></svg>;
}

const paymentSchema = z.object({
  cardName: z.string().min(2, 'Name must be at least 2 characters.'),
  cardNumber: z.string().regex(/^\d{16}$/, 'Card number must be 16 digits.'),
  expiryDate: z.string().regex(/^(0[1-9]|1[0-2])\/\d{2}$/, 'Expiry date must be in MM/YY format.'),
  cvc: z.string().regex(/^\d{3,4}$/, 'CVC must be 3 or 4 digits.'),
});

type PaymentFormData = z.infer<typeof paymentSchema>;

export default function PaymentPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [paymentDetails, setPaymentDetails] = useState<PaymentFormData | null>(null);


  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<PaymentFormData>({
    resolver: zodResolver(paymentSchema),
    defaultValues: {
      cardName: paymentDetails?.cardName || '',
      cardNumber: paymentDetails?.cardNumber || '',
      expiryDate: paymentDetails?.expiryDate || '',
      cvc: paymentDetails?.cvc || '',
    },
  });

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
    }
  }, [user, authLoading, router]);

  const onSubmit = (data: PaymentFormData) => {
    localStorage.setItem('paymentDetails', JSON.stringify(data));

    router.push('/checkout/summary');
  };
  
  if (authLoading || !user) {
      return (
         <div className="mx-auto max-w-2xl">
            <Card>
                <CardHeader>
                    <Skeleton className="h-6 w-1/2" />
                    <Skeleton className="h-4 w-3/4" />
                </CardHeader>
                <CardContent>
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-40 w-full mt-6" />
                </CardContent>
            </Card>
        </div>
      )
  }

  return (
    <div className="mx-auto max-w-2xl">
      <Card>
        <CardHeader>
          <CardTitle>Payment Method</CardTitle>
          <CardDescription>Choose how you would like to pay for your order.</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="card" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="card"><CreditCard className="mr-2 h-4 w-4"/>Card</TabsTrigger>
              <TabsTrigger value="paypal" disabled><PayPalIcon/>PayPal</TabsTrigger>
              <TabsTrigger value="klarna" disabled><KlarnaIcon/>Klarna</TabsTrigger>
            </TabsList>
            <TabsContent value="card" className="mt-6">
              <form onSubmit={handleSubmit(onSubmit)}>
                <div className="grid gap-4">
                    <div className="grid gap-2">
                        <Label htmlFor="card-name">Name on card</Label>
                        <Input id="card-name" {...register('cardName')} placeholder="John Doe" />
                        {errors.cardName && <p className="text-sm text-destructive">{errors.cardName.message}</p>}
                    </div>
                     <div className="grid gap-2">
                        <Label htmlFor="card-number">Card number</Label>
                        <Input id="card-number" {...register('cardNumber')} placeholder="**** **** **** 1234" />
                        {errors.cardNumber && <p className="text-sm text-destructive">{errors.cardNumber.message}</p>}
                    </div>
                    <div className="grid grid-cols-3 gap-4">
                        <div className="grid gap-2">
                             <Label htmlFor="expiry-date">Expiry date</Label>
                             <Input id="expiry-date" {...register('expiryDate')} placeholder="MM/YY" />
                             {errors.expiryDate && <p className="text-sm text-destructive">{errors.expiryDate.message}</p>}
                        </div>
                        <div className="grid gap-2">
                             <Label htmlFor="cvc">CVC</Label>
                             <Input id="cvc" {...register('cvc')} placeholder="123" />
                             {errors.cvc && <p className="text-sm text-destructive">{errors.cvc.message}</p>}
                        </div>
                    </div>
                </div>
                 <div className="flex items-center justify-between mt-6">
                    <Button variant="ghost" asChild><Link href="/checkout">Back to Shipping</Link></Button>
                    <Button type="submit" size="lg">Continue to Summary</Button>
                </div>
              </form>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
