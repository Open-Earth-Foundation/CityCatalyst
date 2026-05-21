"use client";

import { TFunction } from "i18next";
import {
  Accordion,
  Box,
  Drawer,
  HStack,
  Icon,
  Link,
  Portal,
  Span,
  Text,
  useDisclosure,
} from "@chakra-ui/react";
import { Button } from "@/components/ui/button";
import { BiChevronDown, BiLinkExternal } from "react-icons/bi";
import { AskAiIconOutline2 } from "@/components/icons";

interface ChatSuggestion {
  preview: string;
  message: string;
}

interface HelpDrawerItem {
  value: string;
  title: string;
  itemDescription: string;
  subtitle: string;
  bulletPoints: string[];
  itemSummary?: string;
  learnMoreLink: string;
  suggestions: ChatSuggestion[];
}

const getHelpDrawerItems = (t: TFunction): HelpDrawerItem[] => [
  {
    value: "gpc_definition",
    title: t("gpc-definition"),
    itemDescription: t("gpc-definition-description"),
    subtitle: t("in-simple-terms"),
    bulletPoints: [
      t("gpc-definition-bullet-point-1"),
      t("gpc-definition-bullet-point-2"),
      t("gpc-definition-bullet-point-3"),
      t("gpc-definition-bullet-point-4"),
    ],
    itemSummary: t("gpc-definition-summary"),
    learnMoreLink: "https://ghgprotocol.org/ghg-protocol-cities",
    suggestions: [
      { preview: t("chat-suggestion-gpc-definition-1"), message: t("chat-suggestion-gpc-definition-1-message") },
      { preview: t("chat-suggestion-gpc-definition-2"), message: t("chat-suggestion-gpc-definition-2-message") },
      { preview: t("chat-suggestion-gpc-definition-3"), message: t("chat-suggestion-gpc-definition-3-message") },
    ],
  },
  {
    value: "gpc_basic_definition",
    title: t("gpc-basic-definition"),
    itemDescription: t("gpc-basic-definition-description"),
    subtitle: t("in-simple-terms"),
    bulletPoints: [
      t("gpc-basic-definition-bullet-point-1"),
      t("gpc-basic-definition-bullet-point-2"),
    ],
    learnMoreLink:
      "https://ghgprotocol.org/sites/default/files/ghgp/standards/GHGP_GPC_0.pdf",
    suggestions: [
      { preview: t("chat-suggestion-gpc-basic-1"), message: t("chat-suggestion-gpc-basic-1-message") },
      { preview: t("chat-suggestion-gpc-basic-2"), message: t("chat-suggestion-gpc-basic-2-message") },
      { preview: t("chat-suggestion-gpc-basic-3"), message: t("chat-suggestion-gpc-basic-3-message") },
    ],
  },
  {
    value: "gpc_basic_plus_definition",
    title: t("gpc-basic-plus-definition"),
    itemDescription: t("gpc-basic-plus-definition-description"),
    subtitle: t("in-simple-terms"),
    bulletPoints: [
      t("gpc-basic-plus-definition-bullet-point-1"),
      t("gpc-basic-plus-definition-bullet-point-2"),
      t("gpc-basic-plus-definition-bullet-point-3"),
    ],
    itemSummary: t("gpc-basic-plus-definition-summary"),
    learnMoreLink:
      "https://ghgprotocol.org/sites/default/files/ghgp/standards/GHGP_GPC_0.pdf",
    suggestions: [
      { preview: t("chat-suggestion-gpc-basic-plus-1"), message: t("chat-suggestion-gpc-basic-plus-1-message") },
      { preview: t("chat-suggestion-gpc-basic-plus-2"), message: t("chat-suggestion-gpc-basic-plus-2-message") },
      { preview: t("chat-suggestion-gpc-basic-plus-3"), message: t("chat-suggestion-gpc-basic-plus-3-message") },
    ],
  },
  {
    value: "gwp_ar5_definition",
    title: t("gwp-ar5-definition"),
    itemDescription: t("gwp-ar5-definition-description"),
    subtitle: t("in-simple-terms"),
    bulletPoints: [
      t("gwp-ar5-definition-bullet-point-1"),
      t("gwp-ar5-definition-bullet-point-2"),
      t("gwp-ar5-definition-bullet-point-3"),
      t("gwp-ar5-definition-bullet-point-4"),
    ],
    itemSummary: t("gwp-ar5-definition-summary"),
    learnMoreLink: "https://www.ipcc.ch/assessment-report/ar5/",
    suggestions: [
      { preview: t("chat-suggestion-ar5-1"), message: t("chat-suggestion-ar5-1-message") },
      { preview: t("chat-suggestion-ar5-2"), message: t("chat-suggestion-ar5-2-message") },
      { preview: t("chat-suggestion-ar5-3"), message: t("chat-suggestion-ar5-3-message") },
    ],
  },
  {
    value: "gwp_ar6_definition",
    title: t("gwp-ar6-definition"),
    itemDescription: t("gwp-ar6-definition-description"),
    subtitle: t("in-simple-terms"),
    bulletPoints: [
      t("gwp-ar6-definition-bullet-point-1"),
      t("gwp-ar6-definition-bullet-point-2"),
      t("gwp-ar6-definition-bullet-point-3"),
      t("gwp-ar6-definition-bullet-point-4"),
    ],
    itemSummary: t("gwp-ar6-definition-summary"),
    learnMoreLink: "https://www.ipcc.ch/assessment-report/ar6/",
    suggestions: [
      { preview: t("chat-suggestion-ar6-1"), message: t("chat-suggestion-ar6-1-message") },
      { preview: t("chat-suggestion-ar6-2"), message: t("chat-suggestion-ar6-2-message") },
      { preview: t("chat-suggestion-ar6-3"), message: t("chat-suggestion-ar6-3-message") },
    ],
  },
];

