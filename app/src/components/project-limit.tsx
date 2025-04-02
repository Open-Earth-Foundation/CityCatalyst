import {
  DialogBackdrop,
  DialogCloseTrigger,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogRoot,
} from "@/components/ui/dialog";
import { HStack, Link, Text } from "@chakra-ui/react";
import { Button } from "@/components/ui/button";
import React from "react";
import { TFunction } from "i18next";
import { Trans } from "react-i18next/TransWithoutContext";

interface ProjectLimitModalProps {
  t: TFunction;
  onOpenChange: (val: boolean) => void;
  isOpen: boolean;
  onClose: () => void;
}

const ProjectLimitModal = ({
  t,
  onOpenChange,
  isOpen,
  onClose,
}: ProjectLimitModalProps) => {
  const closeFunction = () => {
    onClose();
  };

  return (
    <DialogRoot
      preventScroll
      open={isOpen}
      onOpenChange={(e: any) => {
        onOpenChange(e.open);
      }}
      onExitComplete={closeFunction}
    >
      <DialogBackdrop />
      <DialogContent minH="300px" minW="600px" marginTop="2%">
        <DialogHeader
          display="flex"
          justifyContent="center"
          fontWeight="semibold"
          fontSize="headline.sm"
          fontFamily="heading"
          lineHeight="32"
          color="base.dark"
          padding="24px"
          borderBottomWidth="2px"
          borderStyle="solid"
          borderColor="background.neutral"
        >
          {t("upgrade-plan-city-limit-heading")}
        </DialogHeader>
        <DialogCloseTrigger mt={"2"} color="interactive.control" mr={"2"} />
        <HStack flexDirection="column" alignItems="center" padding="24px">
          <Text
            w="full"
            maxW="600px"
            fontSize="body.lg"
            textAlign="center"
            mt={2}
            fontWeight="normal"
            color="content.tertiary"
          >
            <Trans
              i18nKey={t("upgrade-plan-city-limit-text")}
              t={t}
              components={{
                bold: <strong />,
                mail: (
                  <Link color="content.link" href="mailto:info@openearth.org" />
                ),
              }}
            />
          </Text>
        </HStack>
        <DialogFooter
          paddingX={6}
          paddingY={6}
          borderTop="2px"
          borderColor="background.neutral"
          borderStyle="solid"
        >
          <Button
            variant="outline"
            h="64px"
            onClick={onClose}
            minW="200px"
            colorScheme="blue"
            marginRight="2"
          >
            {t("cancel")}
          </Button>
          <Button
            variant="solid"
            h="64px"
            minW="200px"
            colorScheme="blue"
            onClick={onClose}
            backgroundColor="sentiment"
            marginRight="2"
          >
            {t("ok")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </DialogRoot>
  );
};

export default ProjectLimitModal;
