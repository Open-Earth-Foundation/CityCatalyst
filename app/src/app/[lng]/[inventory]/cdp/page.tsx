"use client";

import { NavigationBar } from "@/components/navigation-bar";
import {
  Box,
  Button,
  Card,
  CardBody,
  CardFooter,
  CardHeader,
  Text,
} from "@chakra-ui/react";
import React from "react";
import { useTranslation } from "@/i18n/client";
import { api } from "@/services/api";

function Page({
  params: { lng, inventory },
}: {
  params: { lng: string; inventory: string };
}) {
  const { t } = useTranslation(lng, "cdp");
  const [connectToCDP] = api.useConnectToCDPMutation();
  const handleConnectToCDP = async () => {
    await connectToCDP({ inventoryId: inventory }).then((res) =>
      console.log(res),
    );
    console.log(inventory);
  };
  return (
    <Box>
      <NavigationBar lng="" />
      <Box className="h-[100vh] w-full flex justify-center items-center">
        <Card className="h-[300px] w-[300px] flex ">
          <CardHeader
            fontFamily="heading"
            fontWeight="bold"
            fontSize="headline.lg"
            className="flex items-center justify-center"
          >
            <Text>{t("add-data")}</Text>
          </CardHeader>
          <CardBody className="flex items-center justify-center">
            <Text>{t("submit-data-to-cdp")}</Text>
          </CardBody>
          <CardFooter p="0">
            <Button onClick={handleConnectToCDP} className="w-[100%]" h="50px">
              {t("submit-data-to-cdp")}
            </Button>
          </CardFooter>
        </Card>
      </Box>
    </Box>
  );
}

export default Page;
