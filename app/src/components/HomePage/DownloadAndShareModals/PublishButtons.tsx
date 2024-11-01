import type { TFunction } from "i18next";
import { Badge, Button, HStack, Text, VStack } from "@chakra-ui/react";
import { Img } from "@react-email/components";
import { ChevronRightIcon } from "@chakra-ui/icons";
import React from "react";

const PublishButtons = ({
  t,
  onClose,
  onPublishOpen,
}: {
  t: TFunction;
  onClose: () => void;
  onPublishOpen: () => void;
}) => {
  const openPublishModal = () => {
    onClose();
    onPublishOpen();
  };
  const PUBLISH_BUTTONS = [
    {
      title: `update-to-cdp`,
      src: "/assets/cdp_logo.png",
      isAvailable: false,
    },
    {
      title: "publish-to-web",
      src: "/assets/publish.svg",
      isAvailable: true,
      onClick: openPublishModal,
    },
  ];
  return (
    <>
      {PUBLISH_BUTTONS.map(({ title, src, isAvailable, onClick }) => (
        <Button
          key={title}
          my="24px"
          mx="24px"
          variant="ghost"
          leftIcon={<Img src={src} alt={title} width="32px" height="32px" />}
          rightIcon={<ChevronRightIcon width="24px" height="24px" mx="16px" />}
          isDisabled={!isAvailable}
          style={{
            backgroundColor: "white",
            color: "black",
            opacity: isAvailable ? 1 : 0.5,
          }}
          textTransform="none"
          justifyContent="flex-start"
          w="full"
          onClick={onClick}
        >
          <VStack align="flex-start" w="full" mx="16px">
            <HStack w="full" justify="flex-start">
              <Text
                fontSize="body.lg"
                color="black"
                opacity={isAvailable ? 1 : 0.5}
              >
                {t(title)}
              </Text>
              {!isAvailable && (
                <Badge
                  mx="16px"
                  borderWidth="1px"
                  borderColor="border.neutral"
                  py="4px"
                  px="8px"
                  borderRadius="full"
                  textColor="content.secondary"
                  fontSize="body.sm"
                  bg="base.light"
                >
                  <Text>{t("coming-soon")}</Text>
                </Badge>
              )}
            </HStack>
            <Text
              fontSize="body.md"
              color="black.400"
              style={{
                whiteSpace: "normal",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
              align="left"
            >
              {t(`${title}-description`)}
            </Text>
          </VStack>
        </Button>
      ))}
    </>
  );
};

export default PublishButtons;
