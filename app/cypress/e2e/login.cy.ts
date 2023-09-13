describe("Login page", () => {
  it("redirects to dashboard after entering correct data", () => {
    cy.signup("test@openearth.org", "Test123!");

    cy.visit("/auth/login");
    cy.contains("Log In");
    cy.get('input[name="email"]').type("test@openearth.org", { log: false });
    cy.get('input[name="password"]').type("Test123!", { log: false });
    cy.get('button[type="submit"]').click();

    cy.url().should("equal", Cypress.config().baseUrl + "/en");
    cy.contains("Welcome Back,");
  });

  it("shows errors when entering invalid data", () => {
    cy.visit("/auth/login");
    cy.contains("Log In");

    cy.get('input[name="email"]').type("testopenearthorg");
    cy.get('input[name="password"]').type("pas");
    cy.get('button[type="submit"]').click();

    cy.url().should("equal", Cypress.config().baseUrl + "/en/auth/login");
    cy.contains("valid email address");
    cy.contains("Minimum length");
  });
});
