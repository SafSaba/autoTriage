import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { logEvent } from '@/lib/analytics';
import { Suspense } from 'react';
import { ShieldCheck, UserCheck } from 'lucide-react';

const formSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

type LoginFormValues = z.infer<typeof formSchema>;

function GoogleIcon() {
  return (
    <svg role="img" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2">
      <title>Google</title>
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
  );
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectPath = searchParams.get('redirect') || '/products';
  const { toast } = useToast();
  const { login, signInWithGoogle, loading } = useAuth();
  const form = useForm<LoginFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      email: '',
      password: '',
    },
  });

  async function onSubmit(data: LoginFormValues) {
    try {
      await login(data.email, data.password);
      logEvent('login', { method: 'email' });
      toast({
        title: 'Logged In',
        description: `Signed in as ${data.email}`,
      });
      router.push(redirectPath);
    } catch (error: any) {
      console.error('Login Error:', error);
    }
  }

  const handleQuickDemoLogin = async (email: string, password: string, targetPath?: string) => {
    form.setValue('email', email);
    form.setValue('password', password);
    try {
      await login(email, password);
      toast({
        title: 'Demo Account Active',
        description: `Signed in as ${email}`,
      });
      router.push(targetPath || redirectPath);
    } catch (error) {
      console.error('Demo Login Error:', error);
    }
  };

  const handleGoogleSignIn = async () => {
    try {
      await signInWithGoogle();
      logEvent('login', { method: 'google' });
      toast({
        title: 'Logged In',
        description: 'You have been successfully logged in with Google.',
      });
      router.push(redirectPath);
    } catch (error: any) {
      console.error('Google Sign-In Error:', error);
    }
  };

  return (
    <Card className="mx-auto max-w-md w-full">
      <CardHeader>
        <CardTitle className="text-2xl font-headline">Login</CardTitle>
        <CardDescription>Enter your email below to login to your account</CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4" noValidate>
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl>
                    <Input type="email" placeholder="m@example.com" data-testid="email-input" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <div className="flex items-center">
                    <FormLabel>Password</FormLabel>
                    <Link href="/forgot-password" className="ml-auto inline-block text-sm underline">
                      Forgot your password?
                    </Link>
                  </div>
                  <FormControl>
                    <Input type="password" data-testid="password-input" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button type="submit" className="w-full" data-testid="login-button" disabled={loading}>
              {loading ? 'Logging in...' : 'Login'}
            </Button>
          </form>
        </Form>

        <Button variant="outline" className="w-full mt-4" onClick={handleGoogleSignIn} disabled={loading}>
          <GoogleIcon />
          {loading ? 'Logging in...' : 'Login with Google (Demo Buyer)'}
        </Button>

        {/* Quick Demo Account Switcher for Manual & QA Testing */}
        <div className="mt-6 pt-4 border-t border-border">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Quick Demo Accounts (1-Click)
            </span>
            <Badge variant="outline" className="text-[10px]">SUT Seeded</Badge>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="text-xs justify-start"
              disabled={loading}
              data-testid="demo-login-buyer"
              onClick={() => handleQuickDemoLogin('buyer@autotriage.local', 'BuyerPassword123!')}
            >
              <UserCheck className="h-3.5 w-3.5 mr-1.5 text-primary" />
              Buyer 1
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="text-xs justify-start"
              disabled={loading}
              data-testid="demo-login-jane"
              onClick={() => handleQuickDemoLogin('jane.doe@autotriage.local', 'BuyerPassword123!')}
            >
              <UserCheck className="h-3.5 w-3.5 mr-1.5 text-blue-500" />
              Jane Doe
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="text-xs justify-start border border-destructive/30"
              disabled={loading}
              data-testid="demo-login-admin"
              onClick={() => handleQuickDemoLogin('admin@autotriage.local', 'AdminPassword123!', '/admin')}
            >
              <ShieldCheck className="h-3.5 w-3.5 mr-1.5 text-destructive" />
              Admin
            </Button>
          </div>
        </div>

        <div className="mt-4 text-center text-sm">
          Don&apos;t have an account?{' '}
          <Link href="/signup" className="underline">
            Sign up
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}

export default function LoginPage() {
  return (
    <div className="flex items-center justify-center min-h-[calc(100vh-8rem)] bg-secondary/50 py-12 px-4">
      <Suspense fallback={<div>Loading login...</div>}>
        <LoginForm />
      </Suspense>
    </div>
  );
}
