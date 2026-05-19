import { Card, Button, HStack, Image, Icon, VStack } from "@chakra-ui/react";
import { Tag } from "@/components/ui/tag";
import { Tooltip } from "@/components/ui/tooltip";
import React from "react";
import type { TFunction } from "i18next";
import { ButtonMedium } from "@/components/package/Texts/Button";
import { BodyMedium, BodySmall } from "@/components/package/Texts/Body";
import { MdArrowForward, MdOpenInNew } from "react-icons/md";
import { MdInfoOutline } from "react-icons/md";
import { TitleLarge } from "@/components/package/Texts/Title";
import { ModuleAttributes } from "@/models/Module";
import NextLink from "next/link";
import { Modules } from "@/util/constants";

const GHGI_START_HERE_HIDDEN_KEY = "ghgi-start-here-hidden";

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
  const statusColorMap: Record<string, string> = {
    active: "green",
    beta: "blue",
    early_access: "purple",
    preview: "orange",
    prototype: "yellow",
    poc: "gray",
  };

  const statusLabelMap: Record<string, string> = {
    poc: "status-beta",
    prototype: "status-prototype",
    preview: "status-preview",
    early_access: "status-early-access",
    beta: "status-beta",
    active: "status-active",
  };

  const { name, author, description, tagline, url, logo, status } = module;
  const isGhgi = module.id === Modules.GHGI.id;
  const [hideStartHereTag, setHideStartHereTag] = React.useState(false);

  React.useEffect(() => {
    if (!isGhgi) return;

    const isHidden =
      localStorage.getItem(GHGI_START_HERE_HIDDEN_KEY) === "true";
    if (isHidden) {
      setHideStartHereTag(true);
    }
  }, [isGhgi]);

  const getTranslationInLanguage = (
    obj: { [lng: string]: string } | undefined,
  ) => {
    // 3rd party developers might not add a translation for all the languages,
    // try to use the user's language, then fallback to English, then fallback to the first language
    if (!obj) return "";
    return obj[language] || obj.en || Object.keys(obj)[0] || "";
  };

  const isExternal = url.startsWith("http");
  const resolvedUrl = isExternal ? url : `${baseUrl}${url}`;

  const handleModuleLaunch = (e: React.MouseEvent) => {
    if (isGhgi) {
      setHideStartHereTag(true);
      localStorage.setItem(GHGI_START_HERE_HIDDEN_KEY, "true");
    }

    if (isExternal) {
      e.preventDefault();
      window.open(url, "_blank", "noopener,noreferrer");
    }
    // For internal links, let the <a> tag handle navigation naturally
  };

  return (
    <Card.Root
      data-testid={`module-card-${module.id}`}
      width="320px"
      minH="280px"
      display="flex"
      flexDirection="column"
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
      <Card.Body gap={2} flex="1">
        <VStack w="full" align="start" gap={2}>
          <HStack justify="space-between" w="full">
            <HStack gap={2} justifyContent="space-between">
              <Image
                src={logo || "/assets/icon_inverted.svg"}
                boxSize={8}
                alt={`${name} module logo`}
              />

              {status && status !== "active" && (
                <Tag
                  size="sm"
                  colorPalette={statusColorMap[status] || "gray"}
                  borderRadius="10px"
                  textTransform="uppercase"
                  borderWidth="1px"
                  borderColor="content.tertiary"
                >
                  {t(statusLabelMap[status] || status)}
                </Tag>
              )}
            </HStack>
            <HStack gap={2} justifyContent="flex-end">
              {isGhgi && !hideStartHereTag && (
                <Tag
                  size="sm"
                  colorPalette="gray"
                  p={2}
                  borderRadius={"8px"}
                  bg="border.neutral"
                  color="content.secondary"
                  fontWeight="semibold"
                  textTransform="uppercase"
                >
                  {t("start-here")}
                </Tag>
              )}
              <Tooltip
                content={getTranslationInLanguage(description)}
                showArrow
                closeDelay={8000}
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
                  boxSize={6}
                  color="interactive.control"
                  cursor="pointer"
                />
              </Tooltip>
            </HStack>
          </HStack>
          <Card.Title
            mt={2}
            as="div"
            minH="60px"
            display="flex"
            alignItems="flex-start"
          >
            <TitleLarge lineClamp={2}>
              {getTranslationInLanguage(name)}
            </TitleLarge>
          </Card.Title>
        </VStack>
        <BodySmall lineClamp={1}>{t("by", { author: author })}</BodySmall>
        <Card.Description as="div">
          <BodyMedium lineClamp={2}>
            {getTranslationInLanguage(tagline)}
          </BodyMedium>
        </Card.Description>
      </Card.Body>
      <Card.Footer justifyContent="flex-end">
        <Button
          data-testid={`module-launch-${module.id}`}
          asChild
          variant="outline"
          w="fit-content"
          borderRadius="rounded-xxl"
          borderColor="border.neutral"
          mt={2}
          alignItems="center"
        >
          <NextLink
            href={resolvedUrl}
            onClick={handleModuleLaunch}
            target={"_blank"}
            rel={"noopener noreferrer"}
          >
            <ButtonMedium>{t("launch")}</ButtonMedium>
            <Icon as={MdOpenInNew} boxSize={5} />
          </NextLink>
        </Button>
      </Card.Footer>
    </Card.Root>
  );
}
