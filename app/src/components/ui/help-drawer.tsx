"use client";

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
import { CloseButton } from "@/components/ui/close-button";
import { BiChevronDown, BiLinkExternal } from "react-icons/bi";
import { AskAiIconOutline2 } from "@/components/icons";

export interface HelpDrawerChatSuggestion {
  preview: string;
  message: string;
}

export interface HelpDrawerItem {
  value: string;
  title: string;
  itemDescription?: string;
  subtitle?: string;
  bulletPoints?: string[];
  itemSummary?: string;
  learnMoreLink?: string;
  suggestions?: HelpDrawerChatSuggestion[];
}

export interface HelpDrawerProps {
  triggerLabel: string;
  title: string;
  description: string;
  items: HelpDrawerItem[];
  askAiLabel: string;
  learnMoreLabel: string;
  defaultOpenValue?: string;
}

export function HelpDrawer({
  triggerLabel,
  title,
  description,
  items,
  askAiLabel,
  learnMoreLabel,
  defaultOpenValue,
}: HelpDrawerProps) {
  const { open, onOpen, onClose } = useDisclosure();

  return (
    <Drawer.Root
      size="sm"
      open={open}
      onOpenChange={(e) => (e.open ? onOpen() : onClose())}
    >
      <Drawer.Trigger asChild>
        <Button variant="outline" onClick={onOpen}>
          {triggerLabel}
        </Button>
      </Drawer.Trigger>
      <Portal>
        <Drawer.Positioner>
          <Drawer.Content>
            <Drawer.Header
              display="flex"
              alignItems="center"
              justifyContent="space-between"
              gap="16px"
            >
              <Drawer.Title
                fontFamily="heading"
                fontSize="title.lg"
                fontStyle="normal"
                fontWeight="semibold"
              >
                {title}
              </Drawer.Title>
              <Drawer.CloseTrigger asChild>
                <CloseButton size="sm" color="content.secondary" />
              </Drawer.CloseTrigger>
            </Drawer.Header>
            <Drawer.Body spaceY="32px">
              <Text
                fontSize="body.md"
                fontStyle="normal"
                fontWeight="400"
                letterSpacing="wide"
              >
                {description}
              </Text>
              <Accordion.Root
                collapsible
                defaultValue={defaultOpenValue ? [defaultOpenValue] : []}
              >
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
                        {item.itemDescription && (
                          <Text
                            fontSize="body.md"
                            fontStyle="normal"
                            fontWeight="400"
                            letterSpacing="wide"
                          >
                            {item.itemDescription}
                          </Text>
                        )}
                        {item.subtitle && (
                          <Text
                            fontSize="body.md"
                            fontStyle="normal"
                            fontWeight="400"
                            letterSpacing="wide"
                            textTransform="revert"
                          >
                            {item.subtitle}:
                          </Text>
                        )}
                        {item.bulletPoints && item.bulletPoints.length > 0 && (
                          <Box as="ul" listStyleType="disc" pl="24px">
                            {item.bulletPoints.map((bulletPoint) => (
                              <Box as="li" key={bulletPoint}>
                                {bulletPoint}
                              </Box>
                            ))}
                          </Box>
                        )}
                        {item.itemSummary && (
                          <Text
                            fontSize="body.md"
                            fontStyle="normal"
                            fontWeight="400"
                            letterSpacing="wide"
                          >
                            {item.itemSummary}
                          </Text>
                        )}
                        {(item.suggestions?.length || item.learnMoreLink) && (
                          <HStack w="full" spaceX="24px">
                            {item.suggestions &&
                              item.suggestions.length > 0 && (
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
                                        detail: {
                                          suggestions: item.suggestions,
                                        },
                                      }),
                                    );
                                  }}
                                >
                                  <Icon as={AskAiIconOutline2} h={24} w={24} />
                                  {askAiLabel}
                                </Button>
                              )}
                            {item.learnMoreLink && (
                              <Link href={item.learnMoreLink} target="_blank">
                                <Text>{learnMoreLabel}</Text>
                                <Icon as={BiLinkExternal} boxSize={4} />
                              </Link>
                            )}
                          </HStack>
                        )}
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
