"use client";
import { InventoryResponse } from "@/util/types";
import {
  Box,
  Button,
  Heading,
  HStack,
  Icon,
  Spacer,
  Text,
  VStack,
} from "@chakra-ui/react";
import { useTranslation } from "@/i18n/client";
import {
  MdKeyboardArrowDown,
  MdKeyboardArrowUp,
  MdPersonOutline,
  MdReplay,
  MdRestore,
} from "react-icons/md";
import { TFunction } from "i18next";
import { useState } from "react";

function VersionEntry({ t, isCurrent }: { t: TFunction; isCurrent: boolean }) {
  const date = new Date();
  const month = date.toLocaleString("default", { month: "long" });
  const formattedDate = `${month} ${date.getDate()}, ${date.getFullYear()} - ${date.getHours()}:${date.getMinutes()}`;
  const [isExpanded, setExpanded] = useState(false);

  return (
    <Box
      borderRadius="8px"
      borderWidth="2px"
      borderColor={isExpanded ? "interactive.secondary" : "border.neutral"}
      background="background.alternativeLight"
      _hover={{
        borderColor: "interactive.secondary",
      }}
      p={6}
      w="full"
      onClick={() => setExpanded(!isExpanded)}
    >
      <HStack>
        <VStack gap="0" alignItems="start">
          <HStack gap="19px">
            <Text fontSize="16px" fontWeight="699" lineHeight="24px">
              {t("inventory-versions-from")} {formattedDate}
            </Text>
            <Box
              padding="4px 16px"
              background="interactive.secondary"
              color="base.light"
              borderRadius="100px"
              fontWeight="600"
            >
              V3.1
            </Box>
            {isCurrent && (
              <Box
                padding="4px 16px"
                background="background.neutral"
                color="interactive.secondary"
                borderRadius="100px"
                fontWeight="600"
                textTransform="uppercase"
              >
                {t("inventory-versions-current")}
              </Box>
            )}
          </HStack>
          <Text
            color="content.secondary"
            fontSize="14px"
            fontWeight="400"
            lineHeight="20px"
            letterSpacing="0.5px"
            fontFamily="Open Sans"
          >
            <Icon
              as={MdPersonOutline}
              boxSize={6}
              color="interactive.control"
            />
            Maria Rossi
          </Text>
        </VStack>
        <Spacer />
        {!isCurrent && (
          <Button variant="outline">
            <Icon as={MdReplay} />
            Restore
          </Button>
        )}
        <Icon
          as={isExpanded ? MdKeyboardArrowUp : MdKeyboardArrowDown}
          boxSize={6}
          color="interactive.control"
        />
      </HStack>
    </Box>
  );
}

export default function InventoryVersions({
  lng,
  inventory,
}: {
  lng: string;
  inventory?: InventoryResponse;
}) {
  const { t } = useTranslation(lng, "dashboard");
  return (
    <VStack alignItems="start" gap={4} mt={1}>
      <HStack gap={4} mb={4}>
        <Icon as={MdRestore} boxSize="32px" color="interactive.secondary" />
        <VStack gap={4} w="full" alignItems="start">
          <Heading fontSize="headline.sm" fontWeight="semibold" lineHeight="32">
            {t("inventory-versions-title")}
          </Heading>
          <Text
            fontWeight="regular"
            fontSize="body.lg"
            color="interactive.control"
            letterSpacing="wide"
          >
            {t("inventory-versions-description")}
          </Text>
        </VStack>
      </HStack>
      {[0, 1, 2].map((i) => (
        <VersionEntry key={i} t={t} isCurrent={i === 0} />
      ))}
    </VStack>
  );
}
