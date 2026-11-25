import {
  actionDescription,
  actionName,
  buildActionIndex,
} from "@/app/[lng]/cities/[cityId]/MEED/[inventory]/results/components/actionCatalog";

const t = ((key: string) => key) as never;

// Shape the Global API returns through /modules/meed/actions: camelCase
// fields plus the translation maps next to the English text.
const CATALOG = {
  actions: [
    {
      actionId: "c40_0012",
      actionName: "Improve energy efficiency in municipal buildings",
      description: "Retrofit municipal buildings.",
      nameI18n: {
        en: "Improve energy efficiency in municipal buildings",
        es: "Mejorar la eficiencia energética de los edificios municipales",
        pt: "Melhorar a eficiência energética dos edifícios municipais",
      },
      descriptionI18n: {
        en: "Retrofit municipal buildings.",
        es: "Rehabilitar edificios municipales.",
      },
    },
    // Older catalog rows: English only, no maps.
    { actionId: "ipcc_0001", actionName: "Plant trees", description: "Trees." },
    // hiap-meed reference-data contract: snake_case maps.
    {
      actionId: "icare_0002",
      actionName: "Expand energy labeling",
      name_i18n: { es: "Ampliar el etiquetado energético" },
      description_i18n: { es: "Etiquetas." },
    },
  ],
};

describe("buildActionIndex language resolution", () => {
  it("resolves names and descriptions for the requested language", () => {
    const index = buildActionIndex(CATALOG, "es");
    expect(actionName(index, "c40_0012", t)).toBe(
      "Mejorar la eficiencia energética de los edificios municipales",
    );
    expect(actionDescription(index, "c40_0012")).toBe(
      "Rehabilitar edificios municipales.",
    );
  });

  it("falls back to the English text when the map lacks the language", () => {
    const index = buildActionIndex(CATALOG, "es");
    expect(actionName(index, "ipcc_0001", t)).toBe("Plant trees");
    expect(actionDescription(index, "ipcc_0001")).toBe("Trees.");
    // pt exists for the name but not the description
    const pt = buildActionIndex(CATALOG, "pt");
    expect(actionName(pt, "c40_0012", t)).toBe(
      "Melhorar a eficiência energética dos edifícios municipais",
    );
    expect(actionDescription(pt, "c40_0012")).toBe(
      "Retrofit municipal buildings.",
    );
  });

  it("accepts the snake_case maps of the reference-data contract", () => {
    const index = buildActionIndex(CATALOG, "es");
    expect(actionName(index, "icare_0002", t)).toBe(
      "Ampliar el etiquetado energético",
    );
    expect(actionDescription(index, "icare_0002")).toBe("Etiquetas.");
  });

  it("keeps the English text when no language is given", () => {
    const index = buildActionIndex(CATALOG);
    expect(actionName(index, "c40_0012", t)).toBe(
      "Improve energy efficiency in municipal buildings",
    );
    expect(index.get("c40_0012")?.nameI18n?.es).toBe(
      "Mejorar la eficiencia energética de los edificios municipales",
    );
  });
});
