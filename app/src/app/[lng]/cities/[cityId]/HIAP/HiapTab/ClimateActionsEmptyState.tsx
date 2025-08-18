import {
  EmptyActivityDataIcon,
  EmptyStateIcon,
  LikeIcon,
} from "@/components/icons";
import ProgressLoader from "@/components/ProgressLoader";
import { api } from "@/services/api";
import { InventoryResponse, ACTION_TYPES, LANGUAGES } from "@/util/types";
import { Box, Icon, Text, Button } from "@chakra-ui/react";
import { TFunction } from "i18next";
import i18next from "i18next";
import { useState } from "react";

// Renders different screens for data states:
// 1. No activity level data found to generate actions (disable generate actions button)
// 2. Generate actions if activity level data is available but no actions are generated (enable generate actions button)
// 3. Top actions generation process is in progress (show loading message)

const TopActionsDataState = ({
  t,
  inventory,
  hasActions = false,
  actionType,
  onRefetch,
}: {
  t: TFunction;
  inventory: InventoryResponse;
  hasActions?: boolean;
  actionType: ACTION_TYPES;
  onRefetch: () => void;
}) => {
  const { data: inventoryProgress, isLoading } =
    api.useGetInventoryProgressQuery(inventory.inventoryId);

  // Check if there are any inventory values (activity level data)
  const hasInventoryData =
    !!inventoryProgress?.inventory?.inventoryValues?.length;

  // Check if there's meaningful activity data across sectors
  const totalUploadedData = inventoryProgress?.totalProgress?.uploaded || 0;
  const hasActivityLevelData = hasInventoryData && totalUploadedData > 0;

  return (
    <Box display="flex" flexDirection="column" gap="48px" w="1090px">
      {/* Shared heading and description */}
      <Box py="48px" display="flex" flexDirection="column">
        <Text
          color="content.primary"
          fontSize="title.lg"
          fontWeight="semibold"
          fontFamily="heading"
          mb={2}
        >
          {t("generate-climate-actions-title")}
        </Text>
        <Text fontSize="body.lg" color="content.tertiary" fontWeight="normal">
          {t("generate-climate-actions-description")}
        </Text>
      </Box>

      {/* Render states conditionally */}
      {isLoading && (
        <Box
          h="200px"
          display="flex"
          flexDirection="column"
          alignItems="center"
          justifyContent="center"
        >
          <ProgressLoader />
          <Text
            fontSize="body.lg"
            color="content.secondary"
            fontWeight="normal"
            mt="24px"
          >
            {t("checking-activity-data")}
          </Text>
        </Box>
      )}
      {!hasActivityLevelData && !isLoading && <NoActivityLevelData t={t} />}

      {hasActivityLevelData && !hasActions && (
        <GenerateActionsPrompt
          t={t}
          isLoading={isLoading}
          onRefetch={onRefetch}
        />
      )}

      {hasActivityLevelData && hasActions && <GeneratedActions t={t} />}
    </Box>
  );
};

const NoActivityLevelData = ({ t }: { t: TFunction }) => {
  return (
    <Box
      display="flex"
      flexDirection="column"
      alignItems="center"
      py="48px"
      h="400px"
    >
      <Icon
        as={EmptyActivityDataIcon}
        boxSize="64px"
        color="content.tertiary"
      />
      <Text
        fontSize="title.md"
        color="content.primary"
        mt="24px"
        fontFamily="heading"
        fontWeight="semibold"
        textAlign="center"
      >
        {t("no-activity-data-title")}
      </Text>
      <Text
        w="400px"
        fontSize="body.lg"
        color="content.secondary"
        fontWeight="normal"
        mt="8px"
        textAlign="center"
      >
        {t("no-activity-data-description")}
      </Text>
      <Button
        mt="24px"
        colorScheme="content.link"
        disabled
        py="32px"
        w="400px"
        _disabled={{
          opacity: 0.4,
          cursor: "not-allowed",
        }}
      >
        {t("generate-climate-actions-list")}
      </Button>
    </Box>
  );
};

const GenerateActionsPrompt = ({
  t,
  isLoading,
  onRefetch,
}: {
  t: TFunction;
  isLoading: boolean;
  onRefetch: () => void;
}) => {
  const [isGenerating, setIsGenerating] = useState(false);
  const [isCheckingData, setIsCheckingData] = useState(false);

  const handleGenerateActions = async () => {
    try {
      // First, show checking activity data
      setIsCheckingData(true);

      // Small delay to show the checking message
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Then switch to generating
      setIsCheckingData(false);
      setIsGenerating(true);

      // Trigger a refetch of the HIAP data, which will start action generation if needed
      await onRefetch();
    } catch (error) {
      console.error("Error generating actions:", error);
    } finally {
      setIsCheckingData(false);
      setIsGenerating(false);
    }
  };

  return (
    <Box
      display="flex"
      flexDirection="column"
      alignItems="center"
      py="48px"
      h="full"
      w="full"
    >
      <Icon as={LikeIcon} boxSize="64px" color="content.link" />
      <Text
        fontSize="title.md"
        color="content.primary"
        mt="24px"
        fontFamily="heading"
        fontWeight="semibold"
        textAlign="center"
      >
        {t("ready-to-generate-climate-actions-title")}
      </Text>
      <Text
        w="400px"
        fontSize="body.lg"
        color="content.secondary"
        fontWeight="normal"
        mt="8px"
        textAlign="center"
      >
        {t("click-action-description")}
      </Text>
      <Button
        mt="24px"
        colorScheme="content.link"
        onClick={handleGenerateActions}
        loading={isCheckingData || isGenerating || isLoading}
        py="32px"
        w="400px"
      >
        {isCheckingData
          ? t("checking-activity-data")
          : isGenerating
            ? t("generating-actions")
            : t("generate-climate-actions-list")}
      </Button>
    </Box>
  );
};

const GeneratedActions = ({ t }: { t: TFunction }) => {
  return (
    <Box
      display="flex"
      flexDirection="column"
      alignItems="center"
      py="48px"
      h="400px"
    >
      <Icon as={EmptyStateIcon} />
      <Text
        fontSize="body.lg"
        color="content.secondary"
        mt={"24px"}
        fontFamily="heading"
        fontWeight="semibold"
      >
        {t("no-actions-found-title")}
      </Text>
      <Text
        w="348px"
        fontSize="body.lg"
        color="interactive.control"
        fontWeight="normal"
        mt={"8px"}
        textAlign="center"
      >
        {t("no-actions-found-description")}
      </Text>
    </Box>
  );
};

export default TopActionsDataState;
