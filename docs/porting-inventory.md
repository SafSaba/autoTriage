# E-Automate → Spring Boot + React Porting Inventory (Checkpoint 1)

**Source Reference:** `reference/e-automate/` (read-only snapshot from E-Automate / `safwan-portoflio`)  
**Target SUT Directories:**
- Backend: `sut/backend-spring/` (Java 21, Spring Boot 3.3, Spring Data JPA, Spring Security JWT, PostgreSQL 16, Flyway)
- Frontend: `sut/frontend-react/` (Next.js / React 18, Tailwind CSS, shadcn/ui, typed REST client)
- E2E Suite: `sut/e2e/` (`pytest-playwright` + `pytest-bdd`)

---

## 1. Route & Page Inventory

| Route | Source File in `reference/e-automate` | Purpose & Current Behavior | Action in Port |
|---|---|---|---|
| `/` | `page.tsx` | Redirects to `/safwansaba` in portfolio | Change redirect to `/products` |
| `/products` | `products/page.tsx`, `products/layout.tsx` | Client-side catalog page. Calls `getProducts()`, renders `ProductCard` grid, client-side search (`name` + `description`), category checkboxes, price range slider (`0..maxPrice`), sort (`default`, `price-asc`, `price-desc`, `name-asc`, `name-desc`), mobile filter `Sheet`, and empty state (`"No products found"`). | **Port.** Replace `getProducts()` with `api.getProducts()`. Preserve all filter/sort UI and exact text (`"All Products"`, `"X products found"`, `"No products found"`). Add `data-testid` attributes. |
| `/products/[productId]` | `products/[productId]/page.tsx` | Product detail view with image `Carousel`, category label, title (`data-testid="product-name"`), price (`data-testid="product-price"`), 10% tax & total preview, description (`data-testid="product-description"`), `QuantitySelector` (`data-testid="quantity-selector"`), and `"Add to Cart"` button (`data-testid="add-to-cart-button"`). | **Port.** Replace Firestore `getDoc(doc(db, 'products', productId))` with `api.getProductById(productId)`. |
| `/cart` | `cart/page.tsx`, `cart/layout.tsx` | Displays cart items table (`cart-item-${id}`, `quantity-selector-${id}`, `remove-item-${id}`), guest session alert if unauthenticated, order summary (`#cart-subtotal`, 10% tax, `#cart-total`), and `"Proceed to Checkout"` button (redirects to `/login?redirect=/cart` if unauthenticated). | **Port.** Keep UI & locators intact. Back with `CartProvider` synced to REST `/api/cart` when authenticated (and localStorage for guest session). |
| `/checkout` | `checkout/page.tsx`, `checkout/layout.tsx` | Shipping address form validated with Zod (`name` >= 2, `line1` >= 5, `line2` optional, `city` >= 2, `state` >= 2, `postal_code` >= 5, `country` >= 2). Pre-fills from user profile `shippingAddress` in Firestore; saves draft to `localStorage.shippingAddress` and navigates to `/checkout/payment`. | **Port.** Pre-fill from `GET /api/me`. Keep exact Zod validation messages (`"Name must be at least 2 characters."`, `"Address must be at least 5 characters."`, etc.). |
| `/checkout/payment` | `checkout/payment/page.tsx` | Mock credit card form (tabs for Card, disabled PayPal/Klarna). Validates `cardName` (>= 2), `cardNumber` (16 digits), `expiryDate` (`MM/YY`), `cvc` (3-4 digits). Saves to `localStorage.paymentDetails` and navigates to `/checkout/summary`. | **Port.** Already uses a mock card form (no Stripe SDK). Keep validation and add mock card decline behavior (`0002` declined, `4242` approved) in backend `/api/orders`. |
| `/checkout/summary` | `checkout/summary/page.tsx` | Displays shipping address, card `last4`, item breakdown, subtotal, 10% tax, and total (`cartTotal * 1.1`). `"Place Order"` button writes to Firestore `orders`, clears cart & `localStorage`, and navigates to `/order-confirmation/[orderId]`. | **Port.** Replace `addDoc(collection(db, 'orders'), ...)` with `POST /api/orders`. |
| `/order-confirmation/[orderId]` | `order-confirmation/[orderId]/page.tsx` | Fetches order by ID, verifies ownership, displays `"Thank You for Your Order!"` and order ID with links to `/products` and `/orders/[orderId]`. | **Port.** Replace Firestore `getDoc` with `GET /api/orders/{orderId}`. |
| `/orders` | `orders/page.tsx` | Authenticated user's order history table sorted by `createdAt desc`, showing `#id.slice(-6)`, date, status badge, total, and `"View Details"` link. | **Port.** Replace Firestore query with `GET /api/orders`. |
| `/orders/[orderId]` | `orders/[orderId]/page.tsx` | Order detail page showing items ordered, shipping address, status badge, and total. | **Port.** Replace Firestore `getDoc` with `GET /api/orders/{orderId}`. |
| `/login` | `src/app/login/page.tsx` | Email + password login form (`data-testid="email-input"`, `data-testid="password-input"`, `data-testid="login-button"`). Supports `?redirect=` query param. | **Port.** Replace Firebase Auth `signInWithEmailAndPassword` with `POST /api/auth/login` (JWT). Remove Google OAuth popup button or stub it cleanly. |
| `/signup` | `signup/page.tsx` | Account registration form (`firstName`, `lastName`, `email`, `password` >= 12 chars with uppercase & special char). | **Port.** Replace Firebase Auth `createUserWithEmailAndPassword` with `POST /api/auth/signup`. |
| `/profile` | `src/app/profile/page.tsx` | Reads and updates user profile (`firstName`, `lastName`, `phoneNumber`, and default `shippingAddress`). | **Port.** Replace Firestore `users/{uid}` read/write with `GET /api/me` and `PUT /api/me`. |
| `/admin` | `src/app/admin/page.tsx` | Admin dashboard with two tabs: **Orders** (list all customer orders, update order status `pending`/`shipped`/`delivered`/`cancelled`) and **Products** (add new product, reset/seed initial products). | **Port.** Gate by `role === 'ADMIN'`. Replace Firestore & Firebase Storage calls with `GET /api/admin/orders`, `PUT /api/admin/orders/{id}/status`, `POST/PUT/DELETE /api/products`, and `POST /api/products/reset` (accept image URL string or mock upload instead of Firebase Storage). |
| `/admin/login` | `src/app/admin/login/page.tsx` | Admin login form checking `ADMIN` role before redirecting to `/admin`. | **Port.** Authenticate via `POST /api/auth/login` and verify `user.role === 'ADMIN'`. |
| `/forgot-password`, `/contact` | `src/app/forgot-password/page.tsx`, `src/app/contact/page.tsx` | Password reset request & contact message form. | **Optional / Stub.** Keep lightweight UI pages backed by mock/local REST endpoints (`POST /api/auth/forgot-password`, `POST /api/contact`) so header/login links never 404. |

