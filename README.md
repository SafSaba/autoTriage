# AutoTriage — E-Automate System Under Test (SUT)

This guide covers how to run, browse, and manually test the ported **E-Automate** application (React 18 + Vite frontend on `:5173` and Spring Boot 3.4 REST API on `:8080`), including **Swagger UI** for interactive API testing and end-to-end UI flows.

---

## 1. Quick Start (Run Locally Without Docker)

If Docker Desktop is not running, you can start the Spring Boot backend (using the built-in `dev` H2 PostgreSQL-compatible profile with Flyway migrations and seeded data) and the Vite React frontend in two terminals:

### Terminal 1 — Start Spring Boot Backend (`:8080`)
```bash
cd /Users/lion/Projects/autotriage/sut/backend-spring
mvn spring-boot:run -Dspring-boot.run.profiles=dev
```
*(Or run the packaged JAR directly:)*
```bash
java -jar /Users/lion/Projects/autotriage/sut/backend-spring/target/shop-0.1.0-SNAPSHOT.jar --spring.profiles.active=dev
```

### Terminal 2 — Start React Vite Frontend (`:5173`)
```bash
cd /Users/lion/Projects/autotriage/sut/frontend-react
npm run dev
```

---

## 2. Quick Start with Docker Compose (PostgreSQL 16 + Backend + Frontend)

If Docker Desktop is running:
```bash
cd /Users/lion/Projects/autotriage
docker compose up --build -d
```
To stop:
```bash
docker compose down
```

---

## 3. URLs & Interactive Swagger UI

