// https://on.cypress.io/custom-commands

Cypress.Commands.add("signup", (email, password) => {
  cy.request({
    method: "POST",
    url: "/api/v0/auth/register",
    failOnStatusCode: false,
    body: {
      email,
      password,
      confirmPassword: password,
      name: "Test Account",
      inviteCode: "123456",
      acceptTerms: true,
    },
  });
});

Cypress.Commands.add("login", (email, password) => {
  cy.request("/api/auth/csrf").then((csrfRes) => {
    expect(csrfRes.body).to.have.property("csrfToken");
    const csrfToken = csrfRes.body.csrfToken;
    cy.request("POST", "/api/auth/signin/credentials", {
      csrfToken,
      email,
      password,
    }).then((res) => {
      console.log(res.body);
    });
  });
});

Cypress.Commands.add("logout", () => {
  cy.visit("/api/auth/signout");
  cy.get("form").submit();
});

Cypress.Commands.add("deleteAccount", (email, password) => {
  // cy.login(email, password);
  cy.visit("/auth/login");
  cy.get('input[name="email"]').type(email, { log: false });
  cy.get('input[name="password"]').type(password, { log: false });
  cy.get('button[type="submit"]').click();

  cy.request({
    method: "POST",
    url: "/api/v0/auth/delete",
  });
});

export {};
declare global {
  namespace Cypress {
    interface Chainable {
      signup(email: string, password: string): Chainable<void>;
      login(email: string, password: string): Chainable<void>;
      logout(): Chainable<void>;
      deleteAccount(email, password: string): Chainable<void>;
    }
  }
}
