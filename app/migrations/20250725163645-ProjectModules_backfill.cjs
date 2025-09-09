"use strict";

const sql_up = `
  INSERT INTO "Module" (id, type, stage, name, description, tagline, author, url) VALUES ('9ee0e1ea-94ea-4329-b156-28d10ecd0ff8', 'OEF', 'plan', '{"de": "Maßnahmen & Pläne", "en": "Actions & Plans", "es": "Acciones y Planes", "fr": "Actions et Plans", "pt": "Ações e Planos"}', '{"de": "Identifizieren, priorisieren und sequenzieren Sie hochwirksame Minderungs- und Anpassungsmaßnahmen, die auf den Kontext Ihrer Stadt zugeschnitten sind. Erstellen Sie gemeinsam Aktionspläne, die praktisch und bereit für die Umsetzung sind.", "en": "Identify, prioritize, and sequence high-impact mitigation and adaptation actions tailored to your city''s context. Co-create action plans that are practical and ready for implementation.", "es": "Identifica, prioriza y secuencia acciones de mitigación y adaptación de alto impacto adaptadas al contexto de tu ciudad. Co-crea planes de acción que sean prácticos y estén listos para la implementación.", "fr": "Identifiez, priorisez et séquencez des actions d''atténuation et d''adaptation à fort impact adaptées au contexte de votre ville. Co-créez des plans d''action pratiques et prêts à être mis en œuvre.", "pt": "Identifique, priorize e sequencie ações de mitigação e adaptação de alto impacto adaptadas ao contexto da sua cidade. Co-crie planos de ação que sejam práticos e estejam prontos para implementação."}', '{"de": "Verwandeln Sie Daten in umsetzbare Schritte und erschließen Sie die nächste Phase Ihrer Klimastrategie.", "en": "Turn data into actionable steps and unlock the next phase of your climate strategy.", "es": "Convierte los datos en pasos accionables y desbloquea la siguiente fase de tu estrategia climática.", "fr": "Transformez les données en étapes actionnables et débloquez la prochaine phase de votre stratégie climatique.", "pt": "Transforme dados em passos acionáveis e desbloqueie a próxima fase da sua estratégia climática."}', 'Open Earth Foundation', '/HIAP');
  INSERT INTO "Module" (id, type, stage, name, description, tagline, author, url) VALUES ('077690c6-6fa3-44e1-84b7-6d758a6a4d88', 'OEF', 'assess-and-analyze', '{"de": "THG-Inventare", "en": "GHG Inventories", "es": "Inventarios de GEI", "fr": "Inventaires de GES", "pt": "Inventários de GEE"}', '{"de": "Erstellen Sie ein Treibhausgasemissionsinventar, das mit dem Global Protocol for Cities übereinstimmt. Laden Sie automatisch verifizierte Datensätze und führen Sie Ihr Team durch methodische Schritte, um eine solide Emissionsbasislinie zu erstellen.", "en": "Create a greenhouse gas emissions inventory aligned with the Global Protocol for Cities. Automatically load verified datasets and guide your team through methodology steps to establish a solid emissions baseline.", "es": "Crea un inventario de emisiones de gases de efecto invernadero alineado con el Protocolo Global para Ciudades. Carga automáticamente conjuntos de datos verificados y guía a tu equipo a través de pasos metodológicos para establecer una línea base sólida de emisiones.", "fr": "Créez un inventaire des émissions de gaz à effet de serre aligné sur le Protocole Mondial pour les Villes. Chargez automatiquement des ensembles de données vérifiés et guidez votre équipe à travers les étapes méthodologiques pour établir une base d''émissions solide.", "pt": "Crie um inventário de emissões de gases de efeito estufa alinhado com o Protocolo Global para Cidades. Carregue automaticamente conjuntos de dados verificados e oriente sua equipe através de passos metodológicos para estabelecer uma linha de base sólida de emissões."}', '{"de": "Hilft Städten dabei, ihre Emissionen in allen GPC-Sektoren zu messen, zu verfolgen und zu melden.", "en": "Helps cities measure, track and report their emissions across GPC sectors.", "es": "Ayuda a las ciudades a medir, rastrear y reportar sus emisiones en todos los sectores del GPC.", "fr": "Aide les villes à mesurer, suivre et déclarer leurs émissions dans tous les secteurs du GPC.", "pt": "Ajuda as cidades a medir, rastrear e reportar suas emissões em todos os setores do GPC."}', 'Open Earth Foundation', '/GHGI');

  INSERT INTO "ProjectModules" (project_id, module_id, created, last_updated)
  SELECT project_id, '9ee0e1ea-94ea-4329-b156-28d10ecd0ff8', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
  FROM "Project"
`;

const sql_down = `
  
`;

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.query(sql_up);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.sequelize.query(sql_down);
  },
};
