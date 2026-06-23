"use client";

import { Suspense, useEffect } from "react";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";

import ProgressLoader from "@/components/ProgressLoader";
import Wrapper from "@/components/wrapper";
import { useTranslation } from "@/i18n/client";
import { api } from "@/services/api";
import { getParamValueRequired } from "@/util/helpers";
import { resolveLegacyInventoryRedirectPath } from "@/util/ghgi-routes";
import { Box, Heading, Text } from "@chakra-ui/react";

function LegacyInventoryRouteRedirectContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
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

    const query = searchParams.toString();
    const querySuffix = query ? `?${query}` : "";
    const target = resolveLegacyInventoryRedirectPath(
      lng,
      cityId,
      inventoryId,
      pathname,
    );

    router.replace(`${target}${querySuffix}`);
  }, [inventory, inventoryId, lng, pathname, router, searchParams]);

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

/** Redirect legacy `/{lng}/{inventoryId}/...` routes to city-scoped GHGI URLs. */
export default function LegacyInventoryRouteRedirect() {
  return (
    <Suspense fallback={<ProgressLoader />}>
      <LegacyInventoryRouteRedirectContent />
    </Suspense>
  );
}