---

## 2. Data Model Mapping (`types.ts` & Firestore → JPA / PostgreSQL)

### 2.1 `Product` (`backend/types.ts`, `backend/products.ts`)
| Field | TypeScript Type | Source Citation | PostgreSQL Column (`products`) | Notes |
|---|---|---|---|---|
| `id` | `string` | `types.ts#L3` | `id VARCHAR(64) PRIMARY KEY` | e.g., `'prod_001'` .. `'prod_008'` |
| `name` | `string` | `types.ts#L4` | `name VARCHAR(255) NOT NULL` | |
| `description` | `string` | `types.ts#L5` | `description TEXT NOT NULL` | |
| `price` | `number` | `types.ts#L6` | `price NUMERIC(10,2) NOT NULL` | Serialized as JSON number |
| `images` | `string[]` | `types.ts#L7` | `images JSONB NOT NULL` (or `TEXT[]`) | Array of image URLs |
| `category` | `string` | `types.ts#L8` | `category VARCHAR(100) NOT NULL` | `'Watches'`, `'Laptops'`, `'Smartphones'` |
| `dataAiHint` | `string` | `types.ts#L9` | `data_ai_hint VARCHAR(255)` | Preserved for `data-ai-hint` DOM attribute |
| `stock` | `number` | `types.ts#L10` | `stock INTEGER NOT NULL DEFAULT 0` | |

