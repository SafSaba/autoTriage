import pytest
from playwright.sync_api import Page, expect


@pytest.mark.ui
def test_unauthenticated_add_to_cart_redirects_to_login(page: Page, frontend_url: str):
    """Verifies clicking Add to Cart while logged out shows Authentication Required and redirects to /login."""
    page.goto(f"{frontend_url}/products")
    card = page.get_by_test_id("product-card-prod_001")
    card.get_by_test_id("add-to-cart-button").click()

    expect(page).to_have_url(f"{frontend_url}/login?redirect=/products")
    expect(page.get_by_text("Authentication Required", exact=True)).to_be_visible()


@pytest.mark.ui
@pytest.mark.smoke
def test_authenticated_cart_add_merge_quantity_and_remove(page: Page, frontend_url: str):
    """Logs in, adds a product to cart, updates quantity on /cart, verifies 10% tax math, and removes item."""
    page.goto(f"{frontend_url}/login")
    page.get_by_test_id("demo-login-buyer").click()
    expect(page).to_have_url(f"{frontend_url}/products")

    # Add Chronograph Excellence ($450.00) from product detail page with quantity 2
    page.goto(f"{frontend_url}/products/prod_001")
    page.get_by_role("button", name="Increase quantity").click()
    page.get_by_test_id("add-to-cart-button").click()

    # Open Cart page
    page.get_by_test_id("cart-button").click()
    expect(page).to_have_url(f"{frontend_url}/cart")

    expect(page.get_by_test_id("cart-item-prod_001")).to_be_visible()
    expect(page.locator("#cart-subtotal")).to_have_text("$900.00")
    expect(page.locator("#cart-total")).to_have_text("$990.00")

    # Remove item from cart
    page.get_by_test_id("remove-item-prod_001").click()
    expect(page.get_by_text("Your cart is empty")).to_be_visible()
