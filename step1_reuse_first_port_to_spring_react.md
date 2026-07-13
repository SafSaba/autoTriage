# Step 1 (Reuse-First): Port the Existing E-Automate Shop to Spring Boot + React and Make It Run

**Owner:** Safwan Saba
**Version:** 2.0 (2026-10-21). Replaces the earlier "build from scratch" draft.
**Sprint link:** Sprint 0 item S0-8 (reference intake) and Sprint 1 items S1-1, S1-2, S1-6 in `autotriage_master_plan.md` v1.2.
**Goal:** `docker compose up --build` starts your existing shop on a Java backend and a React frontend. Nothing is rebuilt that already exists.
**FDE Alignment Note:** The SUT port (Spring Boot + React) is complete, and Phase 4 E2E/API verification in `sut/e2e/` is implemented in **Python (`pytest` + `pytest-playwright` + `httpx`)** to unify the test runner with the Python AutoTriage agent and MCP servers.

---

## 0. What you told me, and what I can and cannot see

You already have the app (live at `portfolio.safwansaba.info/products`, source in the E-Automate repo) and have copied files into `autotriage/data/` to save time. The agent must **reuse that code and not start from scratch**.

What I can see:

| Item | Observation |
|---|---|
| Folder `autotriage/data/` | Contains `api`, `backend`, `cart`, `checkout`, `order-confirmation`, `orders`, `products`, `signup` and `page.tsx`. This is the Next.js `src/app` route tree. The `backend` folder was changed today (23:35) and I cannot see inside it. |
| Not visible in the copy | `login`, `admin`, `profile`, `forgot-password`, `contact`, and everything outside `src/app` (`components`, `hooks`, `lib`, `package.json`, `tailwind.config.ts`, `components.json`, `firestore.rules`). |
| `app/products/page.tsx` | Client-side React page. Imports `ProductCard` and shadcn/ui components, calls `getProducts()`, and does search, category, price-range and sort filtering in the browser. |
| `lib/products.ts` + `lib/types.ts` | 8 seed products (watches, laptops, smartphones) with string ids like `prod_001`. Reads Firestore. Types for Product, CartItem, Order, ShippingAddress, UserProfile. |
| `app/api/products/route.ts` | A **second, separate** product list: 5 in-memory products with numeric ids (Quantum CPU, Neural Link VR and so on), with category filter and price sort. The layout text calls the app "a mock e-commerce store built for testing automation strategies". |
| `app/api/cart/route.ts` | Firebase-backed. 401 if not authenticated, 400 if `productId` is missing, 404 if the product does not exist. Adds items with `arrayUnion`, so adding the same product twice creates duplicate lines. |
| `lib/types.ts` (end) | Also defines `SystemHealth` and `TestRun` (smoke, regression, integration, API). That looks like a test-dashboard feature, not shop logic. |

I have not read the component, hook, auth or checkout source, so this plan is based on routes, types and the files you attached. I also could not open the live URL, so I have not seen the running site.

---

## 1. Reuse rules (the heart of this step)

1. **Keep the frontend.** It is already React. Change only the data layer (Firebase to REST), the auth layer, and add `data-testid`. Do not redesign pages.
2. **Keep the data shapes.** `types.ts` becomes the contract for the API's JSON and for the JPA entities.
3. **Keep the API status codes** the old cart route used (401, 400, 404) and the filter and sort behavior of the products page.
4. **Write only what does not exist:** the Spring Boot API, Postgres schema and seed, JWT auth, a mock payment gateway, Docker files.
5. **Pick one product dataset.** Use the 8-product dataset in `products.ts` (descriptions, images, stock, categories) as the seed. Treat the 5-product mock route as a test double and drop it, or keep it under a clearly named path. Do not mix the two.
6. **Do not carry over:** Firebase SDK, Firestore rules logic as code, Firebase Functions, Stripe, Genkit/Gemini suggestions, the portfolio pages, the `TestRun`/`SystemHealth` dashboard types. These are out of scope.
7. **Correct baseline.** With all future bug flags off, the shop must behave correctly. Fix or record natural weaknesses (duplicate cart lines, unvalidated quantity) now, so later bugs are only the ones you plant.

---

## 2. Set up the workspace

```bash
cd ~/Projects/autotriage
mkdir -p reference
mv data reference/e-automate          # your copied files become read-only reference
git init                               # skip if already a repo
printf "reference/\nnode_modules/\n.next/\ntarget/\n.env\n*.env.local\n" >> .gitignore
```

Complete the copy. Either copy these from the original project into `reference/e-automate/`, or clone the public repo next to it:

```bash
git clone https://github.com/SafSaba/E-Automate.git reference/e-automate-full
```

Files the agent needs: `package.json`, `tailwind.config.ts`, `components.json`, `tsconfig.json`, `next.config.ts`, `firestore.rules`, and the folders `src/components`, `src/hooks`, `src/lib`. Tell me what is inside `data/backend`, because I do not know whether it is Java, Node or something else.

