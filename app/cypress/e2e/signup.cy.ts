describe('Signup page', () => {
  it('redirects to dashboard after entering correct data', () => {
    cy.visit('/signup')
    cy.contains('Sign Up')
    cy.get('input[name="name"]').type('Test Account')
    cy.get('input[name="email"]').type('test@openearth.org')
    cy.get('input[name="password"]').type('Password1')
    cy.get('input[name="confirmPassword"]').type('Password1')
    cy.get('input[name="inviteCode"]').type('ABCDEF')
    cy.get('input[name="acceptTerms"]').siblings('.chakra-checkbox__control').click()
    cy.get('button[type="submit"]').click()

    cy.url().should('contain', '/check-email')
    cy.contains('Check Your Email')
  })

  it('shows errors when entering invalid data', () => {
    cy.visit('/signup')
    cy.contains('Sign Up')
    cy.get('input[name="name"]').type('asd')
    cy.get('input[name="email"]').type('testopenearthorg')
    cy.get('input[name="password"]').type('Pas')
    cy.get('input[name="confirmPassword"]').type('Pa1')
    cy.get('input[name="inviteCode"]').type('ABCDE')
    cy.get('button[type="submit"]').click()

    cy.url().should('contain', '/signup')
    cy.contains('valid email address')
    cy.contains('Minimum length')
    cy.contains('Invalid invite code')
    cy.contains('Please accept the terms')
  })

  it('should require matching passwords', () => {
    cy.visit('/signup')
    cy.contains('Sign Up')
    cy.get('input[name="name"]').type('Test Account')
    cy.get('input[name="email"]').type('test@openearth.org')
    cy.get('input[name="password"]').type('Password1')
    cy.get('input[name="confirmPassword"]').type('Password2')
    cy.get('input[name="inviteCode"]').type('ABCDEF')
    cy.get('input[name="acceptTerms"]').siblings('.chakra-checkbox__control').click()
    cy.get('button[type="submit"]').click()

    cy.url().should('contain', '/signup')
    cy.contains('Passwords don\'t match')
  })
})

