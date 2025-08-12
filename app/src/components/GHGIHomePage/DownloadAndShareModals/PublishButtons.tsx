import type { TFunction } from "i18next";
import {
  Badge,
  Button,
  HStack,
  Text,
  VStack,
  Image,
  Icon,
} from "@chakra-ui/react";
import React from "react";
import { BsChevronRight } from "react-icons/bs";

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
          my="16px"
          variant="ghost"
          disabled={!isAvailable}
          minHeight="100px"
          py={4}
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
          <Image src={src} alt={title} width="32px" height="32px" />
          <VStack align="flex-start" w="full" ml="12px">
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
                  ml="8px"
                  borderWidth="1px"
                  borderColor="border.neutral"
                  py="4px"
                  px="8px"
                  borderRadius="16px"
                  color="content.secondary"
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
              textAlign="left"
            >
              {t(`${title}-description`)}
            </Text>
          </VStack>
          <Icon as={BsChevronRight} width="24px" height="24px" mr="16px" />
        </Button>
      ))}
    </>
  );
};

export default PublishButtons;
