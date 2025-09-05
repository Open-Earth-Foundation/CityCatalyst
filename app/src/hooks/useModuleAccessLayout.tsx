import React, { use } from "react";
import { Box } from "@chakra-ui/react";
import { hasFeatureFlag, FeatureFlags } from "@/util/feature-flags";
import ProgressLoader from "@/components/ProgressLoader";
import { useModuleAccess } from "@/hooks/useModuleAccess";

interface UseModuleAccessLayoutProps {
  params: Promise<{ lng: string; cityId: string }>;
  moduleId: string;
  fallbackPath?: string;
  children: React.ReactNode;
}

export const useModuleAccessLayout = ({
  params,
  moduleId,
  fallbackPath,
  children,
}: UseModuleAccessLayoutProps): React.ReactElement => {
  const { lng, cityId } = use(params);

  // Skip module access check when JN_ENABLED feature flag is OFF
  const shouldCheckAccess = hasFeatureFlag(FeatureFlags.JN_ENABLED);
  const { hasAccess } = useModuleAccess({
    cityId,
    moduleId,
    lng,
    fallbackPath,
  });

  return (
    <Box
      h="full"
      display="flex"
      flexDirection="column"
      bg="background.backgroundLight"
    >
      <Box w="full" h="full">
        {!shouldCheckAccess || hasAccess ? (
          children
        ) : (
          <Box
            display="flex"
            alignItems="center"
            justifyContent="center"
            w="full"
          >
            <Box
              w="full"
              py={12}
              display="flex"
              alignItems="center"
              justifyContent="center"
            >
              <ProgressLoader />
            </Box>
          </Box>
        )}
      </Box>
    </Box>
  );
};
