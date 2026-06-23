"use client";

import { Box, Heading, Text } from "@chakra-ui/react";
import { useParams, useRouter } from "next/navigation";
import { useEffect } from "react";

import { useTranslation } from "@/i18n/client";
import ProgressLoader from "@/components/ProgressLoader";
import Wrapper from "@/components/wrapper";
import { api } from "@/services/api";
import { getParamValueRequired } from "@/util/helpers";

/**
 * Client-side redirect for legacy `/{lng}/{inventoryId}/draft/stationary-energy` URLs.
 *
 * Most traffic is handled earlier by `maybeRedirectLegacyInventoryUrl` in middleware.
 * This component is kept so the Stationary Energy draft module can evolve in parallel
 * (e.g. AI team work) without route-level merge conflicts during legacy URL removal.
 */
export function LegacyStationaryEnergyDraftRoute() {
  const router = useRouter();
  const params = useParams();
  const lng = getParamValueRequired(params.lng);
  const inventoryId = getParamValueRequired(params.inventory);
  const { t } = useTranslation(lng, "stationary-energy-agentic");

  const {
    data: inventory,
    isLoading,
    error,
  } = api.useGetInventoryQuery(inventoryId, {
    skip: !inventoryId,
  });

  useEffect(() => {
    const cityId = inventory?.cityId ?? inventory?.city?.cityId;
    if (!cityId) {
      return;
    }

    router.replace(
      `/${lng}/cities/${cityId}/GHGI/${inventoryId}/draft/stationary-energy`,
    );
  }, [inventory, inventoryId, lng, router]);

  if (isLoading) {
    return <ProgressLoader />;
  }

  if (error || !inventory) {
    return (
      <Wrapper>
        <Box
          borderWidth="1px"
          borderColor="border.neutral"
          borderRadius="rounded"
          p={5}
        >
          <Heading fontSize="title.md" fontWeight="semibold">
            {t("legacy-route-unavailable-title")}
          </Heading>
          <Text color="content.tertiary" mt={2}>
            {t("legacy-route-unavailable-description")}
          </Text>
        </Box>
      </Wrapper>
    );
  }

  return <ProgressLoader />;
}
