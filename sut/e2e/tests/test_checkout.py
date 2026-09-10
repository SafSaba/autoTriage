import httpx
import pytest
from playwright.sync_api import Page, expect


@pytest.mark.ui
@pytest.mark.smoke
def test_end_to_end_checkout_order_confirmation_and_stock_decrement(
    page: Page, frontend_url: str, api_client: httpx.Client
):
    """
    Full E2E purchase journey:
    1. Check initial stock of prod_002 (25 in stock).
    2. Login as Buyer 1, add 2x prod_002 to cart.
    3. Complete /checkout -> /checkout/payment -> /checkout/summary -> Place Order.
    4. Verify /order-confirmation/:orderId, /orders history, and verify prod_002 stock decremented to 23.
    """
    before_stock = api_client.get("/api/products/prod_002").json()["stock"]
    assert before_stock == 25

    # 1. Login
    page.goto(f"{frontend_url}/login")
    page.get_by_test_id("demo-login-buyer").click()
    expect(page).to_have_url(f"{frontend_url}/products")

    # 2. Add 2x prod_002 (Titanium Smartwatch, $799.99 each)
    page.goto(f"{frontend_url}/products/prod_002")
    page.get_by_role("button", name="Increase quantity").click()
    page.get_by_test_id("add-to-cart-button").click()

    # 3. Go to Cart -> Proceed to Checkout
    page.get_by_test_id("cart-button").click()
    expect(page).to_have_url(f"{frontend_url}/cart")
    page.get_by_role("button", name="Proceed to Checkout").click()

    # 4. Shipping Page (/checkout)
    expect(page).to_have_url(f"{frontend_url}/checkout")
    page.locator("#name").fill("Buyer One")
    page.locator("#line1").fill("500 Congress Ave")
    page.locator("#line2").fill("Suite 200")
    page.locator("#city").fill("Austin")
    page.locator("#state").fill("TX")
    page.locator("#postal_code").fill("78701")
    page.locator("#country").fill("United States")
    page.get_by_role("button", name="Continue to Payment").click()

    # 5. Payment Page (/checkout/payment)
    expect(page).to_have_url(f"{frontend_url}/checkout/payment")
    page.locator("#card-name").fill("Buyer One")
    page.locator("#card-number").fill("4242424242424242")
    page.locator("#expiry-date").fill("12/28")
    page.locator("#cvc").fill("123")
    page.get_by_role("button", name="Continue to Summary").click()

    # 6. Summary Page (/checkout/summary) -> Place Order
    expect(page).to_have_url(f"{frontend_url}/checkout/summary")
    expect(page.get_by_text("Card ending in 4242")).to_be_visible()
    page.get_by_test_id("place-order-button").click()

    # 7. Order Confirmation Page (/order-confirmation/:orderId)
    expect(page.get_by_role("heading", name="Thank You for Your Order!")).to_be_visible()
    order_id = page.get_by_test_id("order-id").inner_text().strip()
    assert order_id.startswith("ord_")

    # 8. Verify Stock Decremented in Backend DB (25 -> 23)
    after_stock = api_client.get("/api/products/prod_002").json()["stock"]
    assert after_stock == 23

    # 9. Verify Order appears on /orders page
    page.goto(f"{frontend_url}/orders")
    expect(page.get_by_role("heading", name="My Orders")).to_be_visible()
    expect(page.get_by_text(f"#{order_id[-6:]}")).to_be_visible()
