describe("Signup page", () => {
  it("redirects to dashboard after entering correct data", () => {
    cy.deleteAccount("signup-test@openearth.org", "Password123!");

    cy.visit("/auth/signup");
    cy.contains("Sign Up");
    cy.get('input[name="name"]').type("Test Account");
    cy.get('input[name="email"]').type("signup-test@openearth.org");
    cy.get('input[name="password"]').type("Password123!");
    cy.get('input[name="confirmPassword"]').type("Password123!");
    cy.get('input[name="inviteCode"]').type("123456");
    cy.get('input[name="acceptTerms"]')
      .siblings(".chakra-checkbox__control")
      .click();
    cy.get('button[type="submit"]').click();

    cy.url().should("contain", "/auth/check-email");
    cy.contains("Check Your Email");
  });

  it("shows errors when entering invalid data", () => {
    cy.visit("/auth/signup");
    cy.contains("Sign Up");
    cy.get('input[name="name"]').type("asd");
    cy.get('input[name="email"]').type("testopenearthorg");
    cy.get('input[name="password"]').type("Pas");
    cy.get('input[name="confirmPassword"]').type("Pa1");
    cy.get('input[name="inviteCode"]').type("12345");
    cy.get('button[type="submit"]').click();

    cy.url().should("contain", "/auth/signup");
    cy.contains("valid email address");
    cy.contains("Minimum length");
    cy.contains("Invalid invite code");
    cy.contains("Please accept the terms");
  });

  it("should require matching passwords", () => {
    cy.visit("/auth/signup");
    cy.contains("Sign Up");
    cy.get('input[name="name"]').type("Test Account");
    cy.get('input[name="email"]').type("test@openearth.org");
    cy.get('input[name="password"]').type("Password1");
    cy.get('input[name="confirmPassword"]').type("Password2");
    cy.get('input[name="inviteCode"]').type("123456");
    cy.get('input[name="acceptTerms"]')
      .siblings(".chakra-checkbox__control")
      .click();
    cy.get('button[type="submit"]').click();

    cy.url().should("contain", "/auth/signup");
    cy.contains("Passwords don't match");
  });
});
