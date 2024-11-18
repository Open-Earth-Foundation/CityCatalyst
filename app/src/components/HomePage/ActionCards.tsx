import type { TFunction } from "i18next";
import { Box, Card, CardBody, CardHeader, Text } from "@chakra-ui/react";
import NextLink from "next/link";
import { MdOutlineAddchart } from "react-icons/md";
import { Trans } from "react-i18next/TransWithoutContext";
import DownloadButton from "@/components/HomePage/DownloadButton";
import type { CityAttributes } from "@/models/City";
import type { InventoryAttributes } from "@/models/Inventory";

export function ActionCards(props: {
  inventoryId: string | null;
  t: TFunction;
  city?: CityAttributes;
  lng: string;
  inventory?: InventoryAttributes;
}) {
  return (
    <Box className="flex gap-[24px] ">
      <NextLink
        data-testid={"add-data-to-inventory-card"}
        href={`/${props.inventoryId}/data`}
      >
        <Card
          shadow="2dp"
          backgroundColor="base.light"
          borderColor="interactive.accent"
          borderWidth="thin"
          className="h-[132px] hover:shadow-xl"
          py={0}
          px={6}
        >
          <Box className="flex items-center w-fill">
            <Box>
              <Box
                className="flex items-center justify-center h-[48px] w-[48px] rounded-full"
                backgroundColor={"interactive.primary"}
              >
                <MdOutlineAddchart className="text-white" size={24} />
              </Box>
            </Box>
            <Box>
              <CardHeader className="flex h-[20px] gap-2">
                <Text
                  fontFamily="heading"
                  fontSize="title.lg"
                  color="interactive.primary"
                  fontWeight="semibold"
                >
                  <Trans t={props.t}>add-data-to-inventory</Trans>
                </Text>
              </CardHeader>
              <CardBody className="h-[75px]">
                <Text
                  fontSize="body.lg"
                  color="body"
                  lineHeight="24"
                  letterSpacing="wide"
                >
                  <Trans t={props.t}>add-data-to-inventory-description</Trans>
                </Text>
              </CardBody>
            </Box>
          </Box>
        </Card>
      </NextLink>
      <Box>
        <DownloadButton
          lng={props.lng}
          t={props.t}
          inventoryId={props.inventoryId!}
          city={props.city}
          inventory={props.inventory}
        />
      </Box>
    </Box>
  );
}
