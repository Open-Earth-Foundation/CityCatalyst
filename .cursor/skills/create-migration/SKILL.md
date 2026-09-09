---
name: create-migration
description: Create a Sequelize database migration and model for CityCatalyst. Use when the user asks to add a database table, column, index, modify the schema, or create a new model.
---

# Create Database Migration

## Workflow

### Step 1: Generate Migration File

```bash
cd app && npm run db:gen-migration -- --name add-my-entity
```

This creates `app/migrations/YYYYMMDDHHMMSS-add-my-entity.cjs`.

### Step 2: Write Migration

```javascript
"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("MyEntity", {
      entity_id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
      },
      name: {
        type: Sequelize.STRING(255),
        allowNull: false,
      },
      inventory_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: "Inventory", key: "inventory_id" },
        onDelete: "CASCADE",
      },
      created: {
        type: Sequelize.DATE,
        defaultValue: Sequelize.fn("NOW"),
      },
      last_updated: {
        type: Sequelize.DATE,
        defaultValue: Sequelize.fn("NOW"),
      },
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("MyEntity");
  },
};
```

For column additions:

```javascript
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("ExistingTable", "new_column", {
      type: Sequelize.STRING(255),
      allowNull: true,
    });
  },
  async down(queryInterface) {
    await queryInterface.removeColumn("ExistingTable", "new_column");
  },
};
```

### Step 3: Create Model (if new table)

Create `app/src/models/MyEntity.ts` following the model pattern in the sequelize-database rule.

### Step 4: Register Model

In `app/src/models/init-models.ts`:

1. Import at the top:
```typescript
import type { MyEntityAttributes, MyEntityCreationAttributes } from "./MyEntity";
import { MyEntity as _MyEntity } from "./MyEntity";
```

2. In `initModels()`, add `_MyEntity.initModel(sequelize)`

3. Add associations if needed:
```typescript
_MyEntity.belongsTo(_Inventory, { as: "inventory", foreignKey: "inventoryId" });
_Inventory.hasMany(_MyEntity, { as: "myEntities", foreignKey: "inventoryId" });
```

4. Re-export types at the bottom.

### Step 5: Run Migration

Before executing a migration, identify the effective database target from the selected environment and Sequelize configuration without printing credentials. Prefer a disposable local/test database. A request to create a migration does not authorize applying it to a shared or production database; use such a target only when that execution is explicitly authorized. If no suitable target is available, finish the migration files and report that execution was not verified.

```bash
cd app && npm run db:migrate
```

### Step 6: Verify

Exercise rollback/re-apply only on the disposable test database, confirming the migration being undone is the one introduced by this task. Do not use an unqualified rollback against a shared database or undo a pre-existing migration. If the change includes several migrations, verify each intended migration in order.

```bash
cd app && npm run db:migrate:undo   # Test rollback
cd app && npm run db:migrate        # Re-apply
```

## Checklist

- [ ] Migration file is `.cjs` (CommonJS)
- [ ] `up` and `down` are both implemented (reversible)
- [ ] UUIDs use `Sequelize.UUIDV4` as default
- [ ] Foreign keys have `references` and `onDelete`
- [ ] Model class has `Attributes` and `CreationAttributes` interfaces
- [ ] Model registered in `init-models.ts`
- [ ] Associations defined bidirectionally
