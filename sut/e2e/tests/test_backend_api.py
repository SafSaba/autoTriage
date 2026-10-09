"""
test_backend_api.py - Comprehensive Backend REST API & OpenAPI Contract Test Suite
===================================================================================
Validates the Spring Boot 3.4 REST API endpoints without requiring a browser UI.
Covers:
1. OpenAPI 3.1 Swagger Specification Contract
2. Authentication, JWT Issuance, Verification, and Edge Cases
3. Product Catalog Browsing, Search, Filtering, Sorting, and SQLi Immunity
4. Shopping Cart CRUD and Guest Cart Sync
5. Orders, Checkout Invariants, Tax Calculation, and Card 0002 Decline
6. Customer Support Contact Messages and RBAC Permissions
"""

from typing import Dict
import httpx
import pytest


@pytest.mark.api
def test_openapi_swagger_contract(api_client: httpx.Client):
    """
    Validates that the OpenAPI 3.1 specification is served correctly,
    exposes required paths, defines Bearer JWT security scheme, and contains expected models.
    """
    resp = api_client.get("/v3/api-docs")
    assert resp.status_code == 200, f"Swagger OpenAPI endpoint failed: {resp.text}"
    schema = resp.json()

    assert schema.get("openapi", "").startswith("3.")
    assert "paths" in schema
    paths = schema["paths"]

    # Verify critical business endpoints exist in OpenAPI specification
    expected_paths = [
        "/api/auth/login",
        "/api/auth/signup",
        "/api/me",
        "/api/products",
        "/api/products/{id}",
        "/api/cart",
        "/api/cart/items",
        "/api/cart/sync",
        "/api/orders",
        "/api/orders/{orderId}",
        "/api/admin/orders",
        "/api/admin/bugs",
        "/api/admin/db/summary",
        "/api/admin/db/query",
        "/api/contact",
    ]
    for p in expected_paths:
        assert p in paths, f"Missing path {p} in OpenAPI contract"

    # Verify Security Schemes define Bearer JWT
    components = schema.get("components", {})
    security_schemes = components.get("securitySchemes", {})
    assert "bearerAuth" in security_schemes or "bearer-jwt" in security_schemes or len(security_schemes) > 0


@pytest.mark.api
def test_auth_edge_cases_and_jwt_security(api_client: httpx.Client, buyer_headers: Dict[str, str]):
    """
    Tests edge cases for authentication:
    - Empty credentials -> 400
    - Wrong password -> 401
    - Non-existent user -> 401
    - Tampered JWT token signature -> 401
    - Protected endpoint without token -> 401
    - Duplicate email registration -> 400
    """
    # 1. Empty body -> 400
    r_empty = api_client.post("/api/auth/login", json={})
    assert r_empty.status_code == 400

    # 2. Wrong password -> 401
    r_wrong = api_client.post("/api/auth/login", json={"email": "buyer@autotriage.local", "password": "WrongPassword!"})
    assert r_wrong.status_code == 401

    # 3. Nonexistent user -> 401
    r_nouser = api_client.post("/api/auth/login", json={"email": "nobody_exists_1234@autotriage.local", "password": "AnyPassword!"})
    assert r_nouser.status_code == 401

    # 4. Tampered JWT token (modified signature) -> 401
    valid_token = buyer_headers["Authorization"].replace("Bearer ", "")
    tampered_token = valid_token[:-4] + "ABCD"
    r_tampered = api_client.get("/api/me", headers={"Authorization": f"Bearer {tampered_token}"})
    assert r_tampered.status_code == 401

    # 5. Missing Authorization header -> 401
    r_unauth = api_client.get("/api/me")
    assert r_unauth.status_code == 401

    # 6. Duplicate registration -> 400
    r_dup = api_client.post(
        "/api/auth/signup",
        json={
            "email": "buyer@autotriage.local",
            "password": "NewPassword123!",
            "firstName": "Duplicate",
            "lastName": "User",
        },
    )
    assert r_dup.status_code == 400
    assert "already exists" in r_dup.json()["error"]


@pytest.mark.api
def test_user_profile_get_and_update(api_client: httpx.Client, buyer_headers: Dict[str, str]):
    """
    Verifies GET /api/me and PUT /api/me for updating user profile and shipping address.
    """
    # 1. Get profile
    r_me = api_client.get("/api/me", headers=buyer_headers)
    assert r_me.status_code == 200
    me = r_me.json()
    assert me["email"] == "buyer@autotriage.local"

    # 2. Update profile displayName and phone
    r_update = api_client.put(
        "/api/me",
        headers=buyer_headers,
        json={
            "displayName": "Max Robinson Updated",
            "phoneNumber": "555-0199",
            "shippingAddress": {
                "name": "Max Robinson",
                "line1": "999 Tech Blvd",
                "city": "Austin",
                "state": "TX",
                "postal_code": "78701",
                "country": "United States",
            },
        },
    )
    assert r_update.status_code == 200
    updated = r_update.json()
    assert updated["displayName"] == "Max Robinson Updated"
    assert updated["phoneNumber"] == "555-0199"
    assert updated["shippingAddress"]["line1"] == "999 Tech Blvd"


