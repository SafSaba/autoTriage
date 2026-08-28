import React from 'react';
import Link from 'next/link';
import {
  ShoppingCart,
  User,
  LogOut,
  LayoutDashboard,
  Menu,
  Moon,
  Sun,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Sheet,
  SheetContent,
  SheetTrigger,
  SheetClose,
} from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { useCart } from '@/hooks/use-cart';
import { Logo } from './Logo';
import { useAuth } from '@/hooks/use-auth';
import { useRouter, usePathname } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';
import { useTheme } from 'next-themes';
import { logEvent } from '@/lib/analytics';

export function Header() {
  const { cartCount } = useCart();
  const { user, loading, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const { toast } = useToast();
  const { setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  const handleLogout = async () => {
    logEvent('logout');
    try {
      await logout();
      toast({
        title: 'Logged Out',
        description: 'You have been successfully logged out.',
      });
      if (pathname === '/profile' || pathname === '/orders') {
        router.push('/products');
      }
    } catch {
      toast({
        title: 'Logout Failed',
        description: 'There was an error logging you out.',
        variant: 'destructive',
      });
    }
  };

  const handleNavClick = (label: string, url: string) => {
    logEvent('navigation_click', {
      link_text: label,
      link_url: url,
    });
  };

  const navLinks: { href: string; label: string }[] = [
    { href: '/products', label: 'E-Automate' },
    { href: '/orders', label: 'Orders' },
    { href: '/contact', label: 'Contact' },
  ];

  const isAdmin = user?.email === 'admin@autotriage.local' || user?.role === 'ADMIN';

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 print:hidden">
      <div className="w-full flex h-16 items-center justify-between px-4 lg:px-8">
        <div className="flex items-center gap-6">
          <Link href="/products" className="flex items-center gap-2" data-testid="logo" onClick={() => handleNavClick('Logo', '/products')}>
            <Logo />
          </Link>
        </div>

        <nav className="hidden md:flex flex-1 justify-center items-center gap-6 text-sm font-medium px-4">
          {navLinks.map((link) => (
            <Link
              key={link.label}
              href={link.href}
              onClick={() => handleNavClick(link.label, link.href)}
              className="text-muted-foreground transition-colors hover:text-foreground whitespace-nowrap"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-4">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon">
                <Sun className="h-[1.2rem] w-[1.2rem] rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
                <Moon className="absolute h-[1.2rem] w-[1.2rem] rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
                <span className="sr-only">Toggle theme</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setTheme('light')}>Light</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setTheme('dark')}>Dark</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setTheme('system')}>System</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Link href="/cart">
            <Button variant="ghost" size="icon" className="relative" data-testid="cart-button" onClick={() => handleNavClick('Cart', '/cart')}>
              <ShoppingCart className="h-5 w-5" />
              {mounted && cartCount > 0 && (
                <Badge
                  variant="destructive"
                  className="cart-item-count absolute -right-2 -top-2 h-6 w-6 rounded-full flex items-center justify-center text-xs"
                >
                  {cartCount}
                </Badge>
              )}
              <span className="sr-only">Shopping Cart</span>
            </Button>
          </Link>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="secondary" size="icon" className="rounded-full" data-testid="user-menu-button">
                <User className="h-5 w-5" />
                <span className="sr-only">Toggle user menu</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {loading ? (
                <DropdownMenuItem disabled>Loading...</DropdownMenuItem>
              ) : user ? (
                <>
                  <DropdownMenuLabel>{user.displayName || user.email || 'My Account'}</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {isAdmin && (
                    <DropdownMenuItem asChild>
                      <Link href="/admin" onClick={() => handleNavClick('Admin', '/admin')}>
                        <LayoutDashboard className="mr-2 h-4 w-4 text-destructive" />
                        <span className="text-destructive font-semibold">Admin Dashboard</span>
                      </Link>
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem asChild>
                    <Link href="/profile" onClick={() => handleNavClick('Profile', '/profile')}>
                      <LayoutDashboard className="mr-2 h-4 w-4" />
                      Profile
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href="/orders" onClick={() => handleNavClick('Orders', '/orders')}>
                      <ShoppingCart className="mr-2 h-4 w-4" />
                      Orders
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleLogout} className="cursor-pointer">
                    <LogOut className="mr-2 h-4 w-4" />
                    Logout
                  </DropdownMenuItem>
                </>
              ) : (
                <>
                  <DropdownMenuItem asChild>
                    <Link href={`/login?redirect=${pathname === '/' ? '/products' : pathname}`} onClick={() => handleNavClick('Login', '/login')}>
                      Login
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href={`/signup?redirect=${pathname === '/' ? '/products' : pathname}`} onClick={() => handleNavClick('Signup', '/signup')}>
                      Sign Up
                    </Link>
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>

          <Sheet>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="md:hidden">
                <Menu className="h-6 w-6" />
                <span className="sr-only">Toggle navigation menu</span>
              </Button>
            </SheetTrigger>
            <SheetContent side="right">
              <nav className="grid gap-6 text-lg font-medium mt-8">
                <SheetClose asChild>
                  <Link href="/products" className="flex items-center gap-2 text-lg font-semibold">
                    <Logo />
                  </Link>
                </SheetClose>
                {navLinks.map((link) => (
                  <SheetClose asChild key={link.label}>
                    <Link
                      href={link.href}
                      onClick={() => handleNavClick(link.label, link.href)}
                      className="hover:text-foreground text-muted-foreground"
                    >
                      {link.label}
                    </Link>
                  </SheetClose>
                ))}
              </nav>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
