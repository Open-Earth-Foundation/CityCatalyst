import { before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import 'dotenv/config';

import { db } from '@/models';

const email = 'test@openearth.org';
const locode = 'DE_BER';

describe('Models', () => {
  before(async () => {
    await db.initialize();
    await db.models.User.destroy({ truncate: { cascade: true } });
    await db.models.City.destroy({ truncate: { cascade: true } });
  });

  describe('User model', () => {
    it('should have unique emails', async () => {
      const user = await db.models.User.create({ userId: randomUUID(), email });
      assert.equal(user.email, email);
      await assert.rejects(async () => {
        await db.models.User.create({ userId: randomUUID(), email });
      });
    });
  });

  describe('City model', () => {
    it('should have unique UN locodes', async () => {
      const city = await db.models.City.create({ cityId: randomUUID(), locode });
      assert.equal(city.locode, locode);
      await assert.rejects(async () => {
        await db.models.City.create({ cityId: randomUUID(), locode });
      });
    });
  });
})

