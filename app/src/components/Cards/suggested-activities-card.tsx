import { AddIcon } from "@chakra-ui/icons";
import { Box, Button, Card, Checkbox, Text, useTheme } from "@chakra-ui/react";
import { TFunction } from "i18next";
import React, { FC } from "react";

interface SuggestedActivityCardProps {
  t: TFunction;
  id: string;
  isSelected: boolean;
  prefillKey: string;
  prefillValue: string;
  onActivityAdded?: () => void;
}

const SuggestedActivityCard: FC<SuggestedActivityCardProps> = ({
  t,
  isSelected,
  id,
  onActivityAdded,
  prefillValue,
  prefillKey
}) => {
  const themeColors = useTheme().colors;
  return (
    <Card
      display="flex"
      flexDirection="row"
      w="full"
      h="100px"
      p="16px"
      gap="16px"
      shadow="none"
      borderWidth="1px"
      borderColor="border.overlay"
      cursor="pointer"
      _hover={{ shadow: "md", borderWidth: "1px", borderColor: "content.link" }}
      onClick={onActivityAdded}
    >
      <Box display="flex" alignItems="center">
        <Checkbox
          borderRadius="full"
          __css={{
            "& .chakra-checkbox__control": {
              bg: "white",
              color: themeColors.brand,
              borderRadius: "full",
              borderColor: "#D7D8FA",
              h: "24px",
              w: "24px",
              fontSize: "24px",
            },
          }}
          _checked={{
            "& .chakra-checkbox__control": {
              bg: "white",
              color: "content.link",
              borderRadius: "full",
              borderColor: "content.link",
              h: "24px",
              w: "24px",
              fontSize: "24px",
            },
          }}
        />
      </Box>
      <Box
        display="flex"
        flexDirection="column"
        justifyContent="center"
        h="full"
        w="full"
      >
        <Text
          letterSpacing="wide"
          fontSize="body.md"
          fontWeight="normal"
          color="interactive.control"
        >
          {t(prefillKey)}
        </Text>
        <Text
          letterSpacing="wide"
          fontSize="16px"
          fontWeight="medium"
          fontFamily="heading"
        >
          {t(prefillValue)}
        </Text>
      </Box>
      <Box display="flex" alignItems="center" w="full" justifyContent="end">
        <Button
          title="Add Activity"
          leftIcon={<AddIcon h="16px" w="16px" />}
          h="48px"
          variant="ghost"
          aria-label="activity-button"
          fontSize="button.md"
          color="content.link"
          gap="8px"
          onClick={onActivityAdded}
        >
          {t("add-activity")}
        </Button>
      </Box>
    </Card>
  );
};

export default SuggestedActivityCard;
