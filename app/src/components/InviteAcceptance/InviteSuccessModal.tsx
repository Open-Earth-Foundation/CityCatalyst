"use client";

import React from "react";
import { Box, VStack, HStack, Text, Icon } from "@chakra-ui/react";
import { DisplaySmall } from "@/components/Texts/Display";
import { BodyLarge } from "@/components/Texts/Body";
import { useTranslation } from "@/i18n/client";
import { Button } from "../ui/button";
import { MdArrowForward } from "react-icons/md";

interface InviteData {
  type: "city" | "organization";
  email: string;
  num_cities?: number;
  organization_id?: string;
  cities?: Array<{
    cityId: string;
    cityName: string;
    flag: string;
  }>;
}

interface InviteSuccessModalProps {
  isOpen: boolean;
  onClose: () => void;
  inviteData: InviteData | null;
  lng: string;
}

const InviteSuccessModal: React.FC<InviteSuccessModalProps> = ({
  isOpen,
  onClose,
  inviteData,
  lng,
}) => {
  const { t } = useTranslation(lng, "auth");

  if (!isOpen || !inviteData) return null;

  const getSuccessMessage = () => {
    if (inviteData.type === "city") {
      const cityCount = inviteData.num_cities || inviteData.cities?.length || 1;
      return cityCount === 1 
        ? t("invite-city-success-single")
        : t("invite-city-success-multiple", { count: cityCount });
    }
    return t("invite-organization-success");
  };

  return (
      <Box
        p="48px"
        maxW="500px"
        w="90%"
        mx="auto"
        textAlign="left"
      >
        <VStack gap="24px" mt="100px" justify="flex-start">
          <DisplaySmall
            w="100%" 
            text={t("invitation-accepted")}
            color="content.alternative"
          />
          
          <BodyLarge
            w="100%" 
            color="content.tertiary"
            textAlign="left"
            maxW="400px"
          >
            {getSuccessMessage()}
          </BodyLarge>

          {inviteData.type === "city" && inviteData.cities && (
            <VStack gap="12px" w="100%">
              <Text
                w="100%"
                fontSize="body.md"
                fontWeight="semibold"
                color="content.secondary"
              >
                {t("invited-cities")}:
              </Text>
              <VStack gap="8px" maxH="200px" overflowY="auto" w="100%">
                {inviteData.cities.map((city, index) => (
                  <HStack
                    key={city.cityId || index}
                    p="8px 12px"
                    borderRadius="8px"
                    borderWidth="1px"
                    borderColor="border.default"
                    w="100%"
                    justify="flex-start"
                  >
                    {city.flag && (
                      <Text fontSize="20px" mr="8px">
                        {city.flag}
                      </Text>
                    )}
                    <Text
                      fontSize="body.md"
                      color="content.primary"
                      fontWeight="medium"
                    >
                      {city.cityName}
                    </Text>
                  </HStack>
                ))}
              </VStack>
            </VStack>
          )}

          <Button
            onClick={onClose}
            gap="8px"
            w="100%"
            h="48px"
            px="24px"
            my="24px"
            fontSize="body.md"
          >
            <Icon as={MdArrowForward} />
            {t("continue")}
          </Button>
        </VStack>
      </Box>
  );
};

export default InviteSuccessModal;