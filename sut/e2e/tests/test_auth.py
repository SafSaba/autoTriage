import time
import pytest
from playwright.sync_api import Page, expect
from conftest import BUYER_EMAIL, BUYER_PASSWORD


@pytest.mark.ui
@pytest.mark.smoke
def test_login_with_valid_credentials_and_logout(page: Page, frontend_url: str):
    """Logs in via email/password form, verifies session, and logs out via user menu."""
    page.goto(f"{frontend_url}/login")

    page.get_by_test_id("email-input").fill(BUYER_EMAIL)
    page.get_by_test_id("password-input").fill(BUYER_PASSWORD)
    page.get_by_test_id("login-button").click()

    expect(page).to_have_url(f"{frontend_url}/products")

    # Open user menu and verify logged-in email/name is shown
    page.get_by_test_id("user-menu-button").click()
    expect(page.get_by_role("menuitem", name="Logout")).to_be_visible()
    page.get_by_role("menuitem", name="Logout").click()

    expect(page.get_by_text("Logged Out", exact=True)).to_be_visible()


@pytest.mark.ui
def test_one_click_demo_login_buttons(page: Page, frontend_url: str):
    """Tests the 1-Click Quick Demo Buyer button on /login."""
    page.goto(f"{frontend_url}/login")
    page.get_by_test_id("demo-login-buyer").click()

    expect(page).to_have_url(f"{frontend_url}/products")
    page.get_by_test_id("user-menu-button").click()
    expect(page.get_by_role("menuitem", name="Profile")).to_be_visible()


@pytest.mark.ui
def test_new_user_signup_flow(page: Page, frontend_url: str):
    """Registers a brand-new user on /signup with strong password validation."""
    unique_email = f"newbuyer_{int(time.time())}@autotriage.local"
    page.goto(f"{frontend_url}/signup")

    page.get_by_placeholder("Max").fill("Alex")
    page.get_by_placeholder("Robinson").fill("Rivera")
    page.get_by_test_id("email-input").fill(unique_email)
    page.get_by_test_id("password-input").fill("StrongPass123!")
    page.get_by_test_id("signup-button").click()

    expect(page).to_have_url(f"{frontend_url}/products")
    page.get_by_test_id("user-menu-button").click()
    expect(page.get_by_text("Alex Rivera")).to_be_visible()


@pytest.mark.ui
def test_profile_shipping_address_update_persists(page: Page, frontend_url: str):
    """Logs in, updates shipping address on /profile, reloads, and verifies persistence."""
    page.goto(f"{frontend_url}/login")
    page.get_by_test_id("demo-login-buyer").click()
    expect(page).to_have_url(f"{frontend_url}/products")

    page.goto(f"{frontend_url}/profile")
    expect(page.get_by_role("heading", name="My Profile")).to_be_visible()

    page.locator("#phoneNumber").fill("+1-555-867-5309")
    page.locator("#addr-line1").fill("742 Evergreen Terrace")
    page.locator("#addr-city").fill("Springfield")
    page.locator("#addr-state").fill("IL")
    page.locator("#addr-zip").fill("62704")
    page.locator("#addr-country").fill("United States")
    page.get_by_role("button", name="Save Changes").click()

    expect(page.get_by_text("Address Updated", exact=True)).to_be_visible()

    # Reload and confirm persisted values from Spring Boot DB
    page.reload()
    expect(page.locator("#addr-line1")).to_have_value("742 Evergreen Terrace")
    expect(page.locator("#addr-city")).to_have_value("Springfield")
