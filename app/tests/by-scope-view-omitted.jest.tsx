/**
 * CC-1201: omitted rows show under their own heading with reference and amount,
 * and take no share of the sector.
 */
import { describe, expect, it, jest } from "@jest/globals";
import React from "react";
import Decimal from "decimal.js";
import { renderToStaticMarkup } from "react-dom/server";
import { ChakraProvider, defaultSystem } from "@chakra-ui/react";

jest.unstable_mockModule(
  "@/components/GHGI/inventory-result/ByScopeViewSourceDrawer",
  () => ({ default: () => null }),
);

const { default: ByScopeView } =
  await import("@/components/GHGI/inventory-result/ByScopeView");
const { InventoryTypeEnum } = await import("@/util/enums");

const t = ((key: string) => key) as never;

function row(activityTitle: string, kg: number, percentage: number | null) {
  return {
    activityTitle,
    scopes: { "1": new Decimal(kg) },
    totalEmissions: new Decimal(kg),
    percentage,
    datasource_id: "",
    datasource_name: "",
    datasource_source_type: null,
  };
}

function render(
  omittedFromTotal?: React.ComponentProps<
    typeof ByScopeView
  >["omittedFromTotal"],
) {
  return renderToStaticMarkup(
    <ChakraProvider value={defaultSystem}>
      <ByScopeView
        data={[row("Solid waste", 1_000_000, 100)]}
        omittedFromTotal={omittedFromTotal}
        grossTotalEmissions={new Decimal(1_000_000)}
        tData={t}
        tDashboard={t}
        sectorName="waste"
        inventoryType={InventoryTypeEnum.GPC_BASIC}
        inventoryId="inventory"
      />
    </ChakraProvider>,
  );
}

describe("ByScopeView", () => {
  it("lists omitted rows apart from the counted ones", () => {
    const html = render([
      { ...row("Wastewater", 608_000, null), gpcReferenceNumber: "III.4.3" },
    ]);
    expect(html).toContain("omitted-from-total-heading");
    expect(html).toContain("(III.4.3)");
    expect(html).toContain("100%");
    expect(html).not.toContain("removals-not-countable-footnote");
    expect(html.indexOf("omitted-from-total-heading")).toBeGreaterThan(
      html.indexOf("100%"),
    );
  });

  it("shows no heading without omitted rows", () => {
    expect(render()).not.toContain("omitted-from-total-heading");
  });

  // CC-1311: GPC Table 2.1, a subsector value not split by scope is IE, not 0.
  it("shows IE with a note for a subsector value not split by scope", () => {
    const tRef = ((key: string, opts?: { ref?: string }) =>
      opts?.ref ? `${key}:${opts.ref}` : key) as never;
    const html = renderToStaticMarkup(
      <ChakraProvider value={defaultSystem}>
        <ByScopeView
          data={[
            {
              ...row("Energy industries", 500_000, 100),
              scopes: {},
              unsplitReferences: ["I.4"],
            },
          ]}
          grossTotalEmissions={new Decimal(500_000)}
          tData={tRef}
          tDashboard={tRef}
          sectorName="stationary-energy"
          inventoryType={InventoryTypeEnum.GPC_BASIC}
          inventoryId="inventory"
        />
      </ChakraProvider>,
    );
    expect(html.match(/>IE</g)).toHaveLength(2);
    expect(html).toContain("included-elsewhere-unsplit:I.4");
  });
});
