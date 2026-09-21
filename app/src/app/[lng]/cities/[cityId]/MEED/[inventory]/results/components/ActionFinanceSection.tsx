"use client";
import { useMemo } from "react";
import NextLink from "next/link";
import { HStack, Icon, VStack } from "@chakra-ui/react";
import { LuArrowRight } from "react-icons/lu";
import { useTranslation } from "@/i18n/client";
import { useGetMeedFinanceFeasibilityQuery } from "@/services/api";
import { BodyMedium } from "@/components/package/Texts/Body";
import { LabelLarge } from "@/components/package/Texts/Label";
import { MeedButton } from "../../../components/MeedButton";
import { FinanceMatches } from "../../finance/components/FinanceMatches";
import { RouteTag } from "../../finance/components/RouteTag";
import { routeKeyOf } from "../../finance/labels";
import { extractFeasibilityRows } from "../../finance/types";

export interface ActionFinanceSectionProps {
  actionId: string;
  cityId: string;
  lng: string;
  /** Link to the finance step, for the full feasibility table. */
  financeHref: string;
}

/**
 * Financing for one action inside the detail drawer: its route, the reasoning,
 * and the matched funding opportunities and projects. Renders nothing when the
 * city has no feasibility row for the action, like the co-benefit sections.
 */
export function ActionFinanceSection({
  actionId,
  cityId,
  lng,
  financeHref,
}: ActionFinanceSectionProps) {
  const { t } = useTranslation(lng, "meed-finance");
  const { data } = useGetMeedFinanceFeasibilityQuery({ cityId });
  const row = useMemo(
    () => extractFeasibilityRows(data).find((r) => r.action_id === actionId),
    [data, actionId],
  );

  if (!row) return null;

  return (
    <VStack alignItems="stretch" gap="m">
      <HStack justifyContent="space-between" gap="s">
        <LabelLarge color="content.primary">
          {t("detail-finance-title")}
        </LabelLarge>
        <RouteTag routeKey={routeKeyOf(row.route)} route={row.route} t={t} />
      </HStack>
      {row.reason && (
        <BodyMedium color="content.secondary">{row.reason}</BodyMedium>
      )}
      <FinanceMatches row={row} cityId={cityId} t={t} />
      <MeedButton
        asChild
        variant="text"
        alignSelf="flex-start"
        minW="auto"
        h="32px"
        px="s"
        rightIcon={<Icon as={LuArrowRight} boxSize="16px" />}
      >
        <NextLink href={financeHref}>{t("detail-finance-view-all")}</NextLink>
      </MeedButton>
    </VStack>
  );
}