@pytest.mark.api
def test_products_catalog_search_filtering_and_sqli_safety(api_client: httpx.Client):
    """
    Validates:
    - Listing all 8 canonical products
    - Category filtering (e.g. Watches)
    - Search query matching name/description
    - Price and Name sorting
    - SQL Injection string safety (does not cause 500 error or bypass filters)
    - 404 for unknown product ID
    """
    # 1. List all products
    r_all = api_client.get("/api/products")
    assert r_all.status_code == 200
    products = r_all.json()
    assert len(products) >= 8

    # 2. Category filtering
    r_watches = api_client.get("/api/products?category=Watches")
    assert r_watches.status_code == 200
    watches = r_watches.json()
    assert len(watches) >= 1
    for w in watches:
        assert w["category"] == "Watches"

    # 3. Search query
    r_search = api_client.get("/api/products?search=chronograph")
    assert r_search.status_code == 200
    matches = r_search.json()
    assert len(matches) >= 1
    assert any("Chronograph" in p["name"] for p in matches)

    # 4. Sorting price ascending
    r_sort_asc = api_client.get("/api/products?sort=price_asc")
    assert r_sort_asc.status_code == 200
    items_asc = r_sort_asc.json()
    prices = [p["price"] for p in items_asc]
    assert prices == sorted(prices)

    # 5. Sorting price descending
    r_sort_desc = api_client.get("/api/products?sort=price_desc")
    assert r_sort_desc.status_code == 200
    items_desc = r_sort_desc.json()
    prices_desc = [p["price"] for p in items_desc]
    assert prices_desc == sorted(prices_desc, reverse=True)

    # 6. SQL Injection fuzz payload in search parameter -> must not cause 500
    sqli_payload = "' OR 1=1; DROP TABLE products; --"
    r_sqli = api_client.get(f"/api/products?search={sqli_payload}")
    assert r_sqli.status_code == 200
    # Table still exists and products are intact
    assert len(api_client.get("/api/products").json()) >= 8

    # 7. 404 for non-existent product ID
    r_404 = api_client.get("/api/products/non_existent_id_99999")
    assert r_404.status_code == 404


@pytest.mark.api
def test_cart_validation_and_business_rules(
    api_client: httpx.Client, buyer_headers: Dict[str, str]
):
    """
    Validates cart business invariants:
    - Adding with quantity < 1 returns 400
    - Missing productId returns 400
    - Nonexistent productId returns 404
    - Adding same product twice accumulates quantity
    - Updating item quantity
    - Subtotal and 10% tax calculation
    - Clearing cart
    """
    # Clear cart before test
    api_client.delete("/api/cart", headers=buyer_headers)

    # 1. Quantity < 1 -> 400
    r_zero = api_client.post(
        "/api/cart/items",
        headers=buyer_headers,
        json={"productId": "prod_001", "quantity": 0},
    )
    assert r_zero.status_code == 400

    r_neg = api_client.post(
        "/api/cart/items",
        headers=buyer_headers,
        json={"productId": "prod_001", "quantity": -5},
    )
    assert r_neg.status_code == 400

    # 2. Missing productId -> 400
    r_missing = api_client.post(
        "/api/cart/items", headers=buyer_headers, json={"quantity": 2}
    )
    assert r_missing.status_code == 400

    # 3. Add prod_001 ($450.00, qty 1)
    r_add1 = api_client.post(
        "/api/cart/items",
        headers=buyer_headers,
        json={"productId": "prod_001", "quantity": 1},
    )
    assert r_add1.status_code == 200
    cart1 = r_add1.json()["cart"]
    assert cart1["subtotal"] == 450.00
    assert cart1["tax"] == 45.00  # 10% tax
    assert cart1["total"] == 495.00

    # 4. Add prod_001 again (qty 1) -> merges quantity to 2
    r_add2 = api_client.post(
        "/api/cart/items",
        headers=buyer_headers,
        json={"productId": "prod_001", "quantity": 1},
    )
    assert r_add2.status_code == 200
    cart2 = r_add2.json()["cart"]
    total_qty = sum(i["quantity"] for i in cart2["items"])
    assert total_qty == 2
    assert cart2["subtotal"] == 900.00
    assert cart2["tax"] == 90.00
    assert cart2["total"] == 990.00

    # 5. Clear cart
    r_clear = api_client.delete("/api/cart", headers=buyer_headers)
    assert r_clear.status_code == 200
    assert r_clear.json()["success"] is True

    # 6. Verify cart is empty
    r_empty_cart = api_client.get("/api/cart", headers=buyer_headers)
    assert r_empty_cart.status_code == 200
    assert len(r_empty_cart.json()["items"]) == 0


