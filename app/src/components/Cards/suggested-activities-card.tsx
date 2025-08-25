import { Box, Button, Card, Icon, Text } from "@chakra-ui/react";
import { TFunction } from "i18next";
import React, { FC } from "react";
import { Checkbox } from "../ui/checkbox";
import { MdAdd } from "react-icons/md";

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
  prefillKey,
}) => {
  // const themeColors = useTheme().colors;
  return (
    <Card.Root
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
          css={{
            "& .chakra-checkbox__control": {
              bg: "white",
              color: "black",
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
      <Box display="flex" alignItems="center" w="full" justifyContent="end" data-testid="add-emission-data-button">
        <Button
          title="Add Activity"
          h="48px"
          variant="ghost"
          aria-label="activity-button"
          fontSize="button.md"
          color="content.link"
          gap="8px"
          onClick={onActivityAdded}
        >
          <Icon as={MdAdd} h="16px" w="16px" />
          {t("add-activity")}
        </Button>
      </Box>
    </Card.Root>
  );
};

export default SuggestedActivityCard;
