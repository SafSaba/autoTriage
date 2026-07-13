# E-Automate → Spring Boot + Angular (AutoTriage SUT Specification)

> **Instructions for AI Agent in New Workspace (`/Users/lion/Projects/autotriage`):**  
> Read this document first! It contains the **exact API endpoints, data models, UI components, locators, and seeded defect flags** from the existing working E-Automate app at `/Users/lion/Projects/safwan-portoflio`.  
> Use these exact specifications so the existing Cucumber BDD and Playwright suites pass with zero rework.

---

## 1. Domain Models & Schemas

### Product Model
```typescript
export interface Product {
  id: string;              // e.g. "prod_001"
  name: string;            // e.g. "Chronograph Excellence"
  description: string;
  price: number;           // e.g. 450.00
  images: string[];
  category: string;        // "Watches" | "Laptops" | "Audio" | "Smartphones" | "Tablets"
  stock: number;           // e.g. 15
  dataAiHint?: string;     // e.g. "luxury watch"
}
```

### Initial Seed Products (From `src/lib/products.ts`)
1. **`prod_001`**: `Chronograph Excellence` | Price: `$450.00` | Category: `Watches` | Stock: 15
2. **`prod_002`**: `Titanium Smartwatch` | Price: `$799.99` | Category: `Watches` | Stock: 25
3. **`prod_003`**: `Ultra-Slim Laptop` | Price: `$1399.00` | Category: `Laptops` | Stock: 10
4. **`prod_004`**: `Gaming Beast Laptop` | Price: `$2100.50` | Category: `Laptops` | Stock: 5
5. **`prod_005`**: `Galaxy Pro Smartphone` | Price: `$1199.99` | Category: `Smartphones` | Stock: 20
6. **`prod_006`**: `Quantum Buds` | Price: `$149.00` | Category: `Audio` | Stock: 40
7. **`prod_007`**: `Smart Hub Pro` | Price: `$199.00` | Category: `Smart Home` | Stock: 30

---

## 2. Spring Boot 3.3 REST API Endpoints (`sut/backend-spring`)

Port the business logic to standard Spring MVC Controllers:

### A. Products Controller (`/api/products`)
* `GET /api/products` → returns `List<Product>` (supports optional `?category=Watches` and `?search=Chronograph`)
* `GET /api/products/{id}` → returns single `Product`
* `GET /api/products/categories` → returns distinct categories `["Watches", "Laptops", "Smartphones", "Audio", "Smart Home"]`

### B. Cart Controller (`/api/cart`)
* `GET /api/cart` → returns active cart items `{ items: [{ product, quantity }], subtotal, tax, total }`
* `POST /api/cart/items` → body: `{ productId: "prod_001", quantity: 1 }`
* `PUT /api/cart/items/{productId}` → body: `{ quantity: 2 }` (Used by BDD `"+" / "-"` buttons)
* `DELETE /api/cart/items/{productId}` → removes product from cart

### C. Orders / Checkout Controller (`/api/orders`)
* `POST /api/orders/checkout` → body: `{ name, address, city, items, paymentMethod }`
  - Validates `name.length >= 2`
  - Validates `address.length >= 5`
  - Validates `city.length >= 2`

---

## 3. Angular 18 Frontend UI & Essential Locators (`sut/frontend-angular`)

The existing tests expect the following UI routes and selectors:

### A. Products / Catalog Page (`/products` or `/e-automate`)
* Search input: `input[placeholder*="Search"]` or `data-testid="search-input"`
* Product card container: `data-testid="product-card"` or `.product-card`
* Product Title: `h3` or `data-testid="product-title"` (e.g. text `"Chronograph Excellence"`)
* Add to cart button: `button:has-text("Add to Cart")` or `data-testid="add-to-cart-button"`
* Cart Badge in Header: `#cart-badge` or `[data-testid="cart-badge"]` (displays item count, e.g. `"1"`)

### B. Cart Drawer / Page (`/cart`)
* Cart item title: `.cart-item-title` or `data-testid="cart-item-name"`
* Quantity increase button: `button:has-text("+")` or `data-testid="qty-plus"`
* Quantity decrease button: `button:has-text("-")` or `data-testid="qty-minus"`
* Item Quantity: `data-testid="item-quantity"` (displays `"1"`, `"2"`, etc.)
* Subtotal / Total price: `.cart-total` or `data-testid="cart-total"` (displays `"$900.00"`)

### C. Checkout Page (`/checkout`)
* Name input: `input[name="name"]` or `id="name"`
* Address input: `input[name="address"]` or `id="address"`
* City input: `input[name="city"]` or `id="city"`
* Submit Button: `button:has-text("Place Order")`
* Form Validation Errors: `.error-message` or `data-testid="validation-error"`
  - Expected text: `"Name must be at least 2 characters."`
  - Expected text: `"Address must be at least 5 characters."`
  - Expected text: `"City must be at least 2 characters."`

---

## 4. Controlled Bug Toggle Flags (For AutoTriage Testing)

Create a configuration class in Spring Boot (`DefectProperties.java`) and an Angular environment file (`environment.ts`):

```yaml
# In Spring application.yml
autotriage:
  defects:
    # Defect 1: Integer division truncating 15% discount to 0 in Requisition/Order
    discount-truncation: false
    # Defect 2: Throws 500 NPE when user updates profile with null address
    npe-on-null-address: false
    # Defect 3: Off-by-one error in product search pagination
    pagination-off-by-one: false
```

```typescript
// In Angular environment.ts
export const environment = {
  production: false,
  apiUrl: 'http://localhost:8080/api',
  defects: {
    // Defect 4: Race condition disabling checkout button
    disableCheckoutButton: false,
    // Defect 5: Paste-mask stripping hyphens on tax/id input
    pasteMaskValidationBug: false
  }
};
```

---

## 5. Existing BDD Feature Files (Reference from `safwan-portoflio`)

Reference features are in `/Users/lion/Projects/safwan-portoflio/src/app/automation-lab/projectData.ts`:
- `Feature: E-Automate Shopping Cart Flow`
- `Feature: E-Automate Comprehensive E2E Suite` (`@Cart`, `@Checkout`, `@Catalog`, `@Account`)
