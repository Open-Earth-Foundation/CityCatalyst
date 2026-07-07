"use client";
import { use, useState } from "react";

import { useTranslation } from "@/i18n/client";
import { Box, Heading, Icon, RadioGroup, Text } from "@chakra-ui/react";
import Image from "next/image";
import { MdArrowBack, MdArrowForward } from "react-icons/md";
import { useRouter } from "next/navigation";
import { Trans } from "react-i18next";
import { Button } from "@/components/ui/button";

type InventoryCreationMode = "upload" | "create" | "";

export default function Onboarding(props: {
  params: Promise<{ lng: string }>;
}) {
  const { lng } = use(props.params);
  const { t } = useTranslation(lng, "onboarding");
  const router = useRouter();
  const [selection, setSelection] = useState<InventoryCreationMode>("");

  const handleContinue = () => {
    if (selection === "upload") {
      router.push("setup?mode=upload");
    } else if (selection === "create") {
      router.push("setup");
    }
  };

  return (
    <>
      <Box w="1090px" maxW="full" mx="auto" pt="48px">
        <Button
          variant="ghost"
          onClick={() => router.back()}
          pl={0}
          color="content.link"
          mb="16px"
        >
          <Icon as={MdArrowBack} boxSize={6} />
          {t("go-back")}
        </Button>
        <Heading
          as="h1"
          color="content.primary"
          fontSize="display.sm"
          lineHeight="44px"
          fontWeight="600"
          mb="32px"
          data-testid="start-page-heading"
        >
          {t("select-inventory-creation-method")}
        </Heading>

        <Box
          bg="base.light"
          borderRadius="xl"
          borderWidth="1px"
          borderColor="border.neutral"
          p="24px"
          display="flex"
          alignItems="center"
          gap="24px"
        >
          <RadioGroup.Root
            value={selection}
            onValueChange={(details) =>
              setSelection(details.value as InventoryCreationMode)
            }
            display="flex"
            flexDirection="column"
            gap="0"
            flex="1"
          >
            {/* Upload option */}
            <RadioGroup.Item
              value="upload"
              alignItems="flex-start"
              gap="16px"
              p="12px"
              cursor="pointer"
              borderRadius="lg"
              _hover={{ bg: "background.backgroundLight" }}
              data-testid="upload-inventory-option"
            >
              <RadioGroup.ItemHiddenInput />
              <RadioGroup.ItemIndicator
                mt="3px"
                color="content.link"
                borderColor="border.neutral"
                _checked={{ borderColor: "content.link", color: "content.link" }}
                flexShrink={0}
              />
              <Box>
                <RadioGroup.ItemText asChild>
                  <Text
                    fontWeight="600"
                    fontSize="body.lg"
                    color="content.primary"
                    lineHeight="24px"
                  >
                    {t("upload-an-existing-inventory")}
                  </Text>
                </RadioGroup.ItemText>
                <Text
                  fontSize="body.md"
                  color="content.tertiary"
                  mt="4px"
                  lineHeight="20px"
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
            </RadioGroup.Item>

            {/* Divider */}
            <Box borderBottomWidth="1px" borderColor="border.neutral" mx="16px" />

            {/* Create new option */}
            <RadioGroup.Item
              value="create"
              alignItems="flex-start"
              gap="16px"
              p="12px"
              cursor="pointer"
              borderRadius="lg"
              _hover={{ bg: "background.backgroundLight" }}
              data-testid="create-inventory-option"
            >
              <RadioGroup.ItemHiddenInput />
              <RadioGroup.ItemIndicator
                mt="3px"
                color="content.link"
                borderColor="border.neutral"
                _checked={{ borderColor: "content.link", color: "content.link" }}
                flexShrink={0}
              />
              <Box>
                <RadioGroup.ItemText asChild>
                  <Text
                    fontWeight="600"
                    fontSize="body.lg"
                    color="content.primary"
                    lineHeight="24px"
                  >
                    {t("create-new-inventory-option")}
                  </Text>
                </RadioGroup.ItemText>
                <Text
                  fontSize="body.md"
                  color="content.tertiary"
                  mt="4px"
                  lineHeight="20px"
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
            </RadioGroup.Item>
          </RadioGroup.Root>

          <Box flexShrink={0} lineHeight={0}>
            <Image
              src="/assets/onboarding-buildings-image.png"
              alt="buildings"
              height={230}
              width={390}
              style={{ display: "block" }}
            />
          </Box>
        </Box>
      </Box>

      <Box
        bg="base.light"
        h="96px"
        w="full"
        pos="fixed"
        bottom="0"
        left="0"
        borderTopWidth="1px"
        borderColor="border.neutral"
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
