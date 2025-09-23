"use strict";

const sql_up = `
    insert into "Module" (id, type, stage, name, description, tagline, author, url, logo) values
      ('def76a39-6650-4860-8755-e9153073d661', 'POC', 'assess-&-analyze', '{
        "en": "Enhanced Boundary Picker",
        "es": "Selector de Límites Mejorado",
        "pt": "Seletor de Limites Aprimorado",
        "de": "Erweiterte Grenzauswahl",
        "fr": "Sélecteur de Limites Amélioré"
      }',
      '{
        "en": "Use Open Street Map to change your city boundary in case the default one from CityCatalyst does not match your city''s.",
        "es": "Utiliza OpenStreetMap para cambiar el límite de tu ciudad en caso de que el predeterminado de CityCatalyst no coincida con tu ciudad.",
        "pt": "Use o OpenStreetMap para alterar o limite da sua cidade caso o padrão do CityCatalyst não corresponda à sua cidade.",
        "de": "Verwenden Sie OpenStreetMap, um die Stadtgrenze zu ändern, falls die Standardgrenze von CityCatalyst nicht zu Ihrer Stadt passt.",
        "fr": "Utilisez OpenStreetMap pour modifier les limites de votre ville si celles par défaut de CityCatalyst ne correspondent pas à votre ville."
      }',
      '{
        "en": "Choose an alternative boundary for your city based on Open Street Map data.",
        "es": "Elige un límite alternativo para tu ciudad basado en datos de OpenStreetMap.",
        "pt": "Escolha um limite alternativo para sua cidade com base nos dados do OpenStreetMap.",
        "de": "Wählen Sie eine alternative Stadtgrenze auf Basis von OpenStreetMap‑Daten.",
        "fr": "Choisissez une limite alternative pour votre ville basée sur les données d''OpenStreetMap."
      }',
      'Open Earth Foundation', 'https://cc-boundary-picker.replit.app/', 'https://cc-pocs.s3.us-east-2.amazonaws.com/logos/EnhancedBoundaryEditorIcon.png');
`;

const sql_down = `
    delete from "Module" where id = 'def76a39-6650-4860-8755-e9153073d661';
`;

/** @type {import("sequelize-cli").Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.query(sql_up);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.sequelize.query(sql_down);
  },
};
