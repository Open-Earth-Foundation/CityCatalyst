import {
  CloseButton,
  Button,
  Dialog,
  DialogTrigger,
  Portal,
  VStack,
  HStack,
  Box,
  Icon,
  Flex,
  Text,
  Link,
} from "@chakra-ui/react";
import { TFunction } from "i18next";
import { useState } from "react";
import {
  AskAiIconOutline,
  VerifyKeyInformationIcon,
  AboutPrivacyIcon,
} from "../icons";
import DialogItem from "./DialogItem";

export default function ClimaAIAssistantDisclaimerDialog({
  t,
  open,
  onOpenChange,
  onAccept,
}: {
  t: TFunction;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAccept: () => void;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={(e) => onOpenChange(e.open)}>
      <Portal>
        <Dialog.Backdrop />
        <Dialog.Positioner>
          <Dialog.Content minH="500px" minW="727px" marginTop="20%" px="24px">
            <Dialog.Header
              w="full"
              borderBottomWidth="1px"
              borderStyle="solid"
              borderColor="border.neutral"
            >
              <Dialog.Title
                display="flex"
                justifyContent="center"
                fontFamily="heading"
                fontWeight="bold"
                fontSize="headline.sm"
                w="full"
              >
                {t("clima-ai-assistant-disclaimer-title")}
              </Dialog.Title>
            </Dialog.Header>
            <Dialog.Body py="24px">
              <VStack py="24px" gap="32px">
                {/* Dialog component items */}
                <DialogItem
                  icon={<AskAiIconOutline />}
                  title={t("ask-ai-anything-title")}
                  description={t("ask-ai-anything-description")}
                />
                <DialogItem
                  icon={<VerifyKeyInformationIcon />}
                  title={t("verify-key-information-title")}
                  description={t("verify-key-information-description")}
                />
                <DialogItem
                  icon={<AboutPrivacyIcon />}
                  title={t("about-privacy-title")}
                  description={
                    <>
                      {t("about-privacy-description")}{" "}
                      <Text as="span" fontWeight="bold">
                        {t("about-privacy-bold")}
                      </Text>{" "}
                      {t("about-privacy-contact")}{" "}
                      <Link
                        color="content.link"
                        textDecoration="underline"
                        fontWeight="bold"
                      >
                        {t("contact-support")}
                      </Link>
                      .
                    </>
                  }
                />
              </VStack>
            </Dialog.Body>
            <Dialog.Footer>
              <Dialog.ActionTrigger asChild>
                <Button
                  variant="ghost"
                  color="content.link"
                  onClick={() => onOpenChange(false)}
                >
                  {t("cancel")}
                </Button>
              </Dialog.ActionTrigger>
              <Button py="32px" bg="interactive.secondary" onClick={onAccept}>
                {t("start-using-clima-ai")}
              </Button>
            </Dialog.Footer>
            <Dialog.CloseTrigger asChild>
              <CloseButton size="sm" />
            </Dialog.CloseTrigger>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
}
