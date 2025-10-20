'use strict';

/** 
 * TEST MIGRATION - INTENTIONALLY FAILS TO TEST SLACK ALERTS
 * This migration should be deleted after testing
 * @type {import('sequelize-cli').Migration} 
 */
module.exports = {
  async up (queryInterface, Sequelize) {
    // This will intentionally fail to test Slack alert system
    throw new Error('TEST MIGRATION FAILURE - This is intentional to test Slack alerts. Please delete this migration after testing.');
  },

  async down (queryInterface, Sequelize) {
    // Nothing to revert since up() always fails
    console.log('Rolling back test migration - no changes to revert');
  }
};
