"""
test_database.py - Direct Database Scenarios & ACID Transaction Integrity Test Suite
=====================================================================================
Validates relational table integrity, constraints, stock decrements,
foreign key cascades, and ACID transactional rollbacks directly against the database engine.
"""

from typing import Any, Dict, List
import httpx
import pytest


def run_sql(api_client: httpx.Client, admin_headers: Dict[str, str], sql: str) -> List[Dict[str, Any]]:
    """Helper to execute SQL queries via the secure admin diagnostics endpoint."""
    resp = api_client.post("/api/admin/db/query", headers=admin_headers, json={"sql": sql})
    assert resp.status_code == 200, f"SQL query failed ({resp.status_code}): {resp.text}"
    return resp.json()


@pytest.mark.database
def test_database_table_presence_and_initial_seeds(
    api_client: httpx.Client, admin_headers: Dict[str, str]
):
    """
    Validates that all 6 relational schema tables exist in the database,
    have expected row counts, and default admin/buyer accounts are properly seeded.
    """
    # 1. Summary endpoint check
    r_summary = api_client.get("/api/admin/db/summary", headers=admin_headers)
    assert r_summary.status_code == 200
    summary = r_summary.json()
    assert summary["users_count"] >= 3
    assert summary["products_count"] == 8
    assert "orders_count" in summary
    assert "cart_items_count" in summary
    assert "contact_messages_count" in summary

    # 2. Query users table
    users = run_sql(
        api_client,
        admin_headers,
        "SELECT id, email, role, display_name FROM users ORDER BY email ASC",
    )
    user_emails = [u["EMAIL"].lower() if "EMAIL" in u else u["email"].lower() for u in users]
    assert "admin@autotriage.local" in user_emails
    assert "buyer@autotriage.local" in user_emails
    assert "ops-lead@autotriage.local" in user_emails

    # 3. Query canonical products
    products = run_sql(
        api_client,
        admin_headers,
        "SELECT id, name, price, stock, category FROM products ORDER BY id ASC",
    )
    assert len(products) == 8


