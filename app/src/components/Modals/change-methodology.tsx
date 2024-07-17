"use client";

import { UserDetails } from "@/app/[lng]/[inventory]/settings/page";
import {
  Modal,
  Button,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalHeader,
  ModalOverlay,
  Text,
  Box,
  Badge,
  useToast,
  ModalFooter,
  Icon,
} from "@chakra-ui/react";
import React, { FC, useState } from "react";

import { FiTrash2 } from "react-icons/fi";
import PasswordInput from "../password-input";
import { SubmitHandler, useForm } from "react-hook-form";
import { useTranslation } from "@/i18n/client";
import { TFunction } from "i18next";
import { InfoIcon, InfoOutlineIcon } from "@chakra-ui/icons";
import { UserAttributes } from "@/models/User";
import { api } from "@/services/api";
import { CityAttributes } from "@/models/City";
import { MdCheckCircleOutline } from "react-icons/md";
import { ChangeMethodologyIcon } from "../icons";
import { Trans } from "react-i18next";

interface ChangeMethodologyProps {
  isOpen: boolean;
  onClose: () => void;
  onChangeClicked: () => void;
  t: TFunction;
}

const ChangeMethodology: FC<ChangeMethodologyProps> = ({
  isOpen,
  onClose,
  onChangeClicked,
  t,
}) => {
  return (
    <>
      <Modal blockScrollOnMount={false} isOpen={isOpen} onClose={onClose}>
        <ModalOverlay />
        <ModalContent minH="350px" minW="568px" marginTop="2%">
          <ModalHeader
            display="flex"
            justifyContent="center"
            fontWeight="semibold"
            fontSize="headline.sm"
            lineHeight="32"
            padding="24px"
            fontFamily="heading"
            borderBottomWidth="1px"
            borderStyle="solid"
            borderColor="border.neutral"
          >
            {t("change-methodology")}
          </ModalHeader>
          <ModalCloseButton marginTop="10px" />
          <ModalBody paddingTop="24px" paddingBottom="48px">
            <Box
              h="full"
              w="full"
              display="flex"
              alignItems="center"
              justifyContent="center"
              flexDirection="column"
              gap="48px"
            >
              <Box
                h="68px"
                w="68px"
                bg="background.neutral"
                display="flex"
                alignItems="center"
                justifyContent="center"
                borderRadius="full"
              >
                <Icon as={ChangeMethodologyIcon} color="content.link" />
              </Box>
              <Text textAlign="center">
                <Trans t={t} i18nKey={"change-methodology-description-text"}>
                  Please be aware that{" "}
                  <Text as="span" fontWeight="bold">
                    changing methodology may impact your existing inventory
                    data.
                  </Text>{" "}
                  Are you sure you want to proceed with changing your
                  methodology?
                </Trans>
              </Text>
            </Box>
          </ModalBody>
          <ModalFooter
            borderTopWidth="1px"
            borderStyle="solid"
            borderColor="border.neutral"
            w="full"
            display="flex"
            alignItems="center"
            p="24px"
            justifyContent="center"
          >
            <Button
              h="56px"
              w="472px"
              paddingTop="16px"
              paddingBottom="16px"
              px="24px"
              bg="interactive.secondary"
              letterSpacing="widest"
              textTransform="uppercase"
              fontWeight="semibold"
              fontSize="button.md"
              type="submit"
              p={0}
              m={0}
              onClick={onChangeClicked}
            >
              {t("change-methodology")}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </>
  );
};

export default ChangeMethodology;
