"use client";

import { TFunction } from "i18next";
import { HelpDrawer, HelpDrawerItem } from "@/components/ui/help-drawer";

const getHelpDrawerItems = (t: TFunction): HelpDrawerItem[] => [
  {
    value: "gpc_definition",
    title: t("gpc-definition"),
    itemDescription: t("gpc-definition-description"),
    subtitle: t("in-simple-terms"),
    bulletPoints: [
      t("gpc-definition-bullet-point-1"),
      t("gpc-definition-bullet-point-2"),
      t("gpc-definition-bullet-point-3"),
      t("gpc-definition-bullet-point-4"),
    ],
    itemSummary: t("gpc-definition-summary"),
    learnMoreLink: "https://ghgprotocol.org/ghg-protocol-cities",
    suggestions: [
      {
        preview: t("chat-suggestion-gpc-definition-1"),
        message: t("chat-suggestion-gpc-definition-1-message"),
      },
      {
        preview: t("chat-suggestion-gpc-definition-2"),
        message: t("chat-suggestion-gpc-definition-2-message"),
      },
      {
        preview: t("chat-suggestion-gpc-definition-3"),
        message: t("chat-suggestion-gpc-definition-3-message"),
      },
    ],
  },
  {
    value: "gpc_basic_definition",
    title: t("gpc-basic-definition"),
    itemDescription: t("gpc-basic-definition-description"),
    subtitle: t("in-simple-terms"),
    bulletPoints: [
      t("gpc-basic-definition-bullet-point-1"),
      t("gpc-basic-definition-bullet-point-2"),
    ],
    learnMoreLink:
      "https://ghgprotocol.org/sites/default/files/ghgp/standards/GHGP_GPC_0.pdf",
    suggestions: [
      {
        preview: t("chat-suggestion-gpc-basic-1"),
        message: t("chat-suggestion-gpc-basic-1-message"),
      },
      {
        preview: t("chat-suggestion-gpc-basic-2"),
        message: t("chat-suggestion-gpc-basic-2-message"),
      },
      {
        preview: t("chat-suggestion-gpc-basic-3"),
        message: t("chat-suggestion-gpc-basic-3-message"),
      },
    ],
  },
  {
    value: "gpc_basic_plus_definition",
    title: t("gpc-basic-plus-definition"),
    itemDescription: t("gpc-basic-plus-definition-description"),
    subtitle: t("in-simple-terms"),
    bulletPoints: [
      t("gpc-basic-plus-definition-bullet-point-1"),
      t("gpc-basic-plus-definition-bullet-point-2"),
      t("gpc-basic-plus-definition-bullet-point-3"),
    ],
    itemSummary: t("gpc-basic-plus-definition-summary"),
    learnMoreLink:
      "https://ghgprotocol.org/sites/default/files/ghgp/standards/GHGP_GPC_0.pdf",
    suggestions: [
      {
        preview: t("chat-suggestion-gpc-basic-plus-1"),
        message: t("chat-suggestion-gpc-basic-plus-1-message"),
      },
      {
        preview: t("chat-suggestion-gpc-basic-plus-2"),
        message: t("chat-suggestion-gpc-basic-plus-2-message"),
      },
      {
        preview: t("chat-suggestion-gpc-basic-plus-3"),
        message: t("chat-suggestion-gpc-basic-plus-3-message"),
      },
    ],
  },
  {
    value: "gwp_ar5_definition",
    title: t("gwp-ar5-definition"),
    itemDescription: t("gwp-ar5-definition-description"),
    subtitle: t("in-simple-terms"),
    bulletPoints: [
      t("gwp-ar5-definition-bullet-point-1"),
      t("gwp-ar5-definition-bullet-point-2"),
      t("gwp-ar5-definition-bullet-point-3"),
      t("gwp-ar5-definition-bullet-point-4"),
    ],
    itemSummary: t("gwp-ar5-definition-summary"),
    learnMoreLink: "https://www.ipcc.ch/assessment-report/ar5/",
    suggestions: [
      {
        preview: t("chat-suggestion-ar5-1"),
        message: t("chat-suggestion-ar5-1-message"),
      },
      {
        preview: t("chat-suggestion-ar5-2"),
        message: t("chat-suggestion-ar5-2-message"),
      },
      {
        preview: t("chat-suggestion-ar5-3"),
        message: t("chat-suggestion-ar5-3-message"),
      },
    ],
  },
  {
    value: "gwp_ar6_definition",
    title: t("gwp-ar6-definition"),
    itemDescription: t("gwp-ar6-definition-description"),
    subtitle: t("in-simple-terms"),
    bulletPoints: [
      t("gwp-ar6-definition-bullet-point-1"),
      t("gwp-ar6-definition-bullet-point-2"),
      t("gwp-ar6-definition-bullet-point-3"),
      t("gwp-ar6-definition-bullet-point-4"),
    ],
    itemSummary: t("gwp-ar6-definition-summary"),
    learnMoreLink: "https://www.ipcc.ch/assessment-report/ar6/",
    suggestions: [
      {
        preview: t("chat-suggestion-ar6-1"),
        message: t("chat-suggestion-ar6-1-message"),
      },
      {
        preview: t("chat-suggestion-ar6-2"),
        message: t("chat-suggestion-ar6-2-message"),
      },
      {
        preview: t("chat-suggestion-ar6-3"),
        message: t("chat-suggestion-ar6-3-message"),
      },
    ],
  },
];

export default function InventoryDetailsHelpDrawer({ t }: { t: TFunction }) {
  return (
    <HelpDrawer
      triggerLabel={t("help-button")}
      title={t("drawer-help-section-title")}
      description={t("drawer-help-section-description")}
      items={getHelpDrawerItems(t)}
      askAiLabel={t("ask-ai")}
      learnMoreLabel={t("learn-more")}
      defaultOpenValue="gpc_definition"
    />
  );
}
