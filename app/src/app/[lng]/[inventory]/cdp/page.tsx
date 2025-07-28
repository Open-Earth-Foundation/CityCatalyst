"use client";

import {
  Box,
  Button,
  Card,
  CardBody,
  CardFooter,
  CardHeader,
  Text,
  VStack,
} from "@chakra-ui/react";
import React, { useState, use } from "react";
import { useTranslation } from "@/i18n/client";
import { api } from "@/services/api";

function Page(props: { params: Promise<{ lng: string; inventory: string }> }) {
  const { lng, inventory } = use(props.params);

  const { t } = useTranslation(lng, "cdp");
  const [statusMessage, setStatusMessage] = useState(t("submit-data-to-cdp"));
  const [wasSuccessful, setWasSuccessful] = useState(true);

  const [connectToCDP, { isLoading }] = api.useConnectToCDPMutation();
  const handleConnectToCDP = async () => {
    const res: { data?: any; error?: any } = await connectToCDP({
      inventoryId: inventory,
    });

    if (res.error) {
      const message = res.error.data.error.message;
      setStatusMessage(message);
      setWasSuccessful(false);
    } else {
      setStatusMessage("Success");
      setWasSuccessful(true);
    }
  };
  return (
    <Box
      h="100vh"
      w="full"
      display="flex"
      justifyContent="center"
      alignItems="center"
    >
      <Card.Root minH="300px" minW="300px">
        <CardHeader
          fontFamily="heading"
          fontWeight="bold"
          fontSize="headline.lg"
          display="flex"
          justifyContent="center"
          alignItems="center"
        >
          <Text>{t("add-data")}</Text>
        </CardHeader>
        <CardBody display="flex" justifyContent="center" alignItems="center">
          <VStack>
            <Text color={wasSuccessful ? "green" : "red"} textAlign="center">
              {statusMessage}
            </Text>
          </VStack>
        </CardBody>
        <CardFooter px="0">
          <Button
            onClick={handleConnectToCDP}
            loading={isLoading}
            w="full"
            size="lg"
          >
            {t("submit-data-to-cdp")}
          </Button>
        </CardFooter>
      </Card.Root>
    </Box>
  );
}

export default Page;
