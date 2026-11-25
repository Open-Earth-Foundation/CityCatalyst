import { describe, expect, it } from "@jest/globals";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import i18next from "i18next";
import { Trans } from "react-i18next";

const onboarding = JSON.parse(
  readFileSync("src/i18n/locales/en/onboarding.json", "utf8"),
);
const dashboard = JSON.parse(
  readFileSync("src/i18n/locales/en/dashboard.json", "utf8"),
);

describe("inventory import and download copy", () => {
  it("renders the review sentence once and keeps its emphasized phrase", async () => {
    const i18n = i18next.createInstance();
    await i18n.init({ lng: "en", resources: { en: { onboarding } } });
    const html = renderToStaticMarkup(
      createElement(Trans, {
        i18n,
        t: i18n.getFixedT("en", "onboarding"),
        i18nKey: "review-confirm-description",
        components: [createElement("span", { key: "0" })],
      }),
    );
    expect(html).toContain(
      "Please <span>carefully review all fields</span> and confirm",
    );
    expect(html.match(/Please/g)).toHaveLength(1);
  });

  it("describes the eCRF as an inventory reporting format under a fresh translation key", () => {
    expect(dashboard["download-ecrf-inventory-format-description"]).toMatch(
      /inventory/i,
    );
    expect(dashboard["download-ecrf-inventory-format-description"]).not.toMatch(
      /clinical/i,
    );
  });
});
