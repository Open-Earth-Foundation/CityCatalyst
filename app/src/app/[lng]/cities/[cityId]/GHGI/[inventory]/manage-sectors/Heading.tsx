import { Button } from "@/components/ui/button";
import { HelpDrawer, HelpDrawerItem } from "@/components/ui/help-drawer";
import { Box, Icon, Text } from "@chakra-ui/react";
import { usePathname, useRouter } from "next/navigation";
import { MdArrowBack } from "react-icons/md";
import type { FC } from "react";
import type { TFunction } from "i18next";

interface HeadingProps {
  t: TFunction;
}

const getNotationKeysHelpItems = (t: TFunction): HelpDrawerItem[] => {
  const notationKeyDefinitionSuggestions = [
    {
      preview: t("chat-suggestion-notation-keys-1"),
      message: t("chat-suggestion-notation-keys-1-message"),
    },
    {
      preview: t("chat-suggestion-notation-keys-2"),
      message: t("chat-suggestion-notation-keys-2-message"),
    },
    {
      preview: t("chat-suggestion-notation-keys-3"),
      message: t("chat-suggestion-notation-keys-3-message"),
    },
  ];

  const commonNotationKeysSuggestions = [
    {
      preview: t("chat-suggestion-common-notation-keys-1"),
      message: t("chat-suggestion-common-notation-keys-1-message"),
    },
    {
      preview: t("chat-suggestion-common-notation-keys-2"),
      message: t("chat-suggestion-common-notation-keys-2-message"),
    },
  ];

  const howToUseNotationKeysSuggestions = [
    {
      preview: t("chat-suggestion-how-to-use-notation-keys-1"),
      message: t("chat-suggestion-how-to-use-notation-keys-1-message"),
    },
    {
      preview: t("chat-suggestion-how-to-use-notation-keys-2"),
      message: t("chat-suggestion-how-to-use-notation-keys-2-message"),
    },
  ];

  return [
    {
      value: "notation_key_definition",
      title: t("notation-key-question"),
      itemDescription: t("notation-key-answer"),
      suggestions: notationKeyDefinitionSuggestions,
    },
    {
      value: "common_notation_keys",
      title: t("common-notation-keys"),
      bulletPoints: [
        `${t("ne")} - ${t("ne-description")}`,
        `${t("no")} - ${t("no-description")}`,
        `${t("ie")} - ${t("ie-description")}`,
        `${t("c")} - ${t("c-description")}`,
      ],
      suggestions: commonNotationKeysSuggestions,
    },
    {
      value: "how_to_use_notation_keys",
      title: t("how-to-use-notation-keys"),
      itemDescription: t("how-to-use-notation-keys-description"),
      learnMoreLink:
        "https://unfccc.int/resource/tet/bg/bg2-02_Overview_Notation_Keys.pdf",
      suggestions: howToUseNotationKeysSuggestions,
    },
  ];
};

const Heading: FC<HeadingProps> = ({ t }) => {
  const router = useRouter();
  const pathname = usePathname();
  const inventoryHomePath = pathname.replace(/\/manage-sectors\/?$/, "");

  return (
    <Box pt="48px" display="flex" flexDir="column" gap="64px">
      <Box display="flex" alignItems="center">
        <Button
          variant="ghost"
          color="content.link"
          px={1}
          onClick={() => router.push(inventoryHomePath)}
        >
          <Icon as={MdArrowBack} />
          {t("go-back")}
        </Button>
        <Box
          h="24px"
          borderRightWidth={1}
          borderColor="border.neutral"
          w="24px"
        />
      </Box>
      <Box display="flex" justifyContent="space-between" alignItems="center">
        <Box>
          <Text
            fontSize="headline.lg"
            color="content.primary"
            fontWeight="bold"
            lineHeight="32px"
            mb="8px"
            fontFamily="heading"
          >
            {t("notation-keys")}
          </Text>
          <Text
            fontSize="body.lg"
            color="content.tertiary"
            lineHeight="32px"
            mb="8px"
            fontFamily="body"
          >
            {t("manage-missing-subsectors-description")}
          </Text>
        </Box>
        <HelpDrawer
          triggerLabel={t("help-button")}
          title={t("drawer-help-section-title")}
          description={t("drawer-help-section-description")}
          items={getNotationKeysHelpItems(t)}
          askAiLabel={t("ask-ai")}
          learnMoreLabel={t("learn-more")}
        />
      </Box>
    </Box>
  );
};

export default Heading;