export default function InventoryDetailsHelpDrawer({ t }: { t: TFunction }) {
  const items = getHelpDrawerItems(t);
  const { open, onOpen, onClose } = useDisclosure();

  return (
    <Drawer.Root
      size="sm"
      open={open}
      onOpenChange={(e) => (e.open ? onOpen() : onClose())}
    >
      <Drawer.Trigger asChild>
        <Button variant="outline" onClick={onOpen}>{t("help-section")}</Button>
      </Drawer.Trigger>
      <Portal>
        <Drawer.Positioner>
          <Drawer.Content>
            <Drawer.Header>
              <Drawer.Title
                fontFamily="heading"
                fontSize="title.lg"
                fontStyle="normal"
                fontWeight="semibold"
              >
                {t("drawer-help-section-title")}
              </Drawer.Title>
            </Drawer.Header>
            <Drawer.Body spaceY="32px">
              <Text
                fontSize="body.md"
                fontStyle="normal"
                fontWeight="400"
                letterSpacing="wide"
              >
                {t("drawer-help-section-description")}
              </Text>
              <Accordion.Root collapsible defaultValue={["gpc_definition"]}>
                {items.map((item) => (
                  <Accordion.Item key={item.value} value={item.value}>
                    <Accordion.ItemTrigger h="52px" px="8px">
                      <Span
                        flex="1"
                        fontSize="title.md"
                        fontFamily="heading"
                        fontStyle="normal"
                        fontWeight="medium"
                        lineHeight="24px"
                      >
                        {item.title}
                      </Span>
                      <Accordion.ItemIndicator>
                        <Icon
                          as={BiChevronDown}
                          color="content.secondary"
                          boxSize={8}
                        />
                      </Accordion.ItemIndicator>
                    </Accordion.ItemTrigger>
                    <Accordion.ItemContent px="8px">
                      <Accordion.ItemBody spaceY="24px">
                        <Text
                          fontSize="body.md"
                          fontStyle="normal"
                          fontWeight="400"
                          letterSpacing="wide"
                        >
                          {item.itemDescription}
                        </Text>
                        <Text
                          fontSize="body.md"
                          fontStyle="normal"
                          fontWeight="400"
                          letterSpacing="wide"
                          textTransform="revert"
                        >
                          {item.subtitle}:
                        </Text>
                        <Box as="ul" listStyleType="disc" pl="24px">
                          {item.bulletPoints.map((bulletPoint) => (
                            <Box as="li" key={bulletPoint}>
                              {bulletPoint}
                            </Box>
                          ))}
                        </Box>
                        <Text
                          fontSize="body.md"
                          fontStyle="normal"
                          fontWeight="400"
                          letterSpacing="wide"
                        >
                          {item.itemSummary ?? ""}
                        </Text>
                        <HStack w="full" spaceX="24px">
                          <Button
                            variant="outline"
                            borderColor="interactive.primary"
                            color="interactive.primary"
                            px="24px"
                            py="16px"
                            onClick={() => {
                              onClose();
                              window.dispatchEvent(
                                new CustomEvent("open-clima-ai", {
                                  detail: { suggestions: item.suggestions },
                                }),
                              );
                            }}
                          >
                            <Icon as={AskAiIconOutline2} h={24} w={24} />
                            {t("ask-ai")}
                          </Button>
                          <Link href={item.learnMoreLink} target="_blank">
                            <Text>{t("learn-more")}</Text>
                            <Icon as={BiLinkExternal} boxSize={4} />
                          </Link>
                        </HStack>
                      </Accordion.ItemBody>
                    </Accordion.ItemContent>
                  </Accordion.Item>
                ))}
              </Accordion.Root>
            </Drawer.Body>
          </Drawer.Content>
        </Drawer.Positioner>
      </Portal>
    </Drawer.Root>
  );
}