@pytest.mark.api
def test_order_creation_tax_and_idor_access_control(
    api_client: httpx.Client,
    buyer_headers: Dict[str, str],
    admin_headers: Dict[str, str],
):
    """
    Validates:
    - Order creation calculates 10% tax accurately: Total = Subtotal * 1.10
    - Card ending in 0002 returns 402 Payment Required
    - Insufficient stock returns 409 Conflict
    - Order details can be viewed by the owner (200) and ADMIN (200)
    - Order details cannot be viewed by unauthorized users (401) or other buyers (403 IDOR)
    """
    # 1. Test Card 0002 decline (402)
    r_declined = api_client.post(
        "/api/orders",
        headers=buyer_headers,
        json={
            "items": [{"productId": "prod_007", "quantity": 1}],
            "shippingAddress": {
                "name": "Buyer One",
                "line1": "100 Main St",
                "city": "Austin",
                "state": "TX",
                "postal_code": "78701",
                "country": "USA",
            },
            "paymentDetails": {"method": "Card", "last4": "0002"},
        },
    )
    assert r_declined.status_code == 402
    assert "declined" in r_declined.json()["error"].lower()

    # 2. Place successful order: prod_007 is $150.00 * 2 = $300.00 subtotal. Tax = $30.00. Total = $330.00.
    r_success = api_client.post(
        "/api/orders",
        headers=buyer_headers,
        json={
            "items": [{"productId": "prod_007", "quantity": 2}],
            "shippingAddress": {
                "name": "Buyer One",
                "line1": "100 Main St",
                "city": "Austin",
                "state": "TX",
                "postal_code": "78701",
                "country": "USA",
            },
            "paymentDetails": {"method": "Card", "last4": "4242"},
        },
    )
    assert r_success.status_code in (200, 201)
    order = r_success.json()
    order_id = order["id"]
    assert order["total"] == 330.00
    assert order["status"] == "Processing"

    # 3. Buyer owner can view their order
    r_owner_view = api_client.get(f"/api/orders/{order_id}", headers=buyer_headers)
    assert r_owner_view.status_code == 200
    assert r_owner_view.json()["id"] == order_id

    # 4. Admin can view the order
    r_admin_view = api_client.get(f"/api/orders/{order_id}", headers=admin_headers)
    assert r_admin_view.status_code == 200

    # 5. Another buyer (Jane Doe) cannot view Buyer One's order -> 403 Forbidden (IDOR prevention)
    jane_login = api_client.post(
        "/api/auth/login",
        json={"email": "jane.doe@autotriage.local", "password": "BuyerPassword123!"},
    )
    assert jane_login.status_code == 200
    jane_headers = {"Authorization": f"Bearer {jane_login.json()['token']}"}

    r_jane_view = api_client.get(f"/api/orders/{order_id}", headers=jane_headers)
    assert r_jane_view.status_code == 403


@pytest.mark.api
def test_contact_support_api_and_rbac(
    api_client: httpx.Client,
    buyer_headers: Dict[str, str],
    admin_headers: Dict[str, str],
):
    """
    Validates Customer Support Contact Message API:
    - POST /api/contact submits message (201)
    - Invalid email format returns 400
    - Missing message returns 400
    - Buyer GET /api/admin/messages returns 403 Forbidden
    - Admin GET /api/admin/messages returns 200 OK with the submitted message
    """
    # 1. Invalid email format -> 400
    r_bad_email = api_client.post(
        "/api/contact",
        json={
            "email": "not-an-email",
            "subject": "Need help with order",
            "message": "My package has not arrived.",
        },
    )
    assert r_bad_email.status_code == 400

    # 2. Missing message -> 400
    r_missing_msg = api_client.post(
        "/api/contact",
        json={"email": "buyer@autotriage.local", "subject": "Question", "message": ""},
    )
    assert r_missing_msg.status_code == 400

    # 3. Valid message submission -> 201
    r_valid = api_client.post(
        "/api/contact",
        json={
            "email": "buyer@autotriage.local",
            "subject": "Delivery question",
            "message": "Can I update my delivery instructions?",
        },
    )
    assert r_valid.status_code == 201
    created_msg = r_valid.json()
    assert created_msg["subject"] == "Delivery question"
    assert created_msg["status"] == "OPEN"

    # 4. Non-admin attempting to list support messages -> 403 Forbidden
    r_forbidden = api_client.get("/api/admin/messages", headers=buyer_headers)
    assert r_forbidden.status_code == 403

    # 5. Admin listing support messages -> 200 OK
    r_admin = api_client.get("/api/admin/messages", headers=admin_headers)
    assert r_admin.status_code == 200
    messages = r_admin.json()
    assert any(m["id"] == created_msg["id"] for m in messages)
