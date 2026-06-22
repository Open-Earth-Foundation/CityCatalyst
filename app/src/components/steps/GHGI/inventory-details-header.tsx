import { Box, HStack, Heading, Text } from "@chakra-ui/react";
import React, { FC } from "react";
import InventoryDetailsHelpDrawer from "./InventoryDetailsHelpDrawer";
import { TFunction } from "i18next";

interface InventoryDetailsHeaderProps {
  t: TFunction;
}

const InventoryDetailsHeader: FC<InventoryDetailsHeaderProps> = ({ t }) => {
  return (
    <Box
      minW={400}
      w="full"
      display="flex"
      flexDir="column"
      gap="24px"
      mb="48px"
    >
      <Text
        color="content.tertiary"
        fontSize="body.lg"
        fontStyle="normal"
        fontWeight="semibold"
        letterSpacing="wide"
        textTransform="uppercase"
      >
        {t("ghg-inventory-creation")}
      </Text>
      <HStack justifyContent="space-between" w="full">
        <Heading data-testid="inventory-details-heading" fontSize="display.sm">
          {t("setup-inventory-details-heading")}
        </Heading>
        <InventoryDetailsHelpDrawer t={t} />
      </HStack>
      <Text
        color="content.tertiary"
        fontSize="body.lg"
        fontStyle="normal"
        fontWeight="400"
        letterSpacing="wide"
        data-testid="inventory-details-description"
      >
        {t("setup-inventory-details-description")}
      </Text>
    </Box>
  );
};

export default InventoryDetailsHeader;
