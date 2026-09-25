import pytest
from playwright.sync_api import Page, expect
from conftest import BUYER_EMAIL


@pytest.mark.ui
def test_login_form_empty_and_wrong_password_red_errors(page: Page, frontend_url: str):
    """
    Verifies:
    1. Submitting empty login form shows red inline validation errors ('Invalid email address', 'Password is required').
    2. Submitting wrong password triggers HTTP 401 and displays destructive red toast ('Login Failed' / 'Invalid credentials').
    """
    page.goto(f"{frontend_url}/login")

    # 1. Submit empty form -> inline red validation messages
    page.get_by_test_id("login-button").click()
    email_err = page.get_by_text("Invalid email address")
    pass_err = page.get_by_text("Password is required")
    expect(email_err).to_be_visible()
    expect(pass_err).to_be_visible()

    # 2. Submit valid email + wrong password -> destructive red toast
    page.get_by_test_id("email-input").fill(BUYER_EMAIL)
    page.get_by_test_id("password-input").fill("WrongPassword999!")
    page.get_by_test_id("login-button").click()

    expect(page.get_by_text("Login Failed", exact=True)).to_be_visible()
    expect(page.get_by_text("Invalid credentials", exact=True)).to_be_visible()
    # User remains on /login
    expect(page).to_have_url(f"{frontend_url}/login")


@pytest.mark.ui
def test_signup_form_invalid_name_and_weak_password_red_errors(page: Page, frontend_url: str):
    """
    Verifies red inline validation messages on /signup for:
    - Missing First name / Last name ('First name is required', 'Last name is required')
    - Invalid email ('Invalid email address')
    - Weak password (<12 chars, missing uppercase, missing special char)
    - Duplicate existing email ('Signup Failed')
    """
    page.goto(f"{frontend_url}/signup")

    # 1. Click Create an account with empty fields
    page.get_by_test_id("signup-button").click()
    expect(page.get_by_text("First name is required")).to_be_visible()
    expect(page.get_by_text("Last name is required")).to_be_visible()
    expect(page.get_by_text("Invalid email address")).to_be_visible()
    expect(page.get_by_text("Password must be at least 12 characters long")).to_be_visible()

    # 2. Enter 12+ lowercase chars without uppercase -> check uppercase error
    page.get_by_placeholder("Max").fill("John")
    page.get_by_placeholder("Robinson").fill("Smith")
    page.get_by_test_id("email-input").fill(BUYER_EMAIL)
    page.get_by_test_id("password-input").fill("alllowercase1234")
    page.get_by_test_id("signup-button").click()
    expect(page.get_by_text("Password must contain at least one uppercase letter")).to_be_visible()

    # 3. Enter uppercase but no special char -> check special character error
    page.get_by_test_id("password-input").fill("WithUppercase1234")
    page.get_by_test_id("signup-button").click()
    expect(page.get_by_text("Password must contain at least one special character")).to_be_visible()

    # 4. Try registering with an already-existing seeded email -> destructive toast 'Signup Failed'
    page.get_by_test_id("email-input").fill(BUYER_EMAIL)
    page.get_by_test_id("password-input").fill("ValidPass1234!")
    page.get_by_test_id("signup-button").click()
    expect(page.get_by_text("Signup Failed", exact=True).first).to_be_visible()


