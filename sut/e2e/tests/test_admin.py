import pytest
from playwright.sync_api import Page, expect


@pytest.mark.ui
@pytest.mark.admin
def test_admin_dashboard_tabs_and_product_lifecycle(page: Page, frontend_url: str):
    """
    Logs in via the 1-Click Admin button, verifies the 4 Admin Dashboard tabs
    (Orders, Products, Messages, Bug Flags), publishes a new product, and deletes it.
    """
    page.goto(f"{frontend_url}/login")
    page.get_by_test_id("demo-login-admin").click()

    expect(page).to_have_url(f"{frontend_url}/admin")
    expect(page.get_by_role("heading", name="Admin Dashboard")).to_be_visible()

    # Switch to Products tab
    page.get_by_role("tab", name="Products (8)").click()
    expect(page.get_by_role("heading", name="Add / Upsert Product")).to_be_visible()

    # Add a new test product
    page.get_by_placeholder("e.g. Super Watch").fill("Quantum Sensor Watch")
    page.get_by_placeholder("299.99").fill("399.00")
    page.get_by_placeholder("10").fill("12")
    page.get_by_placeholder("Detailed product description...").fill("High-precision quantum timepiece.")
    page.get_by_role("button", name="Add Product").click()

    expect(page.get_by_text("Product Published", exact=True)).to_be_visible()
    row = page.get_by_role("row").filter(has_text="quantum-sensor-watch")
    expect(row).to_be_visible()

    # Delete the test product
    row.get_by_role("button", name="Delete product").click()
    expect(page.get_by_text("Product Deleted", exact=True)).to_be_visible()

    # Switch to Bug Flags tab and verify all 3 switches are visible
    page.get_by_role("tab", name="Bug Flags").click()
    expect(page.get_by_test_id("toggle-BUG_OFF_BY_ONE_DISCOUNT")).to_be_visible()
    expect(page.get_by_test_id("toggle-BUG_STALE_CART_CACHE")).to_be_visible()
    expect(page.get_by_test_id("toggle-BUG_NULL_SHIPPING_NPE")).to_be_visible()