**Do not copy** `.env*`, `.firebaserc`, `apphosting.yaml`, service-account JSON, `node_modules` (E-Automate has `functions/node_modules` committed), or any keys. Run `gitleaks detect` before pushing anything public. Use only your own code, never client or employer code.

Target layout:

```
autotriage/
├── reference/e-automate/        # read-only copy of your existing app
├── sut/
│   ├── backend-spring/          # NEW Spring Boot API
│   └── frontend-react/          # PORTED copy of the existing UI
├── docs/porting-inventory.md    # written by the agent
├── docker-compose.yml
├── CLAUDE.md
└── README.md
```

---

## 3. The instruction file for your agent

Save this as `CLAUDE.md` (or `AGENTS.md`) in the repo root.

```markdown
# Project: AutoTriage system under test (SUT)

The SUT is the author's existing shop app (E-Automate). It already exists in reference/e-automate.
DO NOT START FROM SCRATCH. Reuse the existing UI and data shapes. Only the backend is new.

## Goal of this step
Run the shop on Spring Boot (Java 21, Postgres) + React with `docker compose up --build`.

## Reuse (copy and adapt)
- UI: pages under src/app, components, hooks, Tailwind and shadcn/ui config.
- Data shapes: src/lib/types.ts. Seed data: src/lib/products.ts (the 8 products).
- API behavior: status codes from the old cart route (401 unauthenticated, 400 missing productId,
  404 unknown product). Filter and sort behavior from app/products/page.tsx.

## Write new
- Spring Boot API (controller/service/repository/domain/dto/security/payment), Flyway schema + seed,
  JWT auth with roles USER and ADMIN, MockPaymentGateway, Dockerfiles, docker-compose.yml.

## Never do
- Never edit anything under reference/.
- Never read or copy: node_modules, .next, package-lock.json, .env*, .firebaserc, apphosting.yaml,
  keys of any kind.
- No real Stripe, Firebase, or Gemini calls. Remove those packages from the ported frontend.
- Do not port: Firebase Functions, src/ai, the portfolio pages, the TestRun/SystemHealth dashboard.
- Do not add seeded bugs yet.

## Working rules
1. Phase order: inventory, backend, frontend port, compose. Stop at each checkpoint and show real output.
2. Small commits after each green checkpoint.
3. Add a stable data-testid to every button, input, link, and table row a test would use.
4. If the reference is unclear, write the question in docs/porting-inventory.md instead of guessing.
5. Baseline must be correct: fix duplicate cart lines (merge quantities) and validate quantity >= 1.
```

---

## 4. Phase 1: Inventory (no app code yet)

Prompt:

> Read `reference/e-automate` using the rules in `CLAUDE.md`. Do not write app code. Produce `docs/porting-inventory.md` with: (1) every route and what the page does, including the `backend` folder; (2) the data model from `types.ts` and from every Firestore read and write, citing the file for each field; (3) roles and permissions from `firestore.rules`; (4) every Firebase, Stripe and Genkit call by file, with the REST endpoint that will replace it; (5) reusable components and hooks; (6) what to drop and why; (7) the two product datasets and which one is used where; (8) natural weaknesses in current behavior; (9) open questions.

**Checkpoint 1 (you review):** every Firebase call has a replacement endpoint, every field has a source file, and the open questions are real ones.

Starting mapping to confirm or correct:

| Existing feature | New endpoint |
|---|---|
| Signup, login, profile | `POST /api/auth/signup`, `POST /api/auth/login`, `GET/PUT /api/me` |
| Product list, filters, sort, detail | `GET /api/products?category=&sort=&q=`, `GET /api/products/{id}` |
| Admin product management | `POST/PUT/DELETE /api/products` (role `ADMIN`) |
| Cart | `GET/POST/PUT/DELETE /api/cart` and `/api/cart/items/{productId}` |
| Checkout and orders | `POST /api/orders` (mock gateway), `GET /api/orders`, `GET /api/orders/{id}` |

---

## 5. Phase 2: Spring Boot backend (new code)

Prompt:

> Create `sut/backend-spring` with Spring Initializr: Java 21, Maven, jar; dependencies Web, Data JPA, Security, Validation, PostgreSQL Driver, Flyway, Actuator. Add `flyway-database-postgresql` and `springdoc-openapi-starter-webmvc-ui`. Build entities and DTOs from `types.ts` (Product, CartItem, Order, ShippingAddress, UserProfile). Flyway `V1__init.sql` for the schema and `V2__seed.sql` for the 8 products from `products.ts`, one admin and two users. JWT login with BCrypt. CORS for `http://localhost:3000`. A `@RestControllerAdvice` returns the same JSON error shape the old routes used (`{"error": "..."}` with 401, 400, 404). `/actuator/health`. Testcontainers integration tests for login, product list with filter and sort, cart add/merge, and order creation. Multi-stage Dockerfile.

Initializr call (omits the Boot version on purpose so you get the current supported default):