@pytest.mark.ui
def test_checkout_shipping_incorrect_address_and_payment_card_validation(page: Page, frontend_url: str):
    """
    Verifies red field-level error messages during Checkout:
    1. On /checkout (Shipping Address): clearing fields / entering too-short values triggers:
       - 'Name must be at least 2 characters.'
       - 'Address must be at least 5 characters.'
       - 'City must be at least 2 characters.'
       - 'State must be at least 2 characters.'
       - 'Postal code must be at least 5 characters.'
       - 'Country must be at least 2 characters.'
    2. On /checkout/payment (Payment Method): invalid card name, non-16-digit card number,
       bad expiry format, and bad CVC trigger red error messages.
    3. Using declined mock card ending in '0002' triggers red 'Order Failed' toast on Place Order.
    """
    # Login and add 1 item so we can access checkout
    page.goto(f"{frontend_url}/login")
    page.get_by_test_id("demo-login-buyer").click()
    expect(page).to_have_url(f"{frontend_url}/products")

    page.goto(f"{frontend_url}/products/prod_001")
    page.get_by_test_id("add-to-cart-button").click()

    # 1. Go to /checkout and enter invalid/short shipping address fields
    page.goto(f"{frontend_url}/checkout")
    page.locator("#name").fill("A")
    page.locator("#line1").fill("123")
    page.locator("#city").fill("X")
    page.locator("#state").fill("T")
    page.locator("#postal_code").fill("123")
    page.locator("#country").fill("U")
    page.get_by_role("button", name="Continue to Payment").click()

    expect(page.get_by_text("Name must be at least 2 characters.")).to_be_visible()
    expect(page.get_by_text("Address must be at least 5 characters.")).to_be_visible()
    expect(page.get_by_text("City must be at least 2 characters.")).to_be_visible()
    expect(page.get_by_text("State must be at least 2 characters.")).to_be_visible()
    expect(page.get_by_text("Postal code must be at least 5 characters.")).to_be_visible()
    expect(page.get_by_text("Country must be at least 2 characters.")).to_be_visible()

    # Fix shipping address and proceed to /checkout/payment
    page.locator("#name").fill("Buyer One")
    page.locator("#line1").fill("500 Congress Ave")
    page.locator("#city").fill("Austin")
    page.locator("#state").fill("TX")
    page.locator("#postal_code").fill("78701")
    page.locator("#country").fill("United States")
    page.get_by_role("button", name="Continue to Payment").click()

    # 2. On /checkout/payment, test invalid card inputs
    expect(page).to_have_url(f"{frontend_url}/checkout/payment")
    page.locator("#card-name").fill("B")
    page.locator("#card-number").fill("12345")
    page.locator("#expiry-date").fill("13/99")
    page.locator("#cvc").fill("12")
    page.get_by_role("button", name="Continue to Summary").click()

    expect(page.get_by_text("Name must be at least 2 characters.")).to_be_visible()
    expect(page.get_by_text("Card number must be 16 digits.")).to_be_visible()
    expect(page.get_by_text("Expiry date must be in MM/YY format.")).to_be_visible()
    expect(page.get_by_text("CVC must be 3 or 4 digits.")).to_be_visible()

    # 3. Enter a 16-digit card ending in '0002' (Mock Payment Gateway declined card)
    page.locator("#card-name").fill("Buyer One")
    page.locator("#card-number").fill("4000000000000002")
    page.locator("#expiry-date").fill("12/28")
    page.locator("#cvc").fill("123")
    page.get_by_role("button", name="Continue to Summary").click()

    expect(page).to_have_url(f"{frontend_url}/checkout/summary")
    page.get_by_test_id("place-order-button").click()

    expect(page.get_by_text("Order Failed", exact=True)).to_be_visible()
    expect(page.get_by_text("Payment declined by issuer (card ending in 0002)", exact=True)).to_be_visible()


@pytest.mark.ui
def test_profile_and_contact_invalid_inputs_red_errors(page: Page, frontend_url: str):
    """
    Verifies red validation error messages on:
    1. /contact when Email is invalid, Subject is blank, or Message is <10 characters.
    2. /profile when First Name, Last Name, or Shipping Address fields are too short/empty.
    """
    # 1. Contact Page validation
    page.goto(f"{frontend_url}/contact")
    page.get_by_placeholder("you@example.com").fill("not-an-email")
    page.get_by_placeholder("Please describe your issue in detail...").fill("Too short")
    page.get_by_role("button", name="Send Message").click()

    expect(page.get_by_text("Please enter a valid email address.")).to_be_visible()
    expect(page.get_by_text("Subject is required.")).to_be_visible()
    expect(page.get_by_text("Message must be at least 10 characters long.")).to_be_visible()

    # 2. Profile Page validation
    page.goto(f"{frontend_url}/login")
    page.get_by_test_id("demo-login-buyer").click()
    expect(page).to_have_url(f"{frontend_url}/products")

    page.goto(f"{frontend_url}/profile")
    expect(page.get_by_role("heading", name="My Profile")).to_be_visible()

    page.locator("#firstName").fill("A")
    page.locator("#lastName").fill("B")
    page.locator("#addr-name").fill("C")
    page.locator("#addr-line1").fill("123")
    page.locator("#addr-city").fill("D")
    page.locator("#addr-state").fill("E")
    page.locator("#addr-zip").fill("12")
    page.locator("#addr-country").fill("F")
    page.get_by_role("button", name="Save Changes").click()

    expect(page.get_by_text("First name must be at least 2 characters")).to_be_visible()
    expect(page.get_by_text("Last name must be at least 2 characters")).to_be_visible()
    expect(page.get_by_text("Full name is required")).to_be_visible()
    expect(page.get_by_text("Address Line 1 is required")).to_be_visible()
    expect(page.get_by_text("City is required")).to_be_visible()
    expect(page.get_by_text("State is required")).to_be_visible()
    expect(page.get_by_text("Zip/Postal code is required")).to_be_visible()
    expect(page.get_by_text("Country is required")).to_be_visible()
