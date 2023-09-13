/// <reference types="cypress" />
// ***********************************************
// This example commands.ts shows you how to
// create various custom commands and overwrite
// existing commands.
//
// For more comprehensive examples of custom
// commands please read more here:
// https://on.cypress.io/custom-commands
// ***********************************************
//
//
// -- This is a parent command --
// Cypress.Commands.add('login', (email, password) => { ... })
//
//
// -- This is a child command --
// Cypress.Commands.add('drag', { prevSubject: 'element'}, (subject, options) => { ... })
//
//
// -- This is a dual command --
// Cypress.Commands.add('dismiss', { prevSubject: 'optional'}, (subject, options) => { ... })
//
//
// -- This will overwrite an existing command --
// Cypress.Commands.overwrite('visit', (originalFn, url, options) => { ... })
//
// declare global {
//   namespace Cypress {
//     interface Chainable {
//       login(email: string, password: string): Chainable<void>
//       drag(subject: string, options?: Partial<TypeOptions>): Chainable<Element>
//       dismiss(subject: string, options?: Partial<TypeOptions>): Chainable<Element>
//       visit(originalFn: CommandOriginalFn, url: string, options: Partial<VisitOptions>): Chainable<Element>
//     }
//   }
// }

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
  }).then((res) => {
    console.log("Signup res", res);
  });
});

Cypress.Commands.add("login", async (email, password) => {
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

export {};
declare global {
  namespace Cypress {
    interface Chainable {
      signup(email: string, password: string): Chainable<void>;
      login(email: string, password: string): Promise<void>;
      logout(): Chainable<void>;
    }
  }
}
