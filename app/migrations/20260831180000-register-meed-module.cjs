"use strict";

const MODULE_ID = "9f622243-fba8-4f32-a000-ce6e66982bd1";

/**
 * Registers the Actions & Plans v2 module.
 *
 * This duplicates `seed-data/modules/modules.json`, which is not ideal — but
 * seeding does not guarantee the row reaches a deployed environment. The deploy
 * runs migrations behind a check that halts on failure, then creates the seed
 * Job with `kubectl create` and moves on without ever inspecting its outcome.
 * A seeder that fails, or that never runs because an earlier seeder in the
 * chain threw, is silent.
 *
 * That is not hypothetical: after #2956 merged and deployed successfully, this
 * module was absent from dev's Module table while every seeded module around it
 * was present. Concept Note Builder, added a week earlier, is present — and it
 * arrived through exactly this pattern (20260824070000).
 *
 * Also grants the module to existing projects, which the seeder does not do at
 * all. Without that row in `ProjectModules` the module cannot be enabled for a
 * project even once the Module row exists.
 */
const moduleRecord = {
  id: MODULE_ID,
  type: "OEF",
  stage: "plan",
  name: {
    de: "Maßnahmen & Pläne v2",
    en: "Actions & Plans v2",
    es: "Acciones y Planes v2",
    fr: "Actions et Plans v2",
    pt: "Ações e Planos v2",
  },
  description: {
    de: "Priorisieren Sie wirkungsstarke Klimaschutzmaßnahmen auf Basis des Treibhausgasinventars, des sozioökonomischen Kontexts, der Vorschriften und der strategischen Prioritäten Ihrer Stadt. Das Modul erstellt eine bewertete Maßnahmenliste und umsetzungsreife Aktionspläne.",
    en: "Prioritize high-impact climate mitigation actions based on your city's greenhouse gas inventory, socioeconomic context, regulations and strategic priorities. The module produces a ranked action list and implementation-ready output plans.",
    es: "Prioriza acciones de mitigación climática de alto impacto según el inventario de gases de efecto invernadero, el contexto socioeconómico, las regulaciones y las prioridades estratégicas de tu ciudad. El módulo produce una lista de acciones clasificadas y planes de implementación listos para usar.",
    fr: "Priorisez des actions d'atténuation climatique à fort impact selon l'inventaire des gaz à effet de serre, le contexte socio-économique, les réglementations et les priorités stratégiques de votre ville. Le module produit une liste d'actions classées et des plans de mise en œuvre prêts à l'emploi.",
    pt: "Priorize ações de mitigação climática de alto impacto com base no inventário de gases de efeito estufa, no contexto socioeconômico, nas regulamentações e nas prioridades estratégicas da sua cidade. O módulo produz uma lista de ações classificadas e planos de implementação prontos para uso.",
  },
  tagline: {
    de: "Nächste Generation der Maßnahmenpriorisierung, gestützt auf das Treibhausgasinventar Ihrer Stadt.",
    en: "Next-generation action prioritization, driven by your city's greenhouse gas inventory.",
    es: "Priorización de acciones de nueva generación, impulsada por el inventario de gases de efecto invernadero de tu ciudad.",
    fr: "Priorisation des actions de nouvelle génération, fondée sur l'inventaire des gaz à effet de serre de votre ville.",
    pt: "Priorização de ações de nova geração, orientada pelo inventário de gases de efeito estufa da sua cidade.",
  },
  author: "OEF",
  url: "/MEED",
  status: "beta",
};

/** @type {import("sequelize-cli").Migration} */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.sequelize.query(
        `
          INSERT INTO "Module" (
            id, type, stage, name, description, tagline, author, url,
            status, created, last_updated
          ) VALUES (
            :id, :type, :stage, CAST(:name AS JSONB),
            CAST(:description AS JSONB), CAST(:tagline AS JSONB), :author,
            :url, :status, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
          )
          ON CONFLICT (id) DO UPDATE SET
            type = EXCLUDED.type,
            stage = EXCLUDED.stage,
            name = EXCLUDED.name,
            description = EXCLUDED.description,
            tagline = EXCLUDED.tagline,
            author = EXCLUDED.author,
            url = EXCLUDED.url,
            status = EXCLUDED.status,
            last_updated = CURRENT_TIMESTAMP
        `,
        {
          replacements: {
            ...moduleRecord,
            name: JSON.stringify(moduleRecord.name),
            description: JSON.stringify(moduleRecord.description),
            tagline: JSON.stringify(moduleRecord.tagline),
          },
          transaction,
        },
      );

      await queryInterface.sequelize.query(
        `
          INSERT INTO "ProjectModules" (
            project_id, module_id, created, last_updated
          )
          SELECT project_id, :moduleId, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
          FROM "Project"
          ON CONFLICT (module_id, project_id) DO NOTHING
        `,
        { replacements: { moduleId: MODULE_ID }, transaction },
      );
    });
  },

  async down(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.bulkDelete(
        "ProjectModules",
        { module_id: MODULE_ID },
        { transaction },
      );
      await queryInterface.bulkDelete(
        "Module",
        { id: MODULE_ID },
        { transaction },
      );
    });
  },
};
