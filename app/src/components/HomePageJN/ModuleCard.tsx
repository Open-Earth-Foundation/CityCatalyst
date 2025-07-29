import { Card, Button, HStack, Image, Icon, VStack } from "@chakra-ui/react";
import { Tooltip } from "@/components/ui/tooltip";
import React from "react";
import type { TFunction } from "i18next";
import { ButtonMedium } from "@/components/Texts/Button";
import { BodyMedium, BodySmall } from "../Texts/Body";
import { MdArrowForward } from "react-icons/md";
import { MdInfoOutline } from "react-icons/md";
import { TitleLarge } from "../Texts/Title";
import { ModuleAttributes } from "@/models/Module";

export function ModuleCard({
  module,
  t,
  enabled = true,
  baseUrl,
  language,
}: {
  module: ModuleAttributes;
  t: TFunction;
  enabled?: boolean;
  baseUrl: string;
  language: string;
}) {
  const { name, author, description, tagline, url } = module;
  const getTranslationInLanguage = (
    obj: { [lng: string]: string } | undefined,
  ) => {
    // 3rd party developers might not add a translation for all the languages,
    // try to use the user's language, then fallback to English, then fallback to the first language
    if (!obj) return "";
    return obj[language] || obj.en || Object.keys(obj)[0] || "";
  };
  return (
    <Card.Root
      width="320px"
      opacity={enabled ? 1 : 0.5}
      pointerEvents={enabled ? "auto" : "none"}
      borderColor="gray.200"
      borderWidth="1px"
      borderRadius="xl"
      bg="white"
      boxShadow="sm"
      transition="box-shadow 0.2s"
      _hover={{ boxShadow: enabled ? "md" : "sm" }}
    >
      <Card.Body gap={2}>
        <VStack w="full" align="start" gap={2}>
          <HStack justify="space-between" w="full">
            <Image src="/assets/icon_inverted.svg" boxSize={8} alt="" />

            <Tooltip
              content={getTranslationInLanguage(description)}
              showArrow
              contentProps={{
                bg: "content.secondary",
                color: "background.default",
                borderRadius: "md",
                p: 3,
                maxW: "300px",
                fontSize: "sm",
              }}
            >
              <Icon
                as={MdInfoOutline}
                boxSize={5}
                color="interactive.control"
                cursor="pointer"
              />
            </Tooltip>
          </HStack>
          <HStack align="start" gap={4} justify="space-between">
            <HStack align="start" gap={4}>
              <Card.Title mt={2} as="div">
                <TitleLarge>{getTranslationInLanguage(name)}</TitleLarge>
              </Card.Title>
            </HStack>
          </HStack>
        </VStack>
        <BodySmall>{t("by", { author: author })}</BodySmall>
        <Card.Description as="div">
          <BodyMedium lineClamp={2}>
            {getTranslationInLanguage(tagline)}
          </BodyMedium>
        </Card.Description>
      </Card.Body>
      <Card.Footer justifyContent="flex-end">
        <Button
          as="div"
          onClick={() => {
            window.location.href = `${baseUrl}${url}`;
          }}
          variant="outline"
          w="fit-content"
          borderRadius="rounded-xxl"
          borderColor="border.neutral"
          mt={2}
          alignItems="center"
        >
          <ButtonMedium>{t("launch")}</ButtonMedium>
          <MdArrowForward />
        </Button>
      </Card.Footer>
    </Card.Root>
  );
}
