import { TFunction } from "i18next";
import { Badge, Box, Flex, Heading, Link, Text } from "@chakra-ui/react";
import { Trans } from "react-i18next/TransWithoutContext";
import { MdOutlineAccountTree, MdOutlineCalendarToday } from "react-icons/md";
import type { InventoryResponse } from "@/util/types";
import { InventoryTypeEnum } from "@/util/constants";

export function TabHeader({
  t,
  title,
  isPublic = false,
  inventory,
}: {
  t: TFunction<string, undefined>;
  title: string;
  isPublic?: boolean;
  inventory?: InventoryResponse;
}) {
  return (
    <>
      <Box className="flex items-center gap-3">
        <Heading fontSize="headline.sm" fontWeight="semibold" lineHeight="32">
          {t(title)}
        </Heading>
      </Box>
      <Box className="flex items-center gap-3">
        <Badge
          borderWidth="1px"
          borderColor="border.neutral"
          py={1}
          px={2}
          borderRadius="full"
          bg="base.light"
        >
          <Flex>
            <MdOutlineCalendarToday size="20px" style={{ marginRight: 1 }} />
            {t("year")}: {inventory?.year}
          </Flex>
        </Badge>

        <Badge
          borderWidth="1px"
          borderColor="border.neutral"
          py={1}
          px={2}
          borderRadius="full"
          bg="base.light"
        >
          <Flex>
            <MdOutlineAccountTree size="20px" style={{ marginRight: 1 }} />
            {inventory?.inventoryType === InventoryTypeEnum.GPC_BASIC_PLUS
              ? t("inventory-format-basic+")
              : t("inventory-format-basic")}
          </Flex>
        </Badge>
      </Box>
      <Text
        fontWeight="regular"
        fontSize="body.lg"
        color="interactive.control"
        letterSpacing="wide"
      >
        {" "}
        {!isPublic ? (
          <Trans
            i18nKey="gpc-inventory-description"
            values={{ year: inventory?.year }}
            t={t}
          >
            Track and review your {{ year: inventory?.year }} GHG Emission
            inventory data, prepared according to the Greenhouse Gas Protocol
            for Cities (GPC) Framework. The data you have submitted is now
            officially incorporated{" "}
            <Link
              href="https://ghgprotocol.org/ghg-protocol-cities"
              target="_blank"
              fontWeight="bold"
              color="brand.secondary"
            >
              Learn more
            </Link>{" "}
            about the GPC framework for the inventory calculation.
          </Trans>
        ) : (
          <Trans
            i18nKey="gpc-inventory-description-public"
            values={{ year: inventory?.year }}
            t={t}
          >
            Review the results of {{ year: inventory?.year }} GHG Emission
            Inventory, prepared according to the GPC Framework.{" "}
            <Link
              href="https://ghgprotocol.org/ghg-protocol-cities"
              target="_blank"
              fontWeight="bold"
              color="brand.secondary"
            >
              Learn more
            </Link>{" "}
            about the GPC framework.
          </Trans>
        )}
      </Text>
    </>
  );
}