### 2.2 `UserProfile` & Auth (`backend/types.ts`, `src/app/profile/page.tsx`)
| Field | TypeScript Type | Source Citation | PostgreSQL Column (`users`) | Notes |
|---|---|---|---|---|
| `uid` | `string` | `types.ts#L39` | `id UUID PRIMARY KEY` (serialized as `uid`) | |
| `email` | `string` | `types.ts#L40` | `email VARCHAR(255) UNIQUE NOT NULL` | |
| `passwordHash` | *(Firebase Auth)* | `login/page.tsx` | `password_hash VARCHAR(255) NOT NULL` | BCrypt hash |
| `role` | `'USER' \| 'ADMIN'` | `firestore.rules#L10` | `role VARCHAR(32) NOT NULL DEFAULT 'USER'` | Replaces hardcoded `email == 'admin@autotriage.local'` |
| `displayName` | `string?` | `types.ts#L41` | `display_name VARCHAR(255)` | Combined `firstName` + `lastName` |
| `phoneNumber` | `string?` | `types.ts#L42` | `phone_number VARCHAR(64)` | |
| `shippingAddress` | `ShippingAddress?` | `types.ts#L43` | `shipping_address JSONB` | Embedded JSONB matching `ShippingAddress` |
| `createdAt` | `any` | `types.ts#L44` | `created_at TIMESTAMPTZ NOT NULL` | |
| `updatedAt` | `any` | `types.ts#L45` | `updated_at TIMESTAMPTZ NOT NULL` | |

### 2.3 `CartItem` (`backend/types.ts`, `api/cart/route.ts`, `CartProvider.tsx`)
| Field | TypeScript Type | Source Citation | PostgreSQL Column (`cart_items`) | Notes |
|---|---|---|---|---|
| `userId` | `string` | `api/cart/route.ts#L12` | `user_id UUID REFERENCES users(id)` | Composite unique `(user_id, product_id)` |
| `product` | `Product` | `types.ts#L14` | `product_id VARCHAR(64) REFERENCES products(id)` | Hydrated to full `Product` in DTO |
| `quantity` | `number` | `types.ts#L15` | `quantity INTEGER NOT NULL CHECK (quantity >= 1)` | Duplicate additions merge quantity |

### 2.4 `Order` & `ShippingAddress` (`backend/types.ts`, `checkout/summary/page.tsx`)
| Field | TypeScript Type | Source Citation | PostgreSQL Column (`orders` / `order_items`) | Notes |
|---|---|---|---|---|
| `id` | `string` | `types.ts#L19` | `id VARCHAR(64) PRIMARY KEY` | e.g., UUID or `ORD-...` |
| `userId` | `string` | `types.ts#L20` | `user_id UUID REFERENCES users(id)` | |
| `items` | `CartItem[]` | `types.ts#L21` | `order_items` table (`order_id`, `product_id`, `quantity`, `unit_price`) | Hydrated as `CartItem[]` |
| `total` | `number` | `types.ts#L22` | `total NUMERIC(10,2) NOT NULL` | `round(subtotal * 1.10, 2)` |
| `status` | `string` | `types.ts#L23` | `status VARCHAR(32) NOT NULL` | `'Processing'`, `'pending'`, `'shipped'`, `'delivered'`, `'cancelled'` |
| `createdAt` | `number \| string` | `types.ts#L24`, `orders/page.tsx#L127` | `created_at TIMESTAMPTZ NOT NULL` | Note: `orders/page.tsx` formats `new Date(order.createdAt * 1000)`—return epoch seconds or support both in frontend |
| `shippingAddress` | `ShippingAddress` | `types.ts#L25` | `shipping_address JSONB NOT NULL` | `{ name, line1, line2, city, state, postal_code, country }` |
| `paymentDetails` | `{ method, last4 }` | `checkout/summary/page.tsx#L87` | `payment_details JSONB` | `{ method: 'Card', last4: '4242' }` |

---

## 3. Roles & Permissions (from `firestore.rules`)

| Resource | Firestore Rule (`firestore.rules`) | Spring Security / Controller Rule |
|---|---|---|
| `products` (read) | `allow read: if true;` (L9) | `permitAll()` on `GET /api/products/**` |
| `products` (write) | `allow write: if request.auth.token.email == 'admin@autotriage.local';` (L10) | `@PreAuthorize("hasRole('ADMIN')")` on `POST/PUT/DELETE /api/products/**` |
| `users/{userId}` | `allow read, write: if request.auth.uid == userId;` (L27) | Authenticated user accesses own profile via `GET/PUT /api/me`; cart via `/api/cart/**` |
| `orders` (create) | `allow create: if request.auth.uid == request.resource.data.userId;` (L32) | Authenticated user creates order via `POST /api/orders` (`userId` taken from JWT principal) |
| `orders` (read) | `allow read: if resource.data.userId == request.auth.uid \|\| admin` (L33) | `GET /api/orders` returns current user's orders; `GET /api/orders/{id}` checks ownership or `ROLE_ADMIN`; `GET /api/admin/orders` requires `ROLE_ADMIN` |
| `orders` (update) | `allow update: if admin` (L34) | `PUT /api/admin/orders/{id}/status` requires `ROLE_ADMIN` |