```bash
curl https://start.spring.io/starter.zip \
  -d type=maven-project -d language=java -d javaVersion=21 -d packaging=jar \
  -d groupId=com.autotriage -d artifactId=shop -d name=shop \
  -d dependencies=web,data-jpa,security,validation,postgresql,flyway,actuator \
  -o shop.zip && unzip shop.zip -d sut/backend-spring
```

Dockerfile:

```dockerfile
FROM maven:3-eclipse-temurin-21 AS build
WORKDIR /app
COPY pom.xml .
RUN mvn -q -B dependency:go-offline
COPY src ./src
RUN mvn -q -B package -DskipTests

FROM eclipse-temurin:21-jre
WORKDIR /app
COPY --from=build /app/target/*.jar app.jar
EXPOSE 8080
ENTRYPOINT ["java","-jar","app.jar"]
```

**Checkpoint 2 (backend alone):**

```bash
docker compose up -d db
cd sut/backend-spring && ./mvnw verify
curl -s localhost:8080/actuator/health
curl -s "localhost:8080/api/products?category=Laptops&sort=price_asc"
curl -s -o /dev/null -w "%{http_code}\n" localhost:8080/api/cart   # expect 401
```

---

## 6. Phase 3: Port the frontend (reuse, change the data layer)

Prompt:

> Copy the UI from `reference/e-automate` into `sut/frontend-react`: pages, `components`, `hooks`, Tailwind and shadcn/ui config, types. Remove Firebase, Genkit and Stripe packages and files. Replace `getProducts`, `getProductById`, `getCategories`, the auth helpers, cart and order calls with one typed client in `src/lib/api.ts` that reads `NEXT_PUBLIC_API_URL`. Keep the products page filters, search and sort exactly as they behave now. Replace the Stripe form with a mock card form (a card ending in `4242` succeeds, `0002` is declined). Store the JWT in an httpOnly cookie if simple, else in memory plus localStorage and document the choice. Delete the portfolio pages. Add `data-testid` everywhere a test would click or read. Multi-stage Dockerfile.

Notes:
- `NEXT_PUBLIC_*` values are baked in at **build** time. Pass the API URL as a Docker build arg.
- The browser calls `http://localhost:8080` from your machine.
- Keep the visible text of the products page (for example "No products found" and the result count) unchanged, because tests and bug reports will quote it.

**Checkpoint 3:**

```bash
cd sut/frontend-react
npm ci && npm run build
NEXT_PUBLIC_API_URL=http://localhost:8080 npm run dev      # open http://localhost:3000
```

---

## 7. Phase 4: Docker Compose and run

```yaml
services:
  db:
    image: postgres:16
    environment:
      POSTGRES_DB: shop
      POSTGRES_USER: shop
      POSTGRES_PASSWORD: shop
    ports: ["5432:5432"]
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U shop -d shop"]
      interval: 5s
      timeout: 3s
      retries: 10

  backend:
    build: ./sut/backend-spring
    environment:
      SPRING_DATASOURCE_URL: jdbc:postgresql://db:5432/shop
      SPRING_DATASOURCE_USERNAME: shop
      SPRING_DATASOURCE_PASSWORD: shop
      APP_JWT_SECRET: change-me-at-least-32-characters-long
      APP_CORS_ORIGINS: http://localhost:3000
    depends_on:
      db:
        condition: service_healthy
    ports: ["8080:8080"]

  frontend:
    build:
      context: ./sut/frontend-react
      args:
        NEXT_PUBLIC_API_URL: http://localhost:8080
    ports: ["3000:3000"]
    depends_on: [backend]
```

```bash
docker compose up --build
```

---

## 8. Definition of done

Tick each box with real evidence (command output or a screenshot), not the agent's say-so.

- [ ] `docs/porting-inventory.md` exists and every Firebase call has a replacement endpoint
- [ ] `docker compose up --build` works from a clean clone with no manual steps
- [ ] `http://localhost:3000/products` shows the 8 seed products with working search, category, price and sort filters, matching the live site's behavior
- [ ] Sign up, log in, add to cart (same product twice merges into one line), check out with the mock card, and the order shows in order history
- [ ] An `ADMIN` can create, edit and delete a product; a `USER` gets 403
- [ ] Unauthenticated `GET /api/cart` returns 401; missing `productId` returns 400; unknown product returns 404
- [ ] `./mvnw verify` and `npm run build` are green
- [ ] No keys or `.env` files in git; `gitleaks detect` is clean
- [ ] `README.md` lists ports, seeded accounts and how to run
- [ ] Git tag `sut-v0.1-running`

---

## 9. Open items for you

1. What is inside `data/backend`?
2. Where is your "bug system monitor for Java"? I could not find it on GitHub. The `TestRun` and `SystemHealth` types may belong to it, so tell me if it should become part of the SUT or stay out of scope.
3. Confirm the 8-product dataset is the one to keep.
4. Confirm the dashboard (`TestRun`, `SystemHealth`) is dropped from the SUT.
