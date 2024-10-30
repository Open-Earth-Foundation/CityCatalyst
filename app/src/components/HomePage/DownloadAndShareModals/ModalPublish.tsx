import {
  Box,
  Button,
  Divider,
  HStack,
  Img,
  Modal,
  ModalCloseButton,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  Text,
} from "@chakra-ui/react";
import type { TFunction } from "i18next";
import { api } from "@/services/api";
import { useState } from "react";
import { UnpublishedView } from "@/components/HomePage/DownloadAndShareModals/UnpublishedView";
import { PublishedView } from "@/components/HomePage/DownloadAndShareModals/PublishedView";
import { InventoryResponse } from "@/util/types";

const ModalPublish = ({
  t,
  isPublishOpen,
  onPublishClose,
  inventoryId,
  inventory,
}: {
  t: TFunction;
  isPublishOpen: boolean;
  onPublishClose: () => void;
  inventoryId: string;
  inventory: InventoryResponse;
}) => {
  const [isAuthorized, setIsAuthorized] = useState<boolean>(false);

  const [changePublishStatus, { isLoading: updateLoading }] =
    api.useUpdateInventoryMutation();
  const handlePublishChange = () => {
    return changePublishStatus({
      inventoryId: inventoryId!,
      data: { isPublic: !inventory.isPublic },
    });
  };

  return (
    <Modal isOpen={isPublishOpen} onClose={onPublishClose}>
      <ModalOverlay />
      <ModalContent maxW="container.md">
        <ModalHeader>
          <HStack>
            <Img
              src="/assets/publish.svg"
              alt="publish-to-web"
              width="24px"
              height="24px"
            />
            <Text fontSize="headline.sm" mx="8px">
              {t("publish-to-web")}
            </Text>
          </HStack>
        </ModalHeader>
        <ModalCloseButton />
        <Divider my="24px" />
        {!inventory.isPublic ? (
          <UnpublishedView
            t={t}
            checked={isAuthorized}
            onAuthorizeChange={() =>
              setIsAuthorized((isAuth: boolean) => !isAuth)
            }
          />
        ) : (
          <PublishedView
            t={t}
            inventoryId={inventoryId}
            inventory={inventory}
          />
        )}
        <ModalFooter>
          <Box>
            <Button
              isDisabled={!inventory.isPublic && !isAuthorized}
              colorScheme="blue"
              mr={3}
              onClick={handlePublishChange}
            >
              {inventory.isPublic ? t("unpublish") : t("publish-to-web")}
            </Button>
          </Box>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};

export default ModalPublish;
