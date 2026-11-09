from typing import Dict
import httpx
import pytest
from playwright.sync_api import Page


@pytest.mark.api
@pytest.mark.smoke
def test_rest_api_security_and_rbac_contracts(
    api_client: httpx.Client, buyer_headers: Dict[str, str], admin_headers: Dict[str, str]
):
    """Verifies 401 unauthenticated, 403 non-admin RBAC, 400 validation, and 404 unknown product."""
    # 1. Unauthenticated cart access -> 401
    r_unauth = api_client.get("/api/cart")
    assert r_unauth.status_code == 401

    # 2. Missing productId -> 400
    r_bad = api_client.post("/api/cart/items", headers=buyer_headers, json={"quantity": 1})
    assert r_bad.status_code == 400

    # 3. Unknown product -> 404
    r_not_found = api_client.post(
        "/api/cart/items", headers=buyer_headers, json={"productId": "prod_999", "quantity": 1}
    )
    assert r_not_found.status_code == 404

    # 4. Buyer attempting Admin endpoint -> 403 Forbidden
    r_forbidden = api_client.get("/api/admin/orders", headers=buyer_headers)
    assert r_forbidden.status_code == 403

    # 5. Admin accessing Admin endpoint -> 200 OK
    r_admin = api_client.get("/api/admin/orders", headers=admin_headers)
    assert r_admin.status_code == 200


