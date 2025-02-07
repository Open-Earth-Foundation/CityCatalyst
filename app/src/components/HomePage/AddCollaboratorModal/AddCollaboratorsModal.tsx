import React, { useState } from "react";
import {
  Box,
  Button,
  Checkbox,
  CheckboxGroup,
  Divider,
  HStack,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  Text,
} from "@chakra-ui/react";
import type { TFunction } from "i18next";
import { MdPersonAdd } from "react-icons/md";
import { TitleLarge } from "@/components/Texts/Title";
import { BodyLarge } from "@/components/Texts/Body";
import { HeadlineSmall } from "@/components/Texts/Headline";
import {
  useGetCitiesAndYearsQuery,
  useInviteUsersMutation,
} from "@/services/api";
import LabelLarge from "@/components/Texts/Label";
import MultipleEmailInput from "./MultipleEmailInput";
import { UseErrorToast, UseSuccessToast } from "@/hooks/Toasts";
import { useTranslation } from "@/i18n/client";

const AddCollaboratorsModal = ({
  lng,
  isOpen,
  onClose,
  onOpen,
}: {
  lng: string;
  isOpen: boolean;
  onClose: () => void;
  onOpen: () => void;
}) => {
  const { t } = useTranslation(lng, "dashboard");

  const { showSuccessToast } = UseSuccessToast({
    title: t("invite-success-toast-title"),
    description: t("invite-success-toast-description"),
    text: t("invite-success-toast-text"),
  });

  const { showErrorToast } = UseErrorToast({
    title: t("invite-error-toast-title"),
    description: t("invite-error-toast-description"),
    text: t("invite-error-toast-text"),
  });

  const { data: citiesAndYears } = useGetCitiesAndYearsQuery();
  const [inviteUsers, { isLoading: isInviteUsersLoading }] =
    useInviteUsersMutation();
  const [emails, setEmails] = useState<string[]>([]);
  const [selectedCities, setSelectedCities] = useState<string[]>([]);

  const handleCityChange = (city: string) => {
    setSelectedCities((prevSelectedCities) =>
      prevSelectedCities.includes(city)
        ? prevSelectedCities.filter((c) => c !== city)
        : [...prevSelectedCities, city],
    );
  };

  const onSendInvitesClick = async (): Promise<void> => {
    const { data, error } = await inviteUsers({
      cityIds: selectedCities,
      emails,
    });
    if (data?.success && !error) {
      showSuccessToast();
      setEmails([]);
      setSelectedCities([]);
      onClose();
    } else {
      showErrorToast();
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <ModalOverlay />
      <ModalContent maxW="container.md">
        <ModalHeader>
          <HStack>
            <MdPersonAdd fontSize={"32px"} />
            <HeadlineSmall text={t("invite-your-colleagues")} />
          </HStack>
        </ModalHeader>
        <ModalCloseButton />
        <Divider my="24px" />
        <ModalBody>
          <TitleLarge text={t("select-cities-to-share")} />
          <BodyLarge text={t("select-cities-to-share-description")} />
          <CheckboxGroup>
            {citiesAndYears?.map(({ city }) => (
              <Checkbox
                key={city.cityId}
                my={"24px"}
                mx={"32px"}
                isChecked={selectedCities.includes(city.cityId)}
                onChange={() => handleCityChange(city.cityId)}
              >
                {city.name}
              </Checkbox>
            ))}
          </CheckboxGroup>
          <TitleLarge text={t("send-invites")} mt={"48px"} />
          <Text>
            {t("send-invites-description-1")}
            <Text as="span" fontWeight="bold">
              {t("send-invites-description-2")}
            </Text>
            {t("send-invites-description-3")}
          </Text>
          <LabelLarge text={t("email")} mt={"24px"} />
          <MultipleEmailInput t={t} emails={emails} setEmails={setEmails} />
          <Divider my="24px" />
          <ModalFooter>
            <Box>
              <Button
                isDisabled={
                  emails.length === 0 ||
                  selectedCities.length === 0 ||
                  isInviteUsersLoading
                }
                colorScheme="blue"
                onClick={() => onSendInvitesClick()}
              >
                {t("send-invites")}
              </Button>
            </Box>
          </ModalFooter>
        </ModalBody>
      </ModalContent>
    </Modal>
  );
};

export default AddCollaboratorsModal;
