import { describe, expect, it } from "@jest/globals";
import {
  captionSources,
  fallbackReference,
  findReferenceEntries,
  mapReferences,
  referenceItems,
} from "../scripts/crva-agentic-extraction/references";

const pages = (entries: Record<number, string>) =>
  new Map(Object.entries(entries).map(([p, t]) => [Number(p), t]));

describe("findReferenceEntries", () => {
  it("splits a numbered list under a numbered heading and stops at the next heading", () => {
    const entries = findReferenceEntries(
      pages({
        9: "## 9 Conclusiones\n\nTexto.",
        10: "## 10 Referencias\n\n1 Almeira, G. (sin fecha). Olas de calor.\n2 Balay M. 1961: El Río de la Plata.\n",
        11: "3 Barsi, J. (2003). A calculator.\n\n# Anexo\n\n4 Not a reference (2020).",
      }),
    );
    expect(entries.map((e) => [e.page, e.text])).toEqual([
      [10, "1 Almeira, G. (sin fecha). Olas de calor."],
      [10, "2 Balay M. 1961: El Río de la Plata."],
      [11, "3 Barsi, J. (2003). A calculator."],
    ]);
    expect(entries[0].quote).toBe("1 Almeira, G. (sin fecha). Olas de calor.");
  });

  it("joins lowercase, URL and page-break continuations of APA paragraphs", () => {
    const entries = findReferenceEntries(
      pages({
        3: "# References 103\n\n# Introduction",
        103: "# References\n\nAbenayake, C. (2022). An approach.\nhttps://doi.org/10.1/x\n\nBoiko, A. (2018). How on earth did\n",
        104: "the tracks wind up. NPR. https://kuow.org/a\n\nZhou, X. (2021). Heat. *J*, 3.\n\n# Appendix A",
      }),
    );
    expect(entries.map((e) => e.text)).toEqual([
      "Abenayake, C. (2022). An approach. https://doi.org/10.1/x",
      "Boiko, A. (2018). How on earth did the tracks wind up. NPR. https://kuow.org/a",
      "Zhou, X. (2021). Heat. *J*, 3.",
    ]);
    expect(entries[1].page).toBe(103);
    expect(entries[1].quote).toBe("Boiko, A. (2018). How on earth did");
  });

  it("splits two APA entries merged in one paragraph", () => {
    const [first, second] = findReferenceEntries(
      pages({
        5: "# References\n\nCity of Seattle. (2023). *Food Insecurity*. City of Seattle Office of Planning & Community Development. (2021). *Racial and Social Equity Index*.\n",
      }),
    );
    expect(first.text).toBe("City of Seattle. (2023). *Food Insecurity*.");
    expect(second.text).toBe(
      "City of Seattle Office of Planning & Community Development. (2021). *Racial and Social Equity Index*.",
    );
  });

  it("returns nothing without a reference heading", () => {
    expect(
      findReferenceEntries(pages({ 1: "# Intro\n\nSmith (2020)." })),
    ).toEqual([]);
  });
});

describe("captionSources", () => {
  it("takes caption parentheses and Source lines, skipping self-made sources", () => {
    const sources = captionSources(
      pages({
        40: "Tabla 8. Resumen del IVSD (Elaboración propia)\n\nFigura 9. Usos del suelo (Gobierno Abierto Buenos Aires; Descarga 2020)\n",
        41: "Figura 61. Temperatura (Elaboración propia, derivada de imagen Landsat 8, 3 febrero 2020)\nSource: US Census Bureau (2021)\n",
      }),
    );
    expect(sources.map((s) => [s.page, s.text, s.year])).toEqual([
      [40, "Gobierno Abierto Buenos Aires; Descarga 2020", 2020],
      [41, "derivada de imagen Landsat 8, 3 febrero 2020", 2020],
      [41, "US Census Bureau (2021)", 2021],
    ]);
    expect(sources[0].quote).toBe(
      "Figura 9. Usos del suelo (Gobierno Abierto Buenos Aires; Descarga 2020)",
    );
  });

  it("dedupes the same source named under several captions", () => {
    const sources = captionSources(
      pages({
        1: "Figura 1. A (INDEC-Censo 2010)\nFigura 2. B (INDEC-Censo 2010)",
      }),
    );
    expect(sources).toHaveLength(1);
  });
});

describe("fallbackReference", () => {
  it("splits author, title and year from the entry text", () => {
    expect(
      fallbackReference(
        "3 Barsi, J.A. (2003). An Atmospheric Calculator. IGARSS03.",
      ),
    ).toEqual({
      author: "Barsi, J.A.",
      title: "An Atmospheric Calculator",
      year: 2003,
    });
    expect(
      fallbackReference("Almeira, G. (sin fecha). Olas de calor."),
    ).toEqual({
      author: "Almeira, G.",
      title: "Olas de calor",
      year: null,
    });
  });
});

