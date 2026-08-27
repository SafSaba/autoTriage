import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/use-auth';
import { useRouter } from 'next/navigation';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { Order, Product } from '@/lib/types';
import { api, ContactMessage } from '@/lib/api';
import { Trash2, RefreshCw, Bug, Package, ShoppingBag, MessageSquare } from 'lucide-react';

const ADMIN_EMAIL = 'admin@autotriage.local';

const AdminPage = () => {
  const { user, loading } = useAuth();
  const router = useRouter();
  const { toast } = useToast();

  // New Product State
  const [productName, setProductName] = useState('');
  const [productId, setProductId] = useState('');
  const [productDescription, setProductDescription] = useState('');
  const [productPrice, setProductPrice] = useState('');
  const [productCategory, setProductCategory] = useState('Watches');
  const [productStock, setProductStock] = useState('10');
  const [productImageUrl, setProductImageUrl] = useState('https://placehold.co/600x600.png');
  const [isSeeding, setIsSeeding] = useState(false);

  // Data States
  const [orders, setOrders] = useState<Order[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [messages, setMessages] = useState<ContactMessage[]>([]);
  const [bugFlags, setBugFlags] = useState<Record<string, boolean>>({});
  const [loadingData, setLoadingData] = useState(true);

  useEffect(() => {
    if (productName) {
      const slug = productName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '');
      setProductId(slug);
    }
  }, [productName]);

  const isAdmin = user?.email === ADMIN_EMAIL || user?.role === 'ADMIN';

  useEffect(() => {
    if (!loading) {
      if (!user) {
        router.push('/login');
      } else if (!isAdmin) {
        toast({
          title: 'Access Denied',
          description: 'You do not have permission to view the Admin Dashboard.',
          variant: 'destructive',
        });
        router.push('/products');
      }
    }
  }, [user, loading, isAdmin, router, toast]);

  const loadAdminData = useCallback(async () => {
    if (!user || !isAdmin) {
      setLoadingData(false);
      return;
    }
    setLoadingData(true);
    try {
      const [fetchedOrders, fetchedProducts, fetchedMessages, fetchedBugs] = await Promise.all([
        api.orders.adminList(),
        api.products.list(),
        api.contact.adminList().catch(() => []),
        api.bugs.getFlags().catch(() => ({})),
      ]);
      setOrders(fetchedOrders);
      setProducts(fetchedProducts);
      setMessages(fetchedMessages);
      setBugFlags(fetchedBugs);
    } catch (error) {
      console.error('Error loading admin dashboard:', error);
      toast({
        title: 'Error loading admin data',
        description: 'Could not load all admin resources.',
        variant: 'destructive',
      });
    } finally {
      setLoadingData(false);
    }
  }, [user, isAdmin, toast]);

  useEffect(() => {
    if (!loading) loadAdminData();
  }, [loading, loadAdminData]);

  const handleStatusUpdate = async (orderId: string, newStatus: string) => {
    try {
      await api.orders.adminUpdateStatus(orderId, newStatus);
      setOrders(orders.map((o) => (o.id === orderId ? { ...o, status: newStatus } : o)));
      // Reload products in case order cancellation restored stock
      const updatedProducts = await api.products.list();
      setProducts(updatedProducts);
      toast({
        title: 'Order Updated',
        description: `Order #${orderId.slice(0, 8)} status changed to ${newStatus}`,
      });
    } catch (error) {
      console.error('Error updating status:', error);
      toast({
        title: 'Update Failed',
        description: 'Could not update order status.',
        variant: 'destructive',
      });
    }
  };

  const handleAddProduct = async () => {
    if (!productName || !productDescription || !productPrice || !productId) {
      toast({
        title: 'Validation Error',
        description: 'Please fill in all fields.',
        variant: 'destructive',
      });
      return;
    }

    setIsSeeding(true);
    try {
      await api.products.create({
        id: productId,
        name: productName,
        description: productDescription,
        price: parseFloat(productPrice),
        images: [productImageUrl || 'https://placehold.co/600x600.png'],
        category: productCategory || 'New Arrivals',
        stock: parseInt(productStock, 10) || 10,
        dataAiHint: productName.toLowerCase(),
      });

      toast({
        title: 'Product Published',
        description: `${productName} is now live (ID: ${productId})`,
      });

      setProductName('');
      setProductId('');
      setProductDescription('');
      setProductPrice('');
      setProducts(await api.products.list());
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to publish product.',
        variant: 'destructive',
      });
    } finally {
      setIsSeeding(false);
    }
  };

  const handleDeleteProduct = async (id: string, name: string) => {
    try {
      await api.products.delete(id);
      setProducts(products.filter((p) => p.id !== id));
      toast({
        title: 'Product Deleted',
        description: `${name} (${id}) has been removed.`,
      });
    } catch (error: any) {
      toast({
        title: 'Delete Failed',
        description: error.message || 'Could not delete product (it may be referenced by existing orders).',
        variant: 'destructive',
      });
    }
  };

  const handleSeedProducts = async () => {
    setIsSeeding(true);
    try {
      const resetList = await api.products.reset();
      setProducts(resetList);
      toast({
        title: 'Catalog Reset',
        description: 'The 8 canonical E-Automate products and stock levels have been restored.',
      });
    } catch {
      toast({
        title: 'Error',
        description: 'Failed to reset products.',
        variant: 'destructive',
      });
    } finally {
      setIsSeeding(false);
    }
  };

  const handleToggleBugFlag = async (flagKey: string, enabled: boolean) => {
    try {
      const updated = await api.bugs.updateFlags({ [flagKey]: enabled });
      setBugFlags(updated);
      toast({
        title: enabled ? `Bug Flag Enabled: ${flagKey}` : `Bug Flag Disabled: ${flagKey}`,
        description: enabled
          ? 'Fault injection is now active for AutoTriage reproduction.'
          : 'Baseline clean behavior restored.',
        variant: enabled ? 'destructive' : 'default',
      });
    } catch (error: any) {
      toast({
        title: 'Error updating bug flag',
        description: error.message || 'Could not toggle bug flag.',
        variant: 'destructive',
      });
    }
  };

  if (loading || !user || !isAdmin) {
    return (
      <div className="container mx-auto px-4 py-8">
        <Skeleton className="h-8 w-48 mb-6" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold font-headline">Admin Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Manage orders, product inventory, customer messages, and AutoTriage fault-injection flags.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={loadAdminData}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh Data
        </Button>
      </div>

      <Tabs defaultValue="orders" className="w-full">
        <TabsList className="grid w-full grid-cols-4 max-w-2xl">
          <TabsTrigger value="orders">
            <ShoppingBag className="h-4 w-4 mr-2" />
            Orders ({orders.length})
          </TabsTrigger>
          <TabsTrigger value="products">
            <Package className="h-4 w-4 mr-2" />
            Products ({products.length})
          </TabsTrigger>
          <TabsTrigger value="messages">
            <MessageSquare className="h-4 w-4 mr-2" />
            Messages ({messages.length})
          </TabsTrigger>
          <TabsTrigger value="bugs">
            <Bug className="h-4 w-4 mr-2" />
            Bug Flags
          </TabsTrigger>
        </TabsList>

        {/* ORDERS TAB */}
        <TabsContent value="orders" className="mt-6">
          <div className="bg-card rounded-lg border shadow-sm p-6">
            <h2 className="text-xl font-semibold mb-4">All Customer Orders ({orders.length})</h2>
            {loadingData ? (
              <Skeleton className="h-32 w-full" />
            ) : orders.length === 0 ? (
              <p className="text-muted-foreground py-8 text-center">No customer orders placed yet.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Order ID</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Total</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {orders.map((order) => (
                    <TableRow key={order.id}>
                      <TableCell className="font-mono text-xs">#{order.id.slice(0, 8)}</TableCell>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="font-medium">{order.shippingAddress?.name || 'Guest'}</span>
                          <span className="text-xs text-muted-foreground">{order.userId}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        {order.createdAt ? new Date(order.createdAt * 1000).toLocaleDateString() : 'N/A'}
                      </TableCell>
                      <TableCell>${order.total.toFixed(2)}</TableCell>
                      <TableCell>
                        <Badge variant={order.status === 'delivered' ? 'default' : 'secondary'}>
                          {order.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Select
                          value={order.status}
                          onValueChange={(val) => handleStatusUpdate(order.id, val)}
                        >
                          <SelectTrigger className="w-[140px]">
                            <SelectValue placeholder="Status" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Processing">Processing</SelectItem>
                            <SelectItem value="pending">Pending</SelectItem>
                            <SelectItem value="shipped">Shipped</SelectItem>
                            <SelectItem value="delivered">Delivered</SelectItem>
                            <SelectItem value="cancelled">Cancelled</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </TabsContent>

        {/* PRODUCTS TAB */}
        <TabsContent value="products" className="mt-6 space-y-6">
          <div className="bg-card rounded-lg border shadow-sm p-6">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-semibold">Current Catalog Inventory ({products.length})</h2>
              <Button onClick={handleSeedProducts} disabled={isSeeding} variant="outline">
                {isSeeding ? 'Resetting...' : 'Reset Product Data (8 Seeded)'}
              </Button>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Price</TableHead>
                  <TableHead>Stock</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {products.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-mono text-xs">{p.id}</TableCell>
                    <TableCell className="font-medium">{p.name}</TableCell>
                    <TableCell>{p.category}</TableCell>
                    <TableCell>${p.price.toFixed(2)}</TableCell>
                    <TableCell>
                      <Badge variant={p.stock > 5 ? 'secondary' : p.stock > 0 ? 'outline' : 'destructive'}>
                        {p.stock} in stock
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDeleteProduct(p.id, p.name)}
                        title="Delete product"
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="bg-card rounded-lg border shadow-sm p-6">
            <div className="space-y-4 max-w-lg">
              <h3 className="text-lg font-medium">Add / Upsert Product</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Product Name</label>
                  <Input
                    value={productName}
                    onChange={(e) => setProductName(e.target.value)}
                    placeholder="e.g. Super Watch"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Product ID</label>
                  <Input
                    value={productId}
                    onChange={(e) => setProductId(e.target.value)}
                    placeholder="e.g. super-watch"
                  />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Price ($)</label>
                  <Input
                    type="number"
                    value={productPrice}
                    onChange={(e) => setProductPrice(e.target.value)}
                    placeholder="299.99"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Stock</label>
                  <Input
                    type="number"
                    value={productStock}
                    onChange={(e) => setProductStock(e.target.value)}
                    placeholder="10"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Category</label>
                  <Input
                    value={productCategory}
                    onChange={(e) => setProductCategory(e.target.value)}
                    placeholder="Watches"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Description</label>
                <Textarea
                  value={productDescription}
                  onChange={(e) => setProductDescription(e.target.value)}
                  placeholder="Detailed product description..."
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Image URL</label>
                <Input
                  value={productImageUrl}
                  onChange={(e) => setProductImageUrl(e.target.value)}
                  placeholder="https://placehold.co/600x600.png"
                />
              </div>
              <Button onClick={handleAddProduct} disabled={isSeeding}>
                Add Product
              </Button>
            </div>
          </div>
        </TabsContent>

        {/* SUPPORT MESSAGES TAB */}
        <TabsContent value="messages" className="mt-6">
          <div className="bg-card rounded-lg border shadow-sm p-6">
            <h2 className="text-xl font-semibold mb-4">Customer Contact Messages ({messages.length})</h2>
            {messages.length === 0 ? (
              <p className="text-muted-foreground py-8 text-center">
                No messages submitted via /contact yet.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>ID</TableHead>
                    <TableHead>From Email</TableHead>
                    <TableHead>Subject</TableHead>
                    <TableHead>Message</TableHead>
                    <TableHead>Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {messages.map((m) => (
                    <TableRow key={m.id}>
                      <TableCell className="font-mono text-xs">{m.id}</TableCell>
                      <TableCell>{m.email}</TableCell>
                      <TableCell className="font-medium">{m.subject}</TableCell>
                      <TableCell className="max-w-md truncate">{m.message}</TableCell>
                      <TableCell>{new Date(m.createdAt * 1000).toLocaleString()}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </TabsContent>

        {/* AUTOTRIAGE BUG FLAGS TAB */}
        <TabsContent value="bugs" className="mt-6">
          <div className="bg-card rounded-lg border shadow-sm p-6 space-y-6">
            <div>
              <h2 className="text-xl font-semibold">AutoTriage Runtime Fault-Injection Flags</h2>
              <p className="text-sm text-muted-foreground mt-1">
                All flags default to <strong>OFF</strong> so the baseline SUT is 100% green. Toggle any flag at runtime to inject deterministic bugs for AutoTriage agent reproduction.
              </p>
            </div>
            <div className="space-y-4">
              {[
                {
                  key: 'BUG_OFF_BY_ONE_DISCOUNT',
                  title: 'BUG_OFF_BY_ONE_DISCOUNT',
                  desc: 'Applies a 0.99x multiplier instead of 1.10x tax multiplier during order checkout total calculation.',
                },
                {
                  key: 'BUG_STALE_CART_CACHE',
                  title: 'BUG_STALE_CART_CACHE',
                  desc: 'Skips database deletion when removing items or clearing the cart, causing removed items to reappear.',
                },
                {
                  key: 'BUG_NULL_SHIPPING_NPE',
                  title: 'BUG_NULL_SHIPPING_NPE',
                  desc: 'Dereferences shippingAddress.line2.trim() without null-check on POST /api/orders, throwing HTTP 500 when Apartment/Suite is omitted.',
                },
              ].map((flag) => (
                <div
                  key={flag.key}
                  className="flex items-center justify-between p-4 rounded-lg border bg-secondary/20"
                >
                  <div className="space-y-1 pr-4">
                    <div className="font-mono text-sm font-semibold flex items-center gap-2">
                      {flag.title}
                      <Badge variant={bugFlags[flag.key] ? 'destructive' : 'secondary'}>
                        {bugFlags[flag.key] ? 'ACTIVE (BUG ON)' : 'CLEAN (OFF)'}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">{flag.desc}</p>
                  </div>
                  <Switch
                    checked={Boolean(bugFlags[flag.key])}
                    onCheckedChange={(checked) => handleToggleBugFlag(flag.key, checked)}
                    data-testid={`toggle-${flag.key}`}
                  />
                </div>
              ))}
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default AdminPage;
