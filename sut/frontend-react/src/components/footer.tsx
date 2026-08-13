import Link from 'next/link';
import { Logo } from './Logo';

export function Footer() {
  return (
    <footer className="border-t bg-secondary/50 print:hidden">
      <div className="w-full px-4 md:px-8 py-8">
        <div className="flex flex-col md:flex-row justify-between items-center gap-6 mb-8">
          <Link href="/products" className="hover:opacity-80 transition-opacity">
            <Logo />
          </Link>
          <nav className="flex flex-wrap justify-center gap-x-8 gap-y-2 text-sm font-medium">
            <Link href="/products" className="text-muted-foreground hover:text-foreground transition-colors">
              Products
            </Link>
            <Link href="/cart" className="text-muted-foreground hover:text-foreground transition-colors">
              Cart
            </Link>
            <Link href="/orders" className="text-muted-foreground hover:text-foreground transition-colors">
              Orders
            </Link>
            <Link href="/contact" className="text-muted-foreground hover:text-foreground transition-colors">
              Contact
            </Link>
          </nav>
        </div>
        <div className="flex flex-col md:flex-row justify-between items-center gap-6 pt-8 border-t border-border/50">
          <p className="text-sm text-muted-foreground">
            © {new Date().getFullYear()} E-Automate SUT — AutoTriage Enterprise QA Platform.
          </p>
        </div>
      </div>
    </footer>
  );
}