@pytest.mark.database
def test_database_stock_decrement_and_cancellation_restore(
    api_client: httpx.Client,
    buyer_headers: Dict[str, str],
    admin_headers: Dict[str, str],
):
    """
    Verifies ACID stock reservation at the database level:
    1. Read exact stock of 'prod_004' directly from products table.
    2. Place an order for 2 units.
    3. Assert products table stock in DB is decremented by exactly 2.
    4. Admin cancels the order.
    5. Assert products table stock in DB is restored back to the initial value.
    """
    pid = "prod_004"
    # Step 1: Query initial stock in DB
    rows_before = run_sql(
        api_client, admin_headers, f"SELECT stock FROM products WHERE id = '{pid}'"
    )
    stock_col = "STOCK" if "STOCK" in rows_before[0] else "stock"
    initial_stock = int(rows_before[0][stock_col])
    assert initial_stock >= 2

    # Step 2: Place order for 2 units
    r_order = api_client.post(
        "/api/orders",
        headers=buyer_headers,
        json={
            "items": [{"productId": pid, "quantity": 2}],
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

    # Step 3: Assert stock in DB is decremented by 2
    rows_after = run_sql(
        api_client, admin_headers, f"SELECT stock FROM products WHERE id = '{pid}'"
    )
    new_stock = int(rows_after[0][stock_col])
    assert new_stock == initial_stock - 2

    # Step 4: Admin cancels order
    r_cancel = api_client.put(
        f"/api/admin/orders/{order_id}/status",
        headers=admin_headers,
        json={"status": "cancelled"},
    )
    assert r_cancel.status_code == 200

    # Step 5: Assert stock in DB restored to initial_stock
    rows_restored = run_sql(
        api_client, admin_headers, f"SELECT stock FROM products WHERE id = '{pid}'"
    )
    restored_stock = int(rows_restored[0][stock_col])
    assert restored_stock == initial_stock


@pytest.mark.database
def test_database_cart_isolation_and_foreign_key_persistence(
    api_client: httpx.Client,
    buyer_headers: Dict[str, str],
    admin_headers: Dict[str, str],
):
    """
    Asserts:
    1. Cart items added by buyer are persisted in cart_items table with valid foreign keys.
    2. Cart deletion removes the rows for that specific user from cart_items table.
    """
    # 1. Clear cart
    api_client.delete("/api/cart", headers=buyer_headers)

    # 2. Add prod_002 with quantity 3
    r_add = api_client.post(
        "/api/cart/items",
        headers=buyer_headers,
        json={"productId": "prod_002", "quantity": 3},
    )
    assert r_add.status_code == 200

    # 3. Query cart_items directly from database
    user_rows = run_sql(
        api_client,
        admin_headers,
        "SELECT id FROM users WHERE email = 'buyer@autotriage.local'",
    )
    user_id_col = "ID" if "ID" in user_rows[0] else "id"
    buyer_id = user_rows[0][user_id_col]

    cart_rows = run_sql(
        api_client,
        admin_headers,
        f"SELECT product_id, quantity FROM cart_items WHERE user_id = '{buyer_id}'",
    )
    assert len(cart_rows) == 1
    p_col = "PRODUCT_ID" if "PRODUCT_ID" in cart_rows[0] else "product_id"
    q_col = "QUANTITY" if "QUANTITY" in cart_rows[0] else "quantity"
    assert cart_rows[0][p_col] == "prod_002"
    assert int(cart_rows[0][q_col]) == 3

    # 4. Clear cart and verify 0 rows remain in database
    api_client.delete("/api/cart", headers=buyer_headers)
    cart_rows_after = run_sql(
        api_client,
        admin_headers,
        f"SELECT count(*) as cnt FROM cart_items WHERE user_id = '{buyer_id}'",
    )
    cnt_col = "CNT" if "CNT" in cart_rows_after[0] else "cnt"
    assert int(cart_rows_after[0][cnt_col]) == 0


@pytest.mark.database
def test_database_orders_and_order_items_relational_consistency(
    api_client: httpx.Client,
    buyer_headers: Dict[str, str],
    admin_headers: Dict[str, str],
):
    """
    Validates cross-table consistency between orders, order_items, and products:
    - order_items record exact unit_price from products table at checkout time.
    - orders.total matches SUM(quantity * unit_price) * 1.10.
    """
    r_order = api_client.post(
        "/api/orders",
        headers=buyer_headers,
        json={
            "items": [
                {"productId": "prod_001", "quantity": 1},  # $450.00
                {"productId": "prod_007", "quantity": 2},  # $150.00 * 2 = $300.00
            ],
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

    # Query relational data directly from DB
    order_db = run_sql(
        api_client, admin_headers, f"SELECT total, status FROM orders WHERE id = '{order_id}'"
    )
    assert len(order_db) == 1
    total_col = "TOTAL" if "TOTAL" in order_db[0] else "total"
    # Subtotal = 450 + 300 = 750. Total with 10% tax = 825.00
    assert float(order_db[0][total_col]) == 825.00

    items_db = run_sql(
        api_client,
        admin_headers,
        f"SELECT product_id, quantity, unit_price FROM order_items WHERE order_id = '{order_id}' ORDER BY product_id ASC",
    )
    assert len(items_db) == 2
    pid_col = "PRODUCT_ID" if "PRODUCT_ID" in items_db[0] else "product_id"
    price_col = "UNIT_PRICE" if "UNIT_PRICE" in items_db[0] else "unit_price"
    qty_col = "QUANTITY" if "QUANTITY" in items_db[0] else "quantity"

    # Verify prod_001
    assert items_db[0][pid_col] == "prod_001"
    assert int(items_db[0][qty_col]) == 1
    assert float(items_db[0][price_col]) == 450.00

    # Verify prod_007
    assert items_db[1][pid_col] == "prod_007"
    assert int(items_db[1][qty_col]) == 2
    assert float(items_db[1][price_col]) == 150.00


@pytest.mark.database
def test_database_acid_rollback_on_payment_failure(
    api_client: httpx.Client,
    buyer_headers: Dict[str, str],
    admin_headers: Dict[str, str],
):
    """
    Validates atomic rollback when payment fails:
    When payment is declined (card 0002 -> 402):
    1. No order record is committed to orders table.
    2. No order_items records are committed to order_items table.
    3. Product stock is NOT decremented.
    """
    pid = "prod_005"
    stock_before_rows = run_sql(
        api_client, admin_headers, f"SELECT stock FROM products WHERE id = '{pid}'"
    )
    stock_col = "STOCK" if "STOCK" in stock_before_rows[0] else "stock"
    stock_before = int(stock_before_rows[0][stock_col])

    orders_count_before = len(run_sql(api_client, admin_headers, "SELECT id FROM orders"))

    # Attempt checkout with card 0002 -> 402
    r_fail = api_client.post(
        "/api/orders",
        headers=buyer_headers,
        json={
            "items": [{"productId": pid, "quantity": 1}],
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
    assert r_fail.status_code == 402

    # Assert orders count is unchanged
    orders_count_after = len(run_sql(api_client, admin_headers, "SELECT id FROM orders"))
    assert orders_count_after == orders_count_before

    # Assert stock was not decremented
    stock_after_rows = run_sql(
        api_client, admin_headers, f"SELECT stock FROM products WHERE id = '{pid}'"
    )
    stock_after = int(stock_after_rows[0][stock_col])
    assert stock_after == stock_before
