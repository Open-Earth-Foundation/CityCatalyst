describe("Login page", () => {
  it("redirects to dashboard after entering correct data", () => {
    const email = "login-test@openearth.org";
    const password = "Test123!";
    cy.signup(email, password);
    cy.intercept("GET", "/api/auth/session").as("session");

    cy.visit("/auth/login");
    cy.contains("Log In");
    cy.get('input[name="email"]').type(email, { log: false });
    cy.get('input[name="password"]').type(password, { log: false });
    cy.get('button[type="submit"]').click();

    cy.wait("@session");

    // TODO this doesn't work on the `npm run build` version, but only in Cypress
    // cy.url().should("equal", Cypress.config().baseUrl + "/en");
    // cy.contains("Welcome Back,");
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