| Service | URL | Description |
| :--- | :--- | :--- |
| **React Frontend (UI)** | [http://localhost:5173](http://localhost:5173) | Full E-Automate Shop UI (`/products`, `/cart`, `/checkout`, `/orders`, `/profile`, `/admin`) |
| **Swagger UI (Backend `:8080`)** | [http://localhost:8080/swagger-ui/index.html](http://localhost:8080/swagger-ui/index.html) | Interactive OpenAPI 3.0 documentation & "Try it out" runner with **Authorize (Bearer JWT)** button |
| **Swagger UI (via Frontend `:5173`)** | [http://localhost:5173/swagger-ui/index.html](http://localhost:5173/swagger-ui/index.html) | Same Swagger UI proxied through Vite/Nginx |
| **OpenAPI 3.0 JSON Spec** | [http://localhost:8080/v3/api-docs](http://localhost:8080/v3/api-docs) | Raw OpenAPI JSON specification |
| **Spring Actuator Health** | [http://localhost:8080/actuator/health](http://localhost:8080/actuator/health) | Spring Boot readiness & DB health check |
| **Custom Health Endpoint** | [http://localhost:8080/api/health](http://localhost:8080/api/health) | Lightweight service health status |

---

## 4. Seeded Test Accounts

Both Flyway (`V1__init.sql`, `V2__seed.sql`) and `DataSeederConfig` automatically seed **8 products** (`prod_001` through `prod_008`) and **4 user accounts** on startup:

| Role | Email | Password | Use Case |
| :--- | :--- | :--- | :--- |
| **Customer (`USER`)** | `buyer@autotriage.local` | `BuyerPassword123!` | Standard shopping, cart, checkout, order history, profile updates |
| **Customer (`USER`)** | `jane.doe@autotriage.local` | `BuyerPassword123!` | Secondary customer account (verify order isolation between users) |
| **Admin (`ADMIN`)** | `admin@autotriage.local` | `AdminPassword123!` | Full Admin Dashboard (`/admin`), view all customer orders, update order status, add/reset products |
| **Admin (`ADMIN`)** | `admin@safwan.com` | `admin123` | Secondary admin account for API testing |

---

## 5. How to Test APIs in Swagger UI (`http://localhost:8080/swagger-ui/index.html`)

1. **Open Swagger UI:** Navigate to [http://localhost:8080/swagger-ui/index.html](http://localhost:8080/swagger-ui/index.html).
2. **Test Public Endpoints (No Auth Needed):**
   - Expand **`product-controller` → `GET /api/products`** → Click **Try it out** → Set `category = Laptops` and `sort = price_asc` → Click **Execute**.
   - Expand **`GET /api/products/{id}`** → Enter `prod_001` → Click **Execute**.
3. **Authenticate with JWT in Swagger UI:**
   - Expand **`auth-controller` → `POST /api/auth/login`** → Click **Try it out**.
   - Use request body:
     ```json
     {
       "email": "buyer@autotriage.local",
       "password": "BuyerPassword123!"
     }
     ```
   - Click **Execute** and copy the `"token"` value from the response (without quotes).
   - Scroll to the top of Swagger UI and click the green **`Authorize`** button (top right).
   - Paste the token into the **`Value`** field under `bearerAuth (http, Bearer)` and click **Authorize**, then **Close**.
4. **Test Authenticated Endpoints (`USER` & `ADMIN`):**
   - **`cart-controller` → `POST /api/cart/items`**:
     ```json
     {
       "productId": "prod_002",
       "quantity": 2
     }
     ```
     Execute it twice to verify that duplicate product additions merge quantities automatically.
   - **`cart-controller` → `GET /api/cart`**: Verify `items`, `subtotal`, `tax` (10%), and `total`.
   - **`order-controller` → `POST /api/orders`**:
     ```json
     {
       "items": [
         { "productId": "prod_002", "quantity": 2 }
       ],
       "shippingAddress": {
         "name": "Jane Doe",
         "line1": "123 Main St",
         "line2": "Apt 4B",
         "city": "Austin",
         "state": "TX",
         "postal_code": "78701",
         "country": "United States"
       },
       "paymentDetails": {
         "method": "Card",
         "last4": "4242"
       }
     }
     ```
   - **Test Payment Decline (`402 Payment Required`)**: Repeat `POST /api/orders` with `"last4": "0002"` to verify the mock issuer decline error.
   - **Test Role Guard (`403 Forbidden`)**: While authorized as `buyer@autotriage.local` (`USER`), try `GET /api/admin/orders` or `POST /api/products` — verify you get `403 Forbidden`. Then login as `admin@autotriage.local` / `AdminPassword123!`, re-authorize with the admin token, and verify `GET /api/admin/orders` returns `200 OK`.

---

## 6. Manual End-to-End UI Testing Checklist (`http://localhost:5173`)

1. **Catalog & Filtering (`/products`)**
   - Open [http://localhost:5173/products](http://localhost:5173/products).
   - Verify all 8 products render with images and prices.
   - Filter by **Watches** or **Laptops** in the left sidebar, search for `"watch"`, and test the **Sort by → Price: Low to High** dropdown.
2. **Guest Guard on Add to Cart**
   - While logged out, click the cart icon on any product card → verify toast **"Authentication Required"** and redirect to `/login`.
3. **Login & Profile (`/login`, `/profile`)**
   - Log in with `buyer@autotriage.local` / `BuyerPassword123!` (or click **Login with Google**, which logs in as the seeded buyer account in local SUT mode).
   - Open the user menu (top-right avatar) → **Profile** (`/profile`), update your shipping address, and click **Save Changes**.
4. **Shopping Cart & Quantity Updates (`/products/:productId`, `/cart`)**
   - Click a product to open `/products/prod_001`, adjust quantity, and click **Add to Cart**.
   - Click the top-right cart icon (`/cart`) and verify subtotal, 10% tax, and total update live when incrementing/decrementing quantity.
5. **Full Checkout Flow (`/checkout` → `/checkout/payment` → `/checkout/summary`)**
   - Click **Proceed to Checkout**.
   - Confirm your pre-filled shipping address on `/checkout` → click **Continue to Payment**.
   - On `/checkout/payment`, enter:
     - **Name on card:** `Jane Doe`
     - **Card number:** `4242424242424242` (16 digits)
     - **Expiry date:** `12/28`
     - **CVC:** `123`
   - Click **Continue to Summary**, review the order on `/checkout/summary`, and click **Place Order**.
   - Verify redirect to `/order-confirmation/:orderId` and click **View Order Details** (`/orders/:orderId`).
6. **Admin Dashboard (`/admin`)**
   - Log out from the top-right user menu, then log in as `admin@autotriage.local` / `AdminPassword123!`.
   - Open the user menu → **Admin Dashboard** (`/admin`).
   - Under the **Orders** tab, change an order's status from `Processing` to `shipped` or `delivered`.
   - Under the **Products** tab, add a new product or click **Reset Product Data** to restore the 8 baseline products.

---

## 7. Running Automated Backend Tests

```bash
mvn -f /Users/lion/Projects/autotriage/sut/backend-spring/pom.xml verify
```
