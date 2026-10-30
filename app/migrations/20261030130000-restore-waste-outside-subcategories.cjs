"use strict";

/**
 * Restores the III.x.3 subcategories (waste generated outside the city and
 * treated inside it) with their original ids, and gives VI.1 its scope 3, so
 * import can store these references. They count in territorial scope 1 and stay
 * out of BASIC and BASIC+ totals.
 *
 * 20250403172658 removed the subcategories because the manual forms had scope 3
 * rows keyed as .3. Those form keys are .2 now, so restoring them does not bring
 * that bug back. Do not use the down of 20250403172658 (it is broken) or of
 * 20250520074743 (it would turn every III.x.2 row into .3).
 *
 * This migration changes no InventoryValue. On a new database the catalogue is
 * seeded after migrations, so every statement here matches nothing and the seed
 * CSVs supply the rows.
 */

const SCOPE_1 = "503d4c60-3ff0-3d2b-9ea0-6fb5b0078031";
const SCOPE_3 = "ce09d866-a134-35a8-88b8-e4f08b21af3a";
const REPORTING_LEVEL = "7b8bd2cf-13a0-3a76-8d50-e08b4321703a";

const SUBCATEGORIES = [
  {
    id: "e7218f77-9896-30db-8a47-afb6b1d084a8",
    subsectorId: "172d10c0-6b80-3173-902e-eca5c0af84c8",
    name: "Emissions from waste generated outside the city boundary and disposed in landfills or open dumps within the city boundary",
    reference: "III.1.3",
  },
  {
    id: "70d968e6-e9f7-37d8-94e1-8197e6f8332b",
    subsectorId: "a8baeb06-0ab2-3215-a93e-2fcbe0e8f8a9",
    name: "Emissions from waste generated outside the city boundary but treated biologically within the city boundary",
    reference: "III.2.3",
  },
  {
    id: "7582e783-dfd5-3caa-a06a-e10bcc75e089",
    subsectorId: "0ed16605-c76a-3c07-892d-4383a7618943",
    name: "Emissions from waste generated outside the city boundary but treated within the city boundary",
    reference: "III.3.3",
  },
  {
    id: "af68e0d7-f55a-3827-aa53-369d98e210f8",
    subsectorId: "c465e7a2-1634-337f-819a-2dfbe147927e",
    name: "Emissions from wastewater generated outside the city boundary but treated within the city boundary",
    reference: "III.4.3",
  },
];

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      for (const subCategory of SUBCATEGORIES) {
        await queryInterface.sequelize.query(
          `
          INSERT INTO "SubCategory"
            (subcategory_id, subsector_id, subcategory_name, reference_number,
             scope_id, reportinglevel_id, created, last_updated)
          SELECT :id, ss.subsector_id, :name, :reference,
                 :scopeId, :reportingLevel, NOW(), NOW()
          FROM "SubSector" ss
          WHERE ss.subsector_id = :subsectorId
            AND NOT EXISTS (
              SELECT 1 FROM "SubCategory" WHERE reference_number = :reference
            )
          ON CONFLICT DO NOTHING
          `,
          {
            replacements: {
              ...subCategory,
              scopeId: SCOPE_1,
              reportingLevel: REPORTING_LEVEL,
            },
            transaction,
          },
        );
      }
      await queryInterface.sequelize.query(
        `
        UPDATE "SubSector" SET scope_id = :scopeId
        WHERE reference_number = 'VI.1' AND scope_id IS NULL
        `,
        { replacements: { scopeId: SCOPE_3 }, transaction },
      );
    });
  },

  async down(queryInterface) {
    const ids = SUBCATEGORIES.map((subCategory) => subCategory.id);
    await queryInterface.sequelize.transaction(async (transaction) => {
      // A subcategory in use stays: deleting it would cascade or lose its link.
      await queryInterface.sequelize.query(
        `
        DELETE FROM "SubCategory" sc
        WHERE sc.subcategory_id IN (:ids)
          AND NOT EXISTS (
            SELECT 1 FROM "InventoryValue" iv
            WHERE iv.sub_category_id = sc.subcategory_id
          )
          AND NOT EXISTS (
            SELECT 1 FROM "DataSource" ds
            WHERE ds.subcategory_id = sc.subcategory_id
          )
          AND NOT EXISTS (
            SELECT 1 FROM "DataSourceI18n" ds
            WHERE ds.subcategory_id = sc.subcategory_id
          )
        `,
        { replacements: { ids }, transaction },
      );
      await queryInterface.sequelize.query(
        `
        UPDATE "SubSector" SET scope_id = NULL
        WHERE reference_number = 'VI.1' AND scope_id = :scopeId
        `,
        { replacements: { scopeId: SCOPE_3 }, transaction },
      );
    });
  },
};
