describe('Login page', () => {
  it('redirects to dashboard after entering correct data', () => {
    cy.visit('/login')
    cy.contains('Log In')
    cy.get('input[name="email"]').type('test@openearth.org')
    cy.get('input[name="password"]').type('password')
    cy.get('button[type="submit"]').click()

    cy.url().should('equal', Cypress.config().baseUrl + '/en')
    cy.contains('Welcome Back,')
  })

  it('shows errors when entering invalid data', () => {
    cy.visit('/login')
    cy.contains('Log In')

    cy.get('input[name="email"]').type('testopenearthorg')
    cy.get('input[name="password"]').type('pas')
    cy.get('button[type="submit"]').click()

    cy.url().should('equal', Cypress.config().baseUrl + '/en/login')
    cy.contains('valid email address')
    cy.contains('Minimum length')
  })
})

