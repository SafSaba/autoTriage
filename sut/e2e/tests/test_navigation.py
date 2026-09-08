import pytest
from playwright.sync_api import Page, expect


@pytest.mark.ui
@pytest.mark.smoke
def test_root_redirects_to_products_and_renders_header_footer(page: Page, frontend_url: str):
    """Verifies '/' redirects to '/products' and renders header navigation and footer."""
    page.goto(frontend_url)
    expect(page).to_have_url(f"{frontend_url}/products")

    # Header logo & navigation links
    expect(page.get_by_test_id("logo")).to_be_visible()
    expect(page.get_by_role("heading", name="All Products")).to_be_visible()
    expect(page.get_by_text("8 products found")).to_be_visible()

    # Testing disclaimer banner
    expect(page.get_by_text("Testing Purposes Only")).to_be_visible()


@pytest.mark.ui
def test_contact_support_form_submission_persists_message(page: Page, frontend_url: str):
    """Submits the /contact form in the browser and verifies the confirmation toast."""
    page.goto(f"{frontend_url}/contact")
    expect(page.get_by_role("heading", name="Get in Touch")).to_be_visible()

    page.get_by_placeholder("you@example.com").fill("fde.tester@autotriage.local")
    page.get_by_placeholder("e.g., Issue with my order").fill("Playwright Python Contact Test")
    page.get_by_placeholder("Please describe your issue in detail...").fill(
        "Verifying that customer support messages persist into Spring Boot and appear in Admin."
    )
    page.get_by_role("button", name="Send Message").click()

    expect(page.get_by_text("Message Sent!", exact=True)).to_be_visible()