**Seeded Accounts for `V2__seed.sql`:**
- **Admin:** `admin@autotriage.local` (and alias `admin@autotriage.local`) with role `ADMIN`
- **Buyer 1:** `buyer@autotriage.local` with role `USER`
- **Buyer 2:** `jane.doe@autotriage.local` with role `USER`

---

## 4. Every Firebase / External Call & Its REST Replacement

| File | Current Firebase / External Call | Replacement REST Endpoint (`src/lib/api.ts`) |
|---|---|---|
| `backend/products.ts` | `getDocs(collection(db, 'products'))`, `where('category', '==', category)` | `GET /api/products?category=&search=&sort=` |
| `backend/products.ts` & `products/[productId]/page.tsx` | `getDoc(doc(db, 'products', id))` | `GET /api/products/{id}` |
| `backend/products.ts` | `getCategories()` scanning `products` collection | `GET /api/products/categories` |
| `src/components/AuthProvider.tsx` | `onAuthStateChanged`, `signInWithEmailAndPassword`, `createUserWithEmailAndPassword`, `signOut`, `sendPasswordResetEmail` | `POST /api/auth/login`, `POST /api/auth/signup`, `GET /api/me`, `POST /api/auth/logout`, `POST /api/auth/forgot-password` |
| `api/cart/route.ts` & `src/components/CartProvider.tsx` | `getDoc(doc(db, 'users', userId))`, `setDoc(..., { cart: arrayUnion(...) })`, `updateDoc(..., { cart: [] })` | `GET /api/cart`, `POST /api/cart/items`, `PUT /api/cart/items/{productId}`, `DELETE /api/cart/items/{productId}`, `DELETE /api/cart` |
| `checkout/page.tsx` & `src/app/profile/page.tsx` | `getDoc(doc(db, 'users', user.uid))`, `setDoc(doc(db, 'users', user.uid), profileData, { merge: true })` | `GET /api/me`, `PUT /api/me` |
| `checkout/summary/page.tsx` | `addDoc(collection(db, 'orders'), newOrder)` | `POST /api/orders` |
| `order-confirmation/[orderId]/page.tsx` & `orders/[orderId]/page.tsx` | `getDoc(doc(db, 'orders', params.orderId))` | `GET /api/orders/{orderId}` |
| `orders/page.tsx` | `getDocs(query(collection(db, 'orders'), where('userId', '==', user.uid), orderBy('createdAt', 'desc')))` | `GET /api/orders` |
| `src/app/admin/page.tsx` | `getDocs(query(collection(db, 'orders'), orderBy('createdAt', 'desc')))` | `GET /api/admin/orders` |
| `src/app/admin/page.tsx` | `updateDoc(doc(db, 'orders', orderId), { status: newStatus })` | `PUT /api/admin/orders/{orderId}/status` |
| `src/app/admin/page.tsx` | `uploadBytes` + `setDoc(doc(collection(db, 'products'), productId), newProduct)` | `POST /api/products` (with image URL or mock upload) |
| `src/app/admin/page.tsx` | Loop `setDoc` over `initialProducts` | `POST /api/products/reset` |
| `src/lib/analytics.ts` | Firebase Analytics + `/api/analytics/track` | Replace with lightweight no-op / console logger in `src/lib/analytics.ts` (no external network calls) |

---

## 5. Reusable Components & Hooks to Keep

- **Components (`src/components/`):**
  - `ProductCard.tsx`, `QuantitySelector.tsx`, `Header.tsx` (simplified nav links for the shop: Products, Cart, Orders, Profile, Admin), `Footer.tsx`, `Logo.tsx`, `Providers.tsx`, `AuthProvider.tsx`, `CartProvider.tsx`
  - `ui/*` (shadcn/ui primitives: `button`, `card`, `input`, `label`, `select`, `slider`, `checkbox`, `sheet`, `table`, `tabs`, `toast`, `toaster`, `badge`, `alert`, `separator`, `skeleton`, `carousel`, `dropdown-menu`, `form`)