describe("mapReferences", () => {
  const entries = Array.from({ length: 35 }, (_, i) => ({
    page: 1,
    text: `Author${i} (2001). Title ${i}.`,
    quote: `Author${i} (2001). Title ${i}.`,
  }));
  const answer = (batch: string[]) => ({
    items: batch.map((_t, index) => ({
      index,
      author: `A${index}`,
      title: `T${index}`,
      year: 2001,
    })),
  });

  it("maps entries in batches of 30", async () => {
    const sizes: number[] = [];
    const { references, stats } = await mapReferences(
      entries,
      async (batch) => {
        sizes.push(batch.length);
        return answer(batch);
      },
    );
    expect(sizes).toEqual([30, 5]);
    expect(references).toHaveLength(35);
    expect(references[31]).toEqual({ author: "A1", title: "T1", year: 2001 });
    expect(stats).toEqual({ batches: 2, retries: 0, fallbacks: 0 });
  });

  it("retries a batch whose count is wrong, then falls back to the entry text", async () => {
    let calls = 0;
    const { references, stats } = await mapReferences(
      entries.slice(0, 2),
      async () => {
        calls += 1;
        return { items: [{ index: 0, author: "A", title: "T", year: 2001 }] };
      },
    );
    expect(calls).toBe(2);
    expect(stats).toEqual({ batches: 1, retries: 1, fallbacks: 2 });
    expect(references[0]).toEqual({
      author: "Author0",
      title: "Title 0",
      year: 2001,
    });
  });

  it("accepts an answer indexed from 1 instead of 0", async () => {
    const { references, stats } = await mapReferences(
      entries.slice(0, 2),
      async () => ({
        items: [
          { index: 1, author: "A", title: "T1", year: 2001 },
          { index: 2, author: "B", title: "T2", year: 2002 },
        ],
      }),
    );
    expect(stats.fallbacks).toBe(0);
    expect(references.map((r) => r.title)).toEqual(["T1", "T2"]);
  });

  it("falls back when the call throws", async () => {
    const { stats } = await mapReferences(entries.slice(0, 1), async () => {
      throw new Error("down");
    });
    expect(stats.fallbacks).toBe(1);
  });
});

describe("referenceItems", () => {
  it("builds A1.2a items quoting each entry's first line, without duplicate sources", () => {
    const items = referenceItems(
      [
        {
          page: 10,
          text: "Balay M. 1961: El Río.",
          quote: "Balay M. 1961: El Río.",
        },
      ],
      [{ author: "Balay, M.", title: "El Río", year: 1961 }],
      [
        {
          page: 4,
          text: "basado en Balay 1961",
          year: 1961,
          quote: "Tabla 27. X (basado en Balay 1961)",
        },
        {
          page: 5,
          text: "INDEC-Censo 2010",
          year: 2010,
          quote: "Figura 1. A (INDEC-Censo 2010)",
        },
      ],
    );
    expect(items).toEqual([
      {
        fieldId: "A1.2a",
        index: 0,
        value: {
          author: "Balay, M.",
          title: "El Río",
          year: 1961,
          used_for: null,
        },
        evidence: [{ page: 10, quote: "Balay M. 1961: El Río." }],
      },
      {
        fieldId: "A1.2a",
        index: 1,
        value: {
          author: "INDEC-Censo 2010",
          title: "",
          year: 2010,
          used_for: null,
        },
        evidence: [{ page: 5, quote: "Figura 1. A (INDEC-Censo 2010)" }],
      },
    ]);
  });
});

// Final review fixes (wave 2).
describe("findReferenceEntries edge cases", () => {
  it("skips a repeated heading and stops at a bold annex title", () => {
    const entries = findReferenceEntries(
      pages({
        40: "## Referencias\n\nSmith, J. (2020). Uno.\n",
        41: "## Referencias\n\nZhou, X. (2021). Dos.\n\n**Anexo 1. Tabla de peligros**\n\n| Peligro | Nivel |",
      }),
    );
    expect(entries.map((e) => e.text)).toEqual([
      "Smith, J. (2020). Uno.",
      "Zhou, X. (2021). Dos.",
    ]);
  });

  it("uses a later section when the first reference heading has no entries", () => {
    const entries = findReferenceEntries(
      pages({
        2: "## References\n\n## Chapter 1",
        40: "## References\n\nSmith, J. (2020). Uno.\n",
      }),
    );
    expect(entries.map((e) => e.page)).toEqual([40]);
  });

  it("keeps an entry whose author starts with a lowercase particle", () => {
    const entries = findReferenceEntries(
      pages({
        5: "# References\n\nSmith, J. (2020). Uno. Pub.\n\nde la Cruz, M. (2018). Dos.\n",
      }),
    );
    expect(entries.map((e) => e.text)).toEqual([
      "Smith, J. (2020). Uno. Pub.",
      "de la Cruz, M. (2018). Dos.",
    ]);
  });
});

describe("captionSources noise", () => {
  it("skips units, bracketed self-made sources and years before 1900", () => {
    const sources = captionSources(
      pages({
        1: "Tabla 4. Población por sexo (porcentaje)\nSource: (Own elaboration)\nFigura 2. Censo (INE 1895)",
      }),
    );
    expect(sources.map((s) => [s.text, s.year])).toEqual([["INE 1895", null]]);
  });
});
