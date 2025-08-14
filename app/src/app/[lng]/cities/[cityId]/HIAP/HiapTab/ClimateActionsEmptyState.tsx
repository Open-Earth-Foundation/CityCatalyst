import { EmptyStateIcon } from "@/components/icons";
import { Box, Icon, Text } from "@chakra-ui/react";
import { TFunction } from "i18next";

const ClimateActionsEmptyState = ({ t }: { t: TFunction }) => {
  return (
    <Box display="flex" flexDirection="column" gap={"48px"}>
      {/* Heading and description */}
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
        <Text fontSize="body.lg" color="content.secondary" fontWeight="normal">
          {t("generate-climate-actions-description")}
        </Text>
      </Box>
      {/* Content */}
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
    </Box>
  );
};

export default ClimateActionsEmptyState;
