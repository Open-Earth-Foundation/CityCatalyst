import { describe, expect, it } from "@jest/globals";

import {
  filledReferenceNumbersFromCurrentValues,
  filterDraftableTaxonomyRows,
} from "@/backend/agentic/ghgi/stationary-energy/context";

describe("Stationary Energy context filtering", () => {
  it("treats committed source-backed, manual, and notation values as filled", () => {
    const filled = filledReferenceNumbersFromCurrentValues([
      {
        gpc_reference_number: "I.1.1",
        datasource_id: "source-1",
        emissions_value: null,
        value: null,
      },
      {
        gpc_reference_number: "I.2.2",
        datasource_id: null,
        emissions_value: "0",
        value: null,
      },
      {
        gpc_reference_number: "I.3.1",
        datasource_id: null,
        emissions_value: null,
        value: null,
        unavailable_reason: "reason-NO",
      },
      {
        gpc_reference_number: "I.4.1",
        datasource_id: null,
        emissions_value: null,
        value: null,
        unavailable_reason: "reason-NE",
      },
      {
        gpc_reference_number: "I.5.1",
        datasource_id: null,
        emissions_value: null,
        value: null,
      },
    ]);

    expect([...filled].sort()).toEqual(["I.1.1", "I.2.2", "I.3.1"]);
  });

  it("removes filled GPC rows from the draftable taxonomy", () => {
    const rows = [
      {
        sector_id: "I",
        sector_name: "Stationary Energy",
        sector_reference_number: "I",
        subsector_id: "I.1",
        subsector_name: "Residential buildings",
        subsector_reference_number: "I.1",
        subcategory_id: "I.1.1",
        subcategory_name: "Fuel combustion",
        subcategory_reference_number: "I.1.1",
        scope_id: "1",
        scope_name: "Scope 1",
      },
      {
        sector_id: "I",
        sector_name: "Stationary Energy",
        sector_reference_number: "I",
        subsector_id: "I.2",
        subsector_name: "Commercial buildings",
        subsector_reference_number: "I.2",
        subcategory_id: "I.2.2",
        subcategory_name: "Grid electricity",
        subcategory_reference_number: "I.2.2",
        scope_id: "2",
        scope_name: "Scope 2",
      },
    ];

    const draftableRows = filterDraftableTaxonomyRows(rows, new Set(["I.1.1"]));

    expect(draftableRows).toHaveLength(1);
    expect(draftableRows[0].subcategory_reference_number).toBe("I.2.2");
  });
});
