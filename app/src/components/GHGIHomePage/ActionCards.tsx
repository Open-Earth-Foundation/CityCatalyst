import type { TFunction } from "i18next";
import { Box, Card, CardBody, CardHeader, Text } from "@chakra-ui/react";
import NextLink from "next/link";
import { MdOutlineAddchart } from "react-icons/md";
import { Trans } from "react-i18next/TransWithoutContext";
import DownloadButton from "@/components/GHGIHomePage/DownloadButton";
import type { CityAttributes } from "@/models/City";
import type { InventoryAttributes } from "@/models/Inventory";
import { AddCollaboratorButton } from "@/components/GHGIHomePage/AddCollaboratorButton";
import { usePathname } from "next/navigation";

export function ActionCards({
  city,
  inventory,
  inventoryId,
  lng,
  t,
}: {
  inventoryId: string | null;
  t: TFunction;
  city?: CityAttributes;
  lng: string;
  inventory?: InventoryAttributes;
}) {
  const pathname = usePathname();

  return (
    <Box display="flex" gap="24px" w="full">
      <NextLink
        data-testid={"add-data-to-inventory-card"}
        href={`${pathname}/data`}
        role="button"
        aria-label={t("add-data-to-inventory")}
      >
        <Card.Root
          shadow="2dp"
          backgroundColor="base.light"
          borderColor="interactive.accent"
          borderWidth="thin"
          h="208px"
          _hover={{ shadow: "xl" }}
          py={0}
          px={6}
        >
          <Box display="flex" alignItems="center" height={"100%"}>
            <Box>
              <Box
                display="flex"
                alignItems="center"
                justifyContent="center"
                h="48px"
                w="48px"
                borderRadius="full"
                backgroundColor={"interactive.primary"}
              >
                <MdOutlineAddchart color="white" size={24} />
              </Box>
            </Box>
            <Box display="flex" flexDir="column" gap="12px">
              <CardHeader display="flex" h="20px" gap={2}>
                <Text
                  fontFamily="heading"
                  fontSize="title.lg"
                  color="interactive.primary"
                  fontWeight="semibold"
                >
                  <Trans t={t}>add-data-to-inventory</Trans>
                </Text>
              </CardHeader>
              <CardBody h="75px">
                <Text
                  fontSize="body.lg"
                  color="body"
                  lineHeight="24"
                  letterSpacing="wide"
                >
                  <Trans t={t}>add-data-to-inventory-description</Trans>
                </Text>
              </CardBody>
            </Box>
          </Box>
        </Card.Root>
      </NextLink>
      <Box display="flex" flexDirection="column" gap="8px">
        <AddCollaboratorButton lng={lng} />
        <DownloadButton
          lng={lng}
          inventoryId={inventoryId!}
          city={city}
          inventory={inventory}
        />
      </Box>
    </Box>
  );
}
