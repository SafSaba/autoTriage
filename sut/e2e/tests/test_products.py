import pytest
from playwright.sync_api import Page, expect


@pytest.mark.ui
@pytest.mark.smoke
def test_catalog_search_and_category_filtering(page: Page, frontend_url: str):
    """Verifies all 8 seeded products load, and tests keyword search, category filter, and Clear Filters."""
    page.goto(f"{frontend_url}/products")
    expect(page.get_by_text("8 products found")).to_be_visible()

    # 1. Search by keyword
    search_input = page.get_by_placeholder("Search products...")
    search_input.fill("Chronograph")
    expect(page.get_by_text("1 product found")).to_be_visible()
    expect(page.get_by_test_id("product-card-prod_001")).to_be_visible()

    # Clear search
    page.get_by_role("button", name="Clear Filters").click()
    expect(page.get_by_text("8 products found")).to_be_visible()

    # 2. Filter by Laptops category checkbox (prod_003, prod_004, prod_008)
    page.get_by_role("checkbox", name="Laptops").click()
    expect(page.get_by_text("3 products found")).to_be_visible()
    expect(page.get_by_test_id("product-card-prod_003")).to_be_visible()
    expect(page.get_by_test_id("product-card-prod_004")).to_be_visible()
    expect(page.get_by_test_id("product-card-prod_008")).to_be_visible()


@pytest.mark.ui
def test_product_detail_page_and_stock_badge(page: Page, frontend_url: str):
    """Clicks a product card to open /products/prod_001 and verifies price, tax, total, and stock badge."""
    page.goto(f"{frontend_url}/products")
    expect(page.get_by_test_id("product-card-prod_001")).to_contain_text("15 in stock")

    page.get_by_test_id("product-card-prod_001").click()
    expect(page).to_have_url(f"{frontend_url}/products/prod_001")

    expect(page.get_by_test_id("product-name")).to_have_text("Chronograph Excellence")
    expect(page.get_by_test_id("product-price")).to_have_text("$450.00")
    expect(page.get_by_text("Total: $495.00")).to_be_visible()
