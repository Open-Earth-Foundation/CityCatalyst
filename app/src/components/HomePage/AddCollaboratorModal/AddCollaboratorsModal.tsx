import React, { useState } from "react";
import {
  Box,
  Button,
  CheckboxGroup,
  HStack,
  Separator,
  Text,
} from "@chakra-ui/react";
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
import {
  DialogBody,
  DialogCloseTrigger,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogRoot,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";

const AddCollaboratorsDialog = ({
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
  });

  const { showErrorToast } = UseErrorToast({
    title: t("invite-error-toast-title"),
    description: t("invite-error-toast-description"),
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
    <DialogRoot open={isOpen} onOpenChange={onClose} onExitComplete={onClose}>
      <DialogContent maxW="container.md">
        <DialogHeader>
          <HStack>
            <MdPersonAdd fontSize={"32px"} />
            <HeadlineSmall text={t("invite-your-colleagues")} />
          </HStack>
        </DialogHeader>
        <DialogCloseTrigger />
        <Separator my="24px" />
        <DialogBody>
          <TitleLarge>{t("select-cities-to-share")}</TitleLarge>
          <BodyLarge>{t("select-cities-to-share-description")}</BodyLarge>
          <CheckboxGroup unstyled my={"24px"} mx={"32px"}>
            <HStack width="100%" flexWrap="wrap">
              {citiesAndYears?.map(({ city }) => (
                <Checkbox
                  key={city.cityId}
                  checked={selectedCities.includes(city.cityId)}
                  onChange={() => handleCityChange(city.cityId)}
                >
                  <Text fontWeight="semibold" fontSize="body.lg">
                    {city.name}
                  </Text>
                </Checkbox>
              ))}
            </HStack>
          </CheckboxGroup>
          <TitleLarge mt={"48px"}>{t("send-invites")}</TitleLarge>
          <Text>
            {t("send-invites-description-1")}
            <Text as="span" fontWeight="bold">
              {t("send-invites-description-2")}
            </Text>
            {t("send-invites-description-3")}
          </Text>
          <LabelLarge text={t("email")} mt={"24px"} />
          <MultipleEmailInput t={t} emails={emails} setEmails={setEmails} />
          <Separator my="24px" />
          <DialogFooter>
            <Box>
              <Button
                disabled={
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
          </DialogFooter>
        </DialogBody>
      </DialogContent>
    </DialogRoot>
  );
};

export default AddCollaboratorsDialog;
