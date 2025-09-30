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
                  title="Ask AI Anything"
                  description="To unlock the full potential of Clima AI, make your questions clear and specific"
                />
                <DialogItem
                  icon={<VerifyKeyInformationIcon />}
                  title="Verify key information"
                  description="Clima AI can help you with your GHG emissions inventory and provide support, but always double-check critical information."
                />
                <DialogItem
                  icon={<AboutPrivacyIcon />}
                  title="About your privacy"
                  description={
                    <>
                      By using Clima AI, you agree to the anonymous storage and
                      analysis of your conversation data to improve the AI's
                      accuracy and efficiency.{" "}
                      <Text as="span" fontWeight="bold">
                        No personal data is published or used beyond model
                        training.
                      </Text>{" "}
                      For privacy concerns, please{" "}
                      <Link
                        color="content.link"
                        textDecoration="underline"
                        fontWeight="bold"
                      >
                        contact support
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
