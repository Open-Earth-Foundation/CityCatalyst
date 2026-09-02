"use strict";

const MODULE_ID = "7a2d4acc-230f-4810-ace6-a3c339f1f60e";

const moduleRecord = {
  id: MODULE_ID,
  type: "OEF",
  stage: "implement",
  name: {
    de: "Konzeptnotiz-Generator",
    en: "Concept Note Builder",
    es: "Generador de notas conceptuales",
    fr: "Générateur de notes conceptuelles",
    pt: "Gerador de notas conceituais",
  },
  description: {
    de: "Erstellen Sie mit Clima aus dem Stadtkontext, priorisierten Maßnahmen und unterstützenden Quellen eine förderfähige Konzeptnotiz. Prüfen Sie Informationslücken und exportieren Sie eine strukturierte Bewerbung.",
    en: "Use Clima to turn city context, prioritized actions, and supporting sources into a funder-ready concept note. Review information gaps and export a structured application.",
    es: "Utiliza Clima para convertir el contexto de la ciudad, las acciones priorizadas y las fuentes de apoyo en una nota conceptual lista para financiación. Revisa los vacíos de información y exporta una solicitud estructurada.",
    fr: "Utilisez Clima pour transformer le contexte de la ville, les actions prioritaires et les sources d'appui en une note conceptuelle prête à financer. Examinez les informations manquantes et exportez une candidature structurée.",
    pt: "Use o Clima para transformar o contexto da cidade, as ações priorizadas e as fontes de apoio em uma nota conceitual pronta para financiamento. Revise lacunas de informação e exporte uma candidatura estruturada.",
  },
  tagline: {
    de: "Vom Klimakontext zur förderfähigen Konzeptnotiz",
    en: "From city climate context to a funder-ready concept note",
    es: "Del contexto climático de la ciudad a una nota conceptual financiable",
    fr: "Du contexte climatique de la ville à une note conceptuelle finançable",
    pt: "Do contexto climático da cidade a uma nota conceitual financiável",
  },
  author: "Open Earth Foundation",
  url: "/concept-notes",
  logo: "/assets/modules/concept-note-builder.svg",
  status: "beta",
};

/** @type {import("sequelize-cli").Migration} */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.sequelize.query(
        `
          INSERT INTO "Module" (
            id, type, stage, name, description, tagline, author, url, logo,
            status, created, last_updated
          ) VALUES (
            :id, :type, :stage, CAST(:name AS JSONB),
            CAST(:description AS JSONB), CAST(:tagline AS JSONB), :author,
            :url, :logo, :status, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
          )
          ON CONFLICT (id) DO UPDATE SET
            type = EXCLUDED.type,
            stage = EXCLUDED.stage,
            name = EXCLUDED.name,
            description = EXCLUDED.description,
            tagline = EXCLUDED.tagline,
            author = EXCLUDED.author,
            url = EXCLUDED.url,
            logo = EXCLUDED.logo,
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
