"use strict";

/** @type {import("sequelize-cli").Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.bulkInsert("Module", [
      {
        id: '3d1a4b2c-8e7f-4d5a-9c6b-1f2e3d4c5b6a',
        type: 'OEF',
        stage: 'assess-&-analyze',
        name: JSON.stringify({
          de: "Klimarisiko- und Verwundbarkeitsbewertung",
          en: "Climate Risk and Vulnerability Assessment",
          es: "Evaluación de Riesgo Climático y Vulnerabilidad",
          fr: "Évaluation des Risques Climatiques et de la Vulnérabilité",
          pt: "Avaliação de Risco Climático e Vulnerabilidade"
        }),
        description: JSON.stringify({
          de: "Bewerten Sie Klimarisiken und Verwundbarkeiten für Ihre Stadt. Identifizieren Sie kritische Infrastruktur und Bereiche, die von Klimawandel betroffen sind, und entwickeln Sie Anpassungsstrategien zur Stärkung der städtischen Widerstandsfähigkeit.",
          en: "Assess climate risks and vulnerabilities for your city. Identify critical infrastructure and areas affected by climate change, and develop adaptation strategies to strengthen urban resilience.",
          es: "Evalúa los riesgos climáticos y vulnerabilidades de tu ciudad. Identifica infraestructura crítica y áreas afectadas por el cambio climático, y desarrolla estrategias de adaptación para fortalecer la resiliencia urbana.",
          fr: "Évaluez les risques climatiques et les vulnérabilités de votre ville. Identifiez les infrastructures critiques et les zones affectées par le changement climatique, et développez des stratégies d'adaptation pour renforcer la résilience urbaine.",
          pt: "Avalie os riscos climáticos e vulnerabilidades da sua cidade. Identifique infraestrutura crítica e áreas afetadas pelas mudanças climáticas, e desenvolva estratégias de adaptação para fortalecer a resiliência urbana."
        }),
        tagline: JSON.stringify({
          de: "Verstehen Sie Klimarisiken und entwickeln Sie Anpassungsstrategien für eine widerstandsfähigere Stadt.",
          en: "Understand climate risks and develop adaptation strategies for a more resilient city.",
          es: "Comprende los riesgos climáticos y desarrolla estrategias de adaptación para una ciudad más resiliente.",
          fr: "Comprenez les risques climatiques et développez des stratégies d'adaptation pour une ville plus résiliente.",
          pt: "Compreenda os riscos climáticos e desenvolva estratégias de adaptação para uma cidade mais resiliente."
        }),
        author: 'Open Earth Foundation',
        url: '/CCRA',
        created: new Date(),
        last_updated: new Date()
      }
    ]);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.bulkDelete("Module", {
      id: '3d1a4b2c-8e7f-4d5a-9c6b-1f2e3d4c5b6a'
    });
  },
};