import { describe, expect, it } from "@jest/globals";
import { pickUniqueOpenClimateCity } from "@/backend/openclimate-city-search";

describe("pickUniqueOpenClimateCity", () => {
  const abadia = {
    actor_id: "BR ABG",
    name: "Abadia de Goiás",
    type: "city",
  };
  const costaRica = {
    actor_id: "CR ABA",
    name: "Abangares",
    type: "city",
  };

  it("accepts an exact NFKD name match and formats the locode", () => {
    const result = pickUniqueOpenClimateCity(
      [abadia, costaRica],
      "Abadia de Goias",
    );
    expect(result).toEqual({
      kind: "unique",
      actorId: "BR ABG",
      name: "Abadia de Goiás",
    });
  });

  it("scopes by country so the same name in another country is ignored", () => {
    const twin = { actor_id: "CR ABG", name: "Abadia de Goiás", type: "city" };
    const result = pickUniqueOpenClimateCity(
      [abadia, twin],
      "Abadia de Goiás",
      "BR",
    );
    expect(result.kind).toBe("unique");
    if (result.kind === "unique") {
      expect(result.actorId).toBe("BR ABG");
    }
  });

  it("returns ambiguous when two countries share the exact name", () => {
    const twin = { actor_id: "CR ABG", name: "Abadia de Goiás", type: "city" };
    const result = pickUniqueOpenClimateCity([abadia, twin], "Abadia de Goiás");
    expect(result.kind).toBe("ambiguous");
    if (result.kind === "ambiguous") {
      expect(result.candidates.map((c) => c.actorId)).toEqual([
        "BR ABG",
        "CR ABG",
      ]);
    }
  });

  it("ignores substring hits that are not an exact name match", () => {
    const result = pickUniqueOpenClimateCity(
      [{ actor_id: "BR GOI", name: "Goiânia", type: "city" }],
      "Goi",
    );
    expect(result.kind).toBe("none");
  });
});
