import {
  DialogBackdrop,
  DialogCloseTrigger,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogRoot,
} from "@/components/ui/dialog";
import { Badge, Box, HStack, Text } from "@chakra-ui/react";
import { Trans } from "react-i18next";
import { Button } from "@/components/ui/button";
import React from "react";
import { useParams } from "next/navigation";
import { useTranslation } from "@/i18n/client";
import { TbInfoTriangle } from "react-icons/tb";

interface AccountFrozenWarningModalProps {
  isOpen: boolean;
  onOpenChange: (val: boolean) => void;
  closeFunction: () => void;
}

const AccountFrozenWarningModal = ({
  isOpen,
  onOpenChange,
  closeFunction,
}: AccountFrozenWarningModalProps) => {
  const { lng } = useParams();
  const { t } = useTranslation(lng as string, "dashboard");

  return (
    <DialogRoot
      preventScroll
      open={isOpen}
      onOpenChange={(e: any) => {
        onOpenChange(e.open);
        if (!e.open) {
          closeFunction();
        }
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
          {t("account-frozen-header")}
        </DialogHeader>
        <DialogCloseTrigger mt={"2"} color="interactive.control" mr={"2"} />
        <HStack flexDirection="column" alignItems="center" padding="24px">
          <Badge
            color="sentiment.warningDefault"
            h="68px"
            w="68px"
            display="flex"
            alignItems="center"
            justifyContent="center"
            borderRadius="full"
            background="sentiment.warningOverlay"
          >
            <TbInfoTriangle size={36} />
          </Badge>
          <Box w="70%" mt={6}>
            <Text fontSize="body.lg" textAlign="center">
              <Trans
                i18nKey="account-frozen-warning-text"
                values={{
                  email:
                    process.env.NEXT_PUBLIC_SUPPORT_EMAILS?.split(",").join(
                      " or ",
                    ) || "info@openearth.org",
                }}
                t={t}
                components={{
                  bold: <strong />,
                }}
              />
            </Text>
          </Box>
        </HStack>
        <DialogFooter
          paddingX={6}
          paddingY={6}
          borderTop="2px"
          borderColor="background.neutral"
          borderStyle="solid"
        >
          <Button
            variant="solid"
            h="64px"
            w="full"
            onClick={closeFunction}
            color="base.light"
            marginRight="2"
          >
            {t("yes-i-understand")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </DialogRoot>
  );
};

export default AccountFrozenWarningModal;
