import { Box, Text } from "@chakra-ui/react";
import { TFunction } from "i18next";
import { HIAction, CityWithProjectDataResponse } from "@/util/types";
import { ClimateActionCard } from "@/components/ClimateActionCard";
import { ActionDrawer } from "@/components/ActionDrawer";
import { useState } from "react";

// Helper function to get top picks from both ranked and unranked actions
const getTopPickActions = (rankedActions: HIAction[], unrankedActions: HIAction[]): HIAction[] => {
  // Get selected actions from both ranked and unranked
  const selectedRankedActions = rankedActions.filter((action) => action.isSelected);
  const selectedUnrankedActions = unrankedActions.filter((action) => action.isSelected);
  const allSelectedActions = [...selectedRankedActions, ...selectedUnrankedActions];

  if (allSelectedActions.length > 0) {
    // If there are selected actions, show them (sorted by rank)
    return [...allSelectedActions].sort((a, b) => a.rank - b.rank);
  } else {
    // If no actions are selected, show top 3 ranked actions by rank
    return [...rankedActions].sort((a, b) => a.rank - b.rank).slice(0, 3);
  }
};

const ActionPlanSection = ({
  t,
  rankedActions = [],
  unrankedActions = [],
  cityLocode,
  cityId,
  cityData,
  inventoryId,
  lng,
}: {
  t: TFunction;
  rankedActions?: HIAction[];
  unrankedActions?: HIAction[];
  cityLocode?: string;
  cityId?: string;
  cityData?: CityWithProjectDataResponse;
  inventoryId?: string;
  lng: string;
}) => {
  const topPickActions = getTopPickActions(rankedActions, unrankedActions);
  const [selectedAction, setSelectedAction] = useState<HIAction | null>(null);

  return (
    <>
      {selectedAction && (
        <ActionDrawer
          action={selectedAction}
          isOpen={!!selectedAction}
          onClose={() => setSelectedAction(null)}
          t={t}
          lng={lng}
        />
      )}
      <Box w="1090px" mx="auto" py="48px" display="flex" flexDirection="column">
        {/* Heading with action button */}
        <Box
          display="flex"
          justifyContent="space-between"
          alignItems="center"
          w="full"
        >
          <Text
            color="content.primary"
            fontSize="title.lg"
            fontWeight="semibold"
            fontFamily="heading"
            mb={2}
          >
            {t("generate-climate-actions-title")}
          </Text>
        </Box>
        <Text
          fontSize="body.lg"
          color="content.tertiary"
          fontWeight="normal"
          mt="8px"
        >
          {t("generate-climate-actions-widget-description")}
        </Text>
        <Box
          display="grid"
          gridTemplateColumns="repeat(auto-fit, minmax(280px, 1fr))"
          py="24px"
          gap="24px"
          justifyItems="start"
        >
          {topPickActions.map((action) => (
            <ClimateActionCard
              key={action.id}
              action={action}
              t={t}
              onSeeMoreClick={() => setSelectedAction(action)}
              cityData={cityData}
              cityLocode={cityLocode}
              cityId={cityId}
              inventoryId={inventoryId}
            />
          ))}
        </Box>
      </Box>
    </>
  );
};

export default ActionPlanSection;
