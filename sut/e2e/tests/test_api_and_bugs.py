from typing import Dict
import httpx
import pytest


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