- **Hooks (`src/hooks/`):**
  - `use-auth.ts`, `use-cart.ts`, `use-toast.ts`, `use-mobile.tsx`

---

## 6. What to Drop from the SUT (and Why)

1. **Portfolio & Personal Branding Pages:** `/safwansaba`, `/neural-profile`, `/ask-ai-safwan`, `/resume`, `/quality-dashboard`, `/automation-lab`, `/sentinel-*`, `/glassbox`. (Not part of the E-Automate shop SUT.)
2. **Portfolio API Routes (`reference/e-automate/api/*` except shop contracts):**
   - `api/cortex/*`, `api/sentinel/*`, `api/sentinel-studio/*`, `api/sentinel-v2/*`, `api/genkit/*`, `api/playwright/*`, `api/workspaces/*`, `api/defects/*`, `api/test-stats/*`, `api/community/*`, `api/analytics/*`, `api/journal/*`, `api/chat/*`.
   - *Note:* These stay in `reference/e-automate/api/` as reference inspiration for Sprints 2–5 (MCP runner & healer), but are **excluded** from `sut/frontend-react`.
3. **`SystemHealth` and `TestRun` in `types.ts`:** Belong to the portfolio Quality Dashboard, not the shop domain.
4. **Firebase, Genkit & Heavy Portfolio Packages:** Remove `firebase`, `firebase-admin`, `firebase-functions`, `react-firebase-hooks`, `genkit`, `@genkit-ai/*`, `@google/generative-ai`, `@monaco-editor/react`, `puppeteer`, `reactflow`, `swagger-ui-react`, `jspdf`, `html2canvas` from `sut/frontend-react/package.json`.

---

## 7. Product Datasets Resolution

- **Dataset A (`backend/products.ts` — KEEP):** 8 rich products (`prod_001` through `prod_008`: Chronograph Excellence, Titanium Smartwatch, Ultra-Slim Laptop, Gaming Beast Laptop, Galaxy Pro Smartphone, Pixel Perfect Smartphone, Minimalist Digital Watch, Creator Pro Laptop) across categories `Watches`, `Laptops`, `Smartphones`. Used by `/products`, `/products/[productId]`, and `/admin`.
- **Dataset B (`api/products/route.ts` — DROP):** 5 in-memory sci-fi items (`id: 1..5`, Quantum CPU, Neural Link VR, etc.). Unused by the main shop UI. Dropped to ensure a single canonical ground truth in PostgreSQL (`V2__seed.sql`).

---

## 8. Natural Weaknesses Fixed in Clean Baseline

To ensure every failure AutoTriage discovers is a controlled `BUG_01..BUG_10` flag:
1. **Duplicate Cart Lines (`api/cart/route.ts`):** The legacy Firestore route used `arrayUnion(cartItem)` with `addedAt: Date.now()`, creating duplicate rows when adding the same product twice. **Fix:** The Spring Boot cart service and React `CartProvider` merge quantities by `(userId, productId)`.
2. **Unvalidated Quantity:** Legacy `POST /api/cart` defaulted missing quantity to `1` without rejecting `quantity <= 0`. **Fix:** Enforce `@Min(1)` on `POST /api/cart/items` (returns `400 Bad Request` if `quantity < 1`).
3. **`createdAt` Timestamp Formatting (`orders/page.tsx` & `orders/[orderId]/page.tsx`):** The UI multiplies `order.createdAt * 1000` assuming Firestore epoch seconds. **Fix:** Have the Spring Boot `OrderDto` return `createdAt` as epoch seconds (or normalize in `api.ts`) so dates render accurately (e.g., `10/21/2026`) rather than `Invalid Date` or `1970`.
4. **Next.js 15 Async `params` in Client Components:** `products/[productId]/page.tsx` awaits `params` inside `useEffect`, whereas `orders/[orderId]/page.tsx` and `order-confirmation/[orderId]/page.tsx` access `params.orderId` synchronously. **Fix:** Standardize `useParams()` or `React.use(params)` across all dynamic routes so Next.js 15/16 never throws sync-dynamic-API warnings.

---

## 9. Open Questions (Resolved)

- **What was inside `data/backend`?** Resolved: It contained `types.ts` and `products.ts` (the 8 seed products).
- **Does checkout use Stripe?** Resolved: `checkout/payment/page.tsx` is already a self-contained mock card form using `react-hook-form` + `zod`. No Stripe SDK needs to be ripped out.