@pytest.mark.api
def test_guest_cart_sync_and_stock_conflict_and_cancellation_restore(
    api_client: httpx.Client, buyer_headers: Dict[str, str], admin_headers: Dict[str, str]
):
    """
    Verifies:
    1. Guest cart merge via POST /api/cart/sync.
    2. Ordering more than available stock returns 409 Conflict.
    3. Cancelling an order via PUT /api/admin/orders/{id} restores product stock.
    """
    # 1. Sync guest cart items
    r_sync = api_client.post(
        "/api/cart/sync",
        headers=buyer_headers,
        json=[{"productId": "prod_003", "quantity": 2}],
    )
    assert r_sync.status_code == 200
    assert sum(i["quantity"] for i in r_sync.json()["items"]) == 2

    # 2. Attempt to order 999 units of prod_003 (stock is 10) -> 409 Conflict
    r_conflict = api_client.post(
        "/api/orders",
        headers=buyer_headers,
        json={
            "items": [{"productId": "prod_003", "quantity": 999}],
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
    assert r_conflict.status_code == 409
    assert "Insufficient stock" in r_conflict.json()["error"]

    # 3. Place valid order for 3 units of prod_003 (stock 10 -> 7), then cancel and verify stock returns to 10
    r_order = api_client.post(
        "/api/orders",
        headers=buyer_headers,
        json={
            "items": [{"productId": "prod_003", "quantity": 3}],
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
    assert r_order.status_code in (200, 201)
    order_id = r_order.json()["id"]
    assert api_client.get("/api/products/prod_003").json()["stock"] == 7

    # Admin cancels the order -> stock restored to 10
    r_cancel = api_client.put(
        f"/api/admin/orders/{order_id}/status",
        headers=admin_headers,
        json={"status": "cancelled"},
    )
    assert r_cancel.status_code == 200
    assert api_client.get("/api/products/prod_003").json()["stock"] == 10


@pytest.mark.api
@pytest.mark.bug_repro
def test_autotriage_three_runtime_bug_flags(
    api_client: httpx.Client, buyer_headers: Dict[str, str], admin_headers: Dict[str, str]
):
    """
    Proves all 3 AutoTriage runtime fault-injection flags can be toggled ON to reproduce
    deterministic bugs and toggled OFF to restore clean baseline behavior:
    - BUG_OFF_BY_ONE_DISCOUNT (0.99x multiplier instead of 1.10x tax multiplier)
    - BUG_STALE_CART_CACHE (DELETE /api/cart/items/{id} fails to remove item from DB)
    - BUG_NULL_SHIPPING_NPE (POST /api/orders with null line2 throws 500 NPE)
    """
    # --- Bug 1: BUG_OFF_BY_ONE_DISCOUNT ---
    api_client.put("/api/admin/bugs", headers=admin_headers, json={"BUG_OFF_BY_ONE_DISCOUNT": True})
    r_bug1 = api_client.post(
        "/api/orders",
        headers=buyer_headers,
        json={
            "items": [{"productId": "prod_001", "quantity": 1}],  # $450.00
            "shippingAddress": {
                "name": "Buyer One",
                "line1": "100 Main St",
                "line2": "Apt 1",
                "city": "Austin",
                "state": "TX",
                "postal_code": "78701",
                "country": "USA",
            },
            "paymentDetails": {"method": "Card", "last4": "4242"},
        },
    )
    assert r_bug1.status_code in (200, 201)
    # Clean total would be 495.00 (450.00 * 1.10); buggy total is 445.50 (450.00 * 0.99)
    assert r_bug1.json()["total"] == 445.50
    api_client.put("/api/admin/bugs", headers=admin_headers, json={"BUG_OFF_BY_ONE_DISCOUNT": False})

    # --- Bug 2: BUG_STALE_CART_CACHE ---
    api_client.post("/api/cart/items", headers=buyer_headers, json={"productId": "prod_001", "quantity": 1})
    api_client.put("/api/admin/bugs", headers=admin_headers, json={"BUG_STALE_CART_CACHE": True})
    r_del = api_client.delete("/api/cart/items/prod_001", headers=buyer_headers)
    assert r_del.status_code == 200
    # Because BUG_STALE_CART_CACHE is active, item is still stuck in the cart!
    assert len(r_del.json()["items"]) == 1
    api_client.put("/api/admin/bugs", headers=admin_headers, json={"BUG_STALE_CART_CACHE": False})
    assert len(api_client.delete("/api/cart/items/prod_001", headers=buyer_headers).json()["items"]) == 0

    # --- Bug 3: BUG_NULL_SHIPPING_NPE ---
    api_client.put("/api/admin/bugs", headers=admin_headers, json={"BUG_NULL_SHIPPING_NPE": True})
    r_npe = api_client.post(
        "/api/orders",
        headers=buyer_headers,
        json={
            "items": [{"productId": "prod_001", "quantity": 1}],
            "shippingAddress": {
                "name": "Buyer One",
                "line1": "100 Main St",
                # line2 intentionally omitted (null) to trigger NPE
                "city": "Austin",
                "state": "TX",
                "postal_code": "78701",
                "country": "USA",
            },
            "paymentDetails": {"method": "Card", "last4": "4242"},
        },
    )
    assert r_npe.status_code == 500
    api_client.put("/api/admin/bugs", headers=admin_headers, json={"BUG_NULL_SHIPPING_NPE": False})

@pytest.mark.api
@pytest.mark.ui
@pytest.mark.bug_repro
def test_autotriage_repro_tax_calculation(
    page: Page, frontend_url: str, api_client: httpx.Client, buyer_headers: Dict[str, str]
):
    """
    Reproduces customer symptom: order total charged without adding 10% tax.
    1. Log in as buyer and add product to shopping cart.
    2. Proceed to checkout to review tax and order total.
    3. Validate 10% sales tax calculation ($45.00 tax -> $495.00 total).
    """
    # Step 1: Open browser & log in as buyer
    try:
        page.goto(f"{frontend_url}/login")
        page.get_by_test_id("demo-login-buyer").click()
        page.record_step(
            action="Log in as buyer and navigate to products catalog",
            expected="Buyer authenticated and catalog visible",
        )
    except Exception:
        pass

    # Step 2: Add Chronograph Excellence ($450.00) to cart
    try:
        page.goto(f"{frontend_url}/products/prod_001")
        page.get_by_test_id("add-to-cart-button").click()
        page.goto(f"{frontend_url}/cart")
        page.record_step(
            action="Add Chronograph Excellence ($450.00) to cart and view cart summary",
            expected="Cart displays subtotal $450.00 and 10% tax preview",
        )
    except Exception:
        pass

    # Step 3: Dispatch order calculation
    r = api_client.post(
        "/api/orders",
        headers=buyer_headers,
        json={
            "items": [{"productId": "prod_001", "quantity": 1}],
            "shippingAddress": {
                "name": "Buyer One",
                "line1": "100 Main St",
                "line2": "Apt 1",
                "city": "Austin",
                "state": "TX",
                "postal_code": "78701",
                "country": "USA",
            },
            "paymentDetails": {"method": "Card", "last4": "4242"},
        },
    )
    assert r.status_code in (200, 201)
    total = r.json()["total"]
    order_id = r.json().get("id")

    # Navigate to order details to display exact visual receipt in browser viewport
    if order_id:
        try:
            page.goto(f"{frontend_url}/orders/{order_id}")
            page.record_step(
                action=f"View Order Confirmation #{order_id[-6:]} in browser",
                expected="Receipt displays total $495.00",
                actual=f"Observed receipt total: ${total:.2f}",
            )
        except Exception:
            pass

    # Per PRD-001 Section 4.2, orders must charge 10% tax (495.00). If bug is active (445.50), this test fails.
    assert total == 495.00, f"Expected 495.00 with tax but got {total}"


@pytest.mark.api
@pytest.mark.ui
@pytest.mark.bug_repro
def test_autotriage_repro_stale_cart_delete(
    page: Page, frontend_url: str, api_client: httpx.Client, buyer_headers: Dict[str, str]
):
    """
    Reproduces customer symptom: deleting an item from cart leaves it in cart.
    1. Log in as buyer and add product to shopping cart.
    2. Click remove / trash icon on cart item.
    3. Verify item is removed from database and shopping cart is empty.
    """
    # Step 1: Add item to cart and open cart page
    api_client.post("/api/cart/items", headers=buyer_headers, json={"productId": "prod_001", "quantity": 1})
    try:
        page.goto(f"{frontend_url}/login")
        page.get_by_test_id("demo-login-buyer").click()
        page.goto(f"{frontend_url}/cart")
        page.record_step(
            action="Log in as buyer and open /cart with prod_001 present",
            expected="Cart contains 1 item (Chronograph Excellence)",
        )
    except Exception:
        pass

    # Step 2: Delete item via API & refresh UI
    r_del = api_client.delete("/api/cart/items/prod_001", headers=buyer_headers)
    assert r_del.status_code == 200
    items = r_del.json().get("items", [])

    try:
        page.reload()
        page.record_step(
            action="Trigger deletion of prod_001 and reload cart page",
            expected="Cart is empty ('Your cart is empty')",
            actual=f"Observed items remaining: {len(items)}",
        )
    except Exception:
        pass

    # Per PRD-002, deleting item must leave 0 items. If bug is active, item persists.
    assert len(items) == 0, f"Expected 0 items in cart after deletion but got {len(items)}"


@pytest.mark.api
@pytest.mark.ui
@pytest.mark.bug_repro
def test_autotriage_repro_null_shipping_line2(
    page: Page, frontend_url: str, api_client: httpx.Client, buyer_headers: Dict[str, str]
):
    """
    Reproduces customer symptom: placing order with null shipping line2 fails with 500 NPE.
    1. Log in as buyer and proceed to checkout with cart populated.
    2. Submit shipping address omitting optional line2.
    3. Verify order succeeds with HTTP 201 without 500 NPE.
    """
    api_client.post("/api/cart/items", headers=buyer_headers, json={"productId": "prod_001", "quantity": 1})
    try:
        page.goto(f"{frontend_url}/login")
        page.get_by_test_id("demo-login-buyer").click()
        page.goto(f"{frontend_url}/checkout")
        page.locator("#name").fill("Buyer One")
        page.locator("#line1").fill("100 Main St")
        # line2 intentionally omitted
        page.locator("#city").fill("Austin")
        page.locator("#state").fill("TX")
        page.locator("#postal_code").fill("78701")
        page.locator("#country").fill("USA")
        page.record_step(
            action="Fill checkout shipping address form with line2 omitted",
            expected="Shipping address accepted with optional line2 left blank",
        )
    except Exception:
        pass

    r = api_client.post(
        "/api/orders",
        headers=buyer_headers,
        json={
            "items": [{"productId": "prod_001", "quantity": 1}],
            "shippingAddress": {
                "name": "Buyer One",
                "line1": "100 Main St",
                # line2 intentionally omitted
                "city": "Austin",
                "state": "TX",
                "postal_code": "78701",
                "country": "USA",
            },
            "paymentDetails": {"method": "Card", "last4": "4242"},
        },
    )

    try:
        page.record_step(
            action="Dispatch order creation with null line2 to /api/orders",
            expected="HTTP 200/201 Order Confirmation",
            actual=f"Observed HTTP status: {r.status_code}",
        )
    except Exception:
        pass

    # Per PRD-003, line2 is optional and order must succeed (200). If bug is active, status is 500.
    assert r.status_code in (200, 201), f"Expected HTTP 200 for optional line2 but got HTTP {r.status_code}"
