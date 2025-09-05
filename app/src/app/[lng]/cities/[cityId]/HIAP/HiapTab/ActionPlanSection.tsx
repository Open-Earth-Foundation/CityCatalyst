import { Box, Button, Icon, Text } from "@chakra-ui/react";
import { TFunction } from "i18next";
import { DownloadIcon } from "@/components/icons";
import { FaCaretDown } from "react-icons/fa";
import { HIAction } from "@/util/types";
import { ClimateActionCard } from "@/components/ClimateActionCard";
import { ActionDrawer } from "@/components/ActionDrawer";
import { useState } from "react";

// Helper function to get top picks
const getTopPickActions = (actions: HIAction[]): HIAction[] => {
  // First, check if any actions are selected
  const selectedActions = actions.filter((action) => action.isSelected);

  if (selectedActions.length > 0) {
    // If there are selected actions, show them (sorted by rank)
    return [...selectedActions].sort((a, b) => a.rank - b.rank);
  } else {
    // If no actions are selected, show top 3 by rank
    return [...actions].sort((a, b) => a.rank - b.rank).slice(0, 3);
  }
};

const ActionPlanSection = ({
  t,
  rankedActions = [],
}: {
  t: TFunction;
  rankedActions?: HIAction[];
}) => {
  const topPickActions = getTopPickActions(rankedActions);
  const [selectedAction, setSelectedAction] = useState<HIAction | null>(null);
  
  return (
    <>
      {selectedAction && (
        <ActionDrawer
          action={selectedAction}
          isOpen={!!selectedAction}
          onClose={() => setSelectedAction(null)}
          t={t}
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
          <Button variant="ghost" color="interactive.control" p="4px">
            <Icon as={DownloadIcon} />
            <Text>{t("download-action-plan")}</Text>
            <Icon as={FaCaretDown} color="interactive.control" />
          </Button>
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
            />
          ))}
        </Box>
      </Box>
    </>
  );
};

export default ActionPlanSection;
