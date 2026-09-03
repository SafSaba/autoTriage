import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/hooks/use-auth';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { api } from '@/lib/api';

const shippingSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters.'),
  line1: z.string().min(5, 'Address must be at least 5 characters.'),
  line2: z.string().optional(),
  city: z.string().min(2, 'City must be at least 2 characters.'),
  state: z.string().min(2, 'State must be at least 2 characters.'),
  postal_code: z.string().min(5, 'Postal code must be at least 5 characters.'),
  country: z.string().min(2, 'Country must be at least 2 characters.'),
});

type ShippingFormData = z.infer<typeof shippingSchema>;

export default function ShippingPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const { toast } = useToast();
  const [loadingProfile, setLoadingProfile] = useState(true);

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<ShippingFormData>({
    resolver: zodResolver(shippingSchema),
  });

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.push('/login?redirect=/checkout');
      return;
    }

    const loadProfileAddress = async () => {
      setLoadingProfile(true);
      try {
        const data = await api.auth.getMe();
        if (data.shippingAddress) {
          setValue('name', data.shippingAddress.name || data.displayName || '');
          setValue('line1', data.shippingAddress.line1 || '');
          setValue('line2', data.shippingAddress.line2 || '');
          setValue('city', data.shippingAddress.city || '');
          setValue('state', data.shippingAddress.state || '');
          setValue('postal_code', data.shippingAddress.postal_code || '');
          setValue('country', data.shippingAddress.country || '');
        } else if (user.displayName) {
          setValue('name', user.displayName);
        }
      } catch (error) {
        console.error('Error loading profile:', error);
        toast({
          title: 'Error',
          description: 'Could not load saved address.',
          variant: 'destructive',
        });
      } finally {
        setLoadingProfile(false);
      }
    };
    loadProfileAddress();
  }, [user, authLoading, router, setValue, toast]);

  const onSubmit = (data: ShippingFormData) => {
    localStorage.setItem('shippingAddress', JSON.stringify(data));
    router.push('/checkout/payment');
  };

  if (authLoading || loadingProfile) {
    return (
      <div className="mx-auto max-w-2xl py-8 px-4">
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-1/2" />
            <Skeleton className="h-4 w-3/4" />
          </CardHeader>
          <CardContent className="grid gap-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-12 w-full mt-4" />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl py-8 px-4">
      <Card>
        <CardHeader>
          <CardTitle>Shipping Information</CardTitle>
          <CardDescription>Enter the address where you want to receive your order.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="name">Full Name</Label>
              <Input id="name" {...register('name')} placeholder="John Doe" />
              {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
            </div>
            <div className="grid gap-2">
              <Label htmlFor="line1">Address</Label>
              <Input id="line1" {...register('line1')} placeholder="123 Main St" />
              {errors.line1 && <p className="text-sm text-destructive">{errors.line1.message}</p>}
            </div>
            <div className="grid gap-2">
              <Label htmlFor="line2">Apartment, suite, etc. (optional)</Label>
              <Input id="line2" {...register('line2')} placeholder="Apt 4B" />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="city">City</Label>
                <Input id="city" {...register('city')} placeholder="New York" />
                {errors.city && <p className="text-sm text-destructive">{errors.city.message}</p>}
              </div>
              <div className="grid gap-2">
                <Label htmlFor="state">State / Province</Label>
                <Input id="state" {...register('state')} placeholder="NY" />
                {errors.state && <p className="text-sm text-destructive">{errors.state.message}</p>}
              </div>
              <div className="grid gap-2">
                <Label htmlFor="postal_code">ZIP / Postal Code</Label>
                <Input id="postal_code" {...register('postal_code')} placeholder="10001" />
                {errors.postal_code && <p className="text-sm text-destructive">{errors.postal_code.message}</p>}
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="country">Country</Label>
              <Input id="country" {...register('country')} placeholder="United States" />
              {errors.country && <p className="text-sm text-destructive">{errors.country.message}</p>}
            </div>
            <Button type="submit" size="lg" className="w-full mt-4">
              Continue to Payment
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
