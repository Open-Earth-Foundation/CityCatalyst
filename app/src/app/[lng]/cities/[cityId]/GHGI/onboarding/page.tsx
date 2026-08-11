"use client";
import { use, useState } from "react";

import { useTranslation } from "@/i18n/client";
import { Box, Heading, Icon, Text, VStack } from "@chakra-ui/react";
import Image from "next/image";
import { MdArrowBack, MdArrowForward } from "react-icons/md";
import { useRouter } from "next/navigation";
import { Trans } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Radio, RadioGroup } from "@/components/ui/radio";
import { api } from "@/services/api";

type InventoryCreationMode = "upload" | "create" | "";

export default function Onboarding(props: {
  params: Promise<{ lng: string; cityId: string }>;
}) {
  const { lng, cityId } = use(props.params);
  const { t } = useTranslation(lng, "onboarding");
  const router = useRouter();
  const [selection, setSelection] = useState<InventoryCreationMode>("");

  const { data: city } = api.useGetCityQuery(cityId, {
    skip: !cityId,
  });

  const handleContinue = () => {
    if (selection === "upload") {
      router.push("setup?mode=upload");
    } else if (selection === "create") {
      router.push("setup");
    }
  };

  return (
    <>
      <Box w="1090px" maxW="full" mx="auto" pt="48px" pb="137px">
        <VStack alignItems="flex-start">
          <Button
            variant="ghost"
            onClick={() => router.back()}
            color="content.link"
            mb="40px"
          >
            <Icon as={MdArrowBack} boxSize={6} />
            {t("go-back")}
          </Button>
          {/* city name */}
          <Text
            fontSize="body.lg"
            fontWeight="600"
            color="content.tertiary"
            mb="24px"
          >
            {city?.name}
          </Text>
          <Heading
            as="h1"
            color="content.primary"
            fontSize="display.sm"
            lineHeight="44px"
            fontWeight="600"
            mb="24px"
            data-testid="start-page-heading"
          >
            {t("select-inventory-creation-method")}
          </Heading>
          {/* Inventory creation method */}
          <Box
            bg="base.light"
            borderRadius="xl"
            p="24px"
            display="flex"
            alignItems="center"
            gap="24px"
            shadow="sm"
          >
            <RadioGroup
              value={selection}
              onValueChange={(details) =>
                setSelection(details.value as InventoryCreationMode)
              }
              display="flex"
              flexDirection="column"
              gap="40px"
              flex="1"
            >
              {/* Create new option */}
              <Radio
                value="create"
                variant="filled"
                alignItems="flex-start"
                gap="16px"
                p="12px"
                cursor="pointer"
                borderRadius="lg"
                _hover={{ bg: "background.backgroundLight" }}
                data-testid="create-inventory-option"
              >
                <Box>
                  <Text
                    fontWeight="600"
                    fontSize="body.lg"
                    color="content.primary"
                    lineHeight="24px"
                    fontFamily="body"
                  >
                    {t("create-new-inventory-option")}
                  </Text>
                  <Text
                    fontSize="body.md"
                    color="content.tertiary"
                    mt="4px"
                    lineHeight="20px"
                    fontFamily="body"
                  >
                    <Trans
                      i18nKey="create-new-inventory-option-description"
                      t={t}
                      components={[
                        <span key="0" />,
                        <strong key="1" />,
                        <strong key="2" />,
                        <strong key="3" />,
                      ]}
                    />
                  </Text>
                </Box>
              </Radio>

              {/* Upload option */}
              <Radio
                value="upload"
                variant="filled"
                alignItems="flex-start"
                gap="16px"
                p="12px"
                cursor="pointer"
                borderRadius="lg"
                _hover={{ bg: "background.backgroundLight" }}
                data-testid="upload-inventory-option"
              >
                <Box>
                  <Text
                    fontWeight="600"
                    fontSize="body.lg"
                    color="content.primary"
                    lineHeight="24px"
                    fontFamily="body"
                  >
                    {t("upload-an-existing-inventory")}
                  </Text>
                  <Text
                    fontSize="body.md"
                    color="content.tertiary"
                    mt="4px"
                    lineHeight="20px"
                    fontFamily="body"
                  >
                    <Trans
                      i18nKey="upload-existing-inventory-option-description"
                      t={t}
                      components={[
                        <span key="0" />,
                        <strong key="1" />,
                        <strong key="2" />,
                        <strong key="3" />,
                        <strong key="4" />,
                      ]}
                    />
                  </Text>
                </Box>
              </Radio>
            </RadioGroup>

            <Box flexShrink={0} lineHeight={0}>
              <Image
                src="/assets/onboarding-building-illustration.png"
                alt="buildings"
                height={230}
                width={390}
                style={{ display: "block" }}
              />
            </Box>
          </Box>
        </VStack>
      </Box>
      {/* Bottom bar */}
      <Box
        bg="base.light"
        h="96px"
        w="full"
        pos="fixed"
        bottom="0"
        left="0"
        data-onboarding-bottom-bar
      >
        <Box
          h="full"
          w="full"
          display="flex"
          justifyContent="end"
          alignItems="center"
          px="175px"
          gap="16px"
        >
          <Button
            w="auto"
            gap="8px"
            py="16px"
            px="24px"
            h="64px"
            disabled={!selection}
            onClick={handleContinue}
            data-testid="continue-button"
          >
            <Text fontFamily="button.md" fontWeight="600" letterSpacing="wider">
              {t("continue")}
            </Text>
            <MdArrowForward size="24px" />
          </Button>
        </Box>
      </Box>
    </>
  );
}
