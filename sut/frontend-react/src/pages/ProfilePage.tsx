import { useAuth } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useToast } from '@/hooks/use-toast';
import { api } from '@/lib/api';

const profileSchema = z.object({
  firstName: z.string().min(2, 'First name must be at least 2 characters'),
  lastName: z.string().min(2, 'Last name must be at least 2 characters'),
  email: z.string().email().optional(),
  phoneNumber: z.string().optional(),
  shippingAddress: z.object({
    name: z.string().min(2, 'Full name is required'),
    line1: z.string().min(5, 'Address Line 1 is required'),
    line2: z.string().optional(),
    city: z.string().min(2, 'City is required'),
    state: z.string().min(2, 'State is required'),
    postal_code: z.string().min(4, 'Zip/Postal code is required'),
    country: z.string().min(2, 'Country is required'),
  }),
});

type ProfileFormValues = z.infer<typeof profileSchema>;

export default function ProfilePage() {
  const { user, loading: authLoading, refreshUser } = useAuth();
  const router = useRouter();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);

  const form = useForm<ProfileFormValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      firstName: '',
      lastName: '',
      email: '',
      phoneNumber: '',
      shippingAddress: {
        name: '',
        line1: '',
        line2: '',
        city: '',
        state: '',
        postal_code: '',
        country: '',
      },
    },
  });

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.push('/login');
      return;
    }

    const fetchProfile = async () => {
      setLoading(true);
      try {
        const data = await api.auth.getMe();
        const [first, ...last] = (data.displayName || user.displayName || '').split(' ');
        form.reset({
          firstName: first || '',
          lastName: last.join(' ') || '',
          email: data.email || user.email || '',
          phoneNumber: data.phoneNumber || '',
          shippingAddress: {
            name: data.shippingAddress?.name || data.displayName || '',
            line1: data.shippingAddress?.line1 || '',
            line2: data.shippingAddress?.line2 || '',
            city: data.shippingAddress?.city || '',
            state: data.shippingAddress?.state || '',
            postal_code: data.shippingAddress?.postal_code || '',
            country: data.shippingAddress?.country || '',
          },
        });
      } catch (error) {
        console.error('Error fetching profile:', error);
        toast({
          title: 'Error',
          description: 'Failed to load profile data.',
          variant: 'destructive',
        });
      } finally {
        setLoading(false);
      }
    };

    fetchProfile();
  }, [user, authLoading, router, form, toast]);

  const onSubmit = async (data: ProfileFormValues) => {
    if (!user) return;
    try {
      const displayName = `${data.firstName} ${data.lastName}`.trim();
      await api.auth.updateMe({
        displayName,
        phoneNumber: data.phoneNumber,
        shippingAddress: data.shippingAddress,
      });
      await refreshUser();
      toast({
        title: 'Address Updated',
        description: 'Your profile address has been successfully saved.',
      });
    } catch (error) {
      console.error('Error updating profile:', error);
      toast({
        title: 'Update Failed',
        description: 'Could not save address. Please try again.',
        variant: 'destructive',
      });
    }
  };

  if (authLoading || loading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="grid gap-8 md:grid-cols-3">
          <div className="md:col-span-2 space-y-4">
            <Skeleton className="h-40 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
          <div className="md:col-span-1 space-y-4">
            <Skeleton className="h-64 w-full" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold tracking-tight mb-8 font-headline">My Profile</h1>
      <form onSubmit={form.handleSubmit(onSubmit)}>
        <div className="grid gap-8 md:grid-cols-3">
          <div className="md:col-span-2">
            <Card>
              <CardHeader>
                <CardTitle>Personal Information</CardTitle>
                <CardDescription>Update your personal details here.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="firstName">First Name</Label>
                    <Input id="firstName" {...form.register('firstName')} />
                    {form.formState.errors.firstName && (
                      <p className="text-sm text-destructive">{form.formState.errors.firstName.message}</p>
                    )}
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="lastName">Last Name</Label>
                    <Input id="lastName" {...form.register('lastName')} />
                    {form.formState.errors.lastName && (
                      <p className="text-sm text-destructive">{form.formState.errors.lastName.message}</p>
                    )}
                  </div>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" {...form.register('email')} readOnly className="bg-muted" />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="phoneNumber">Phone Number</Label>
                  <Input id="phoneNumber" {...form.register('phoneNumber')} placeholder="+1 (555) 000-0000" />
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="md:col-span-1">
            <Card>
              <CardHeader>
                <CardTitle>Shipping Address</CardTitle>
                <CardDescription>Your default shipping address.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-2">
                  <Label htmlFor="addr-name">Recipient Name</Label>
                  <Input id="addr-name" {...form.register('shippingAddress.name')} />
                  {form.formState.errors.shippingAddress?.name && (
                    <p className="text-sm text-destructive">{form.formState.errors.shippingAddress.name.message}</p>
                  )}
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="addr-line1">Address Line 1</Label>
                  <Input id="addr-line1" {...form.register('shippingAddress.line1')} placeholder="123 Main St" />
                  {form.formState.errors.shippingAddress?.line1 && (
                    <p className="text-sm text-destructive">{form.formState.errors.shippingAddress.line1.message}</p>
                  )}
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="addr-line2">Address Line 2</Label>
                  <Input id="addr-line2" {...form.register('shippingAddress.line2')} placeholder="Apt 4B" />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="addr-city">City</Label>
                  <Input id="addr-city" {...form.register('shippingAddress.city')} />
                  {form.formState.errors.shippingAddress?.city && (
                    <p className="text-sm text-destructive">{form.formState.errors.shippingAddress.city.message}</p>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="addr-state">State</Label>
                    <Input id="addr-state" {...form.register('shippingAddress.state')} />
                    {form.formState.errors.shippingAddress?.state && (
                      <p className="text-sm text-destructive">{form.formState.errors.shippingAddress.state.message}</p>
                    )}
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="addr-zip">ZIP Code</Label>
                    <Input id="addr-zip" {...form.register('shippingAddress.postal_code')} />
                    {form.formState.errors.shippingAddress?.postal_code && (
                      <p className="text-sm text-destructive">{form.formState.errors.shippingAddress.postal_code.message}</p>
                    )}
                  </div>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="addr-country">Country</Label>
                  <Input id="addr-country" {...form.register('shippingAddress.country')} />
                  {form.formState.errors.shippingAddress?.country && (
                    <p className="text-sm text-destructive">{form.formState.errors.shippingAddress.country.message}</p>
                  )}
                </div>
                <Button type="submit" className="w-full">
                  Save Changes
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </form>
    </div>
  );
}
