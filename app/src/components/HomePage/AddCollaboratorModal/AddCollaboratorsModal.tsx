import React, { useState, useMemo } from "react";
import {
  Box,
  Button,
  CheckboxGroup,
  HStack,
  NativeSelectRoot,
  Separator,
  Text,
} from "@chakra-ui/react";
import { MdPersonAdd } from "react-icons/md";
import { TitleLarge } from "@/components/Texts/Title";
import { BodyLarge } from "@/components/Texts/Body";
import { HeadlineSmall } from "@/components/Texts/Headline";
import {
  useGetCitiesAndYearsQuery,
  useGetProjectsQuery,
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
import { NativeSelectField } from "@/components/ui/native-select";

const AddCollaboratorsDialog = ({
  lng,
  isOpen,
  onClose,
  onOpen,
  organizationId,
  isAdmin,
}: {
  lng: string;
  isOpen: boolean;
  onClose: () => void;
  onOpen?: () => void;
  organizationId?: string;
  isAdmin?: boolean;
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

  const { data: projectsData, isLoading } = useGetProjectsQuery(
    {
      organizationId,
    },
    {
      skip: !isAdmin || !organizationId,
    },
  );

  const { data: citiesAndYears } = useGetCitiesAndYearsQuery(
    {},
    {
      skip: isAdmin,
    },
  );
  const [inviteUsers, { isLoading: isInviteUsersLoading }] =
    useInviteUsersMutation();
  const [emails, setEmails] = useState<string[]>([]);
  const [selectedCities, setSelectedCities] = useState<string[]>([]);
  const [selectedProject, setSelectedProject] = useState<string | null>();

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

  const closeFunction = () => {
    setEmails([]);
    setSelectedCities([]);
    setSelectedProject("");
    onClose();
  };

  const cityData = useMemo<
    {
      cityId: string;
      name: string;
    }[]
  >(() => {
    if (!isAdmin) {
      return citiesAndYears?.map(({ city }) => ({
        cityId: city.cityId,
        name: city.name,
      }));
    }
    if (!selectedProject) return [];

    const project = projectsData?.find(
      (project) => project.projectId === selectedProject,
    );
    console.log("selectedProject", selectedProject, project, "got here");
    return project?.cities.map((city) => ({
      cityId: city.cityId,
      name: city.name,
    }));
  }, [isAdmin, citiesAndYears, projectsData, selectedProject]);

  return (
    <DialogRoot
      open={isOpen}
      onOpenChange={closeFunction}
      onExitComplete={onClose}
    >
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
          {isAdmin && (
            <Box display="flex" flexDirection="column" gap={3} mb={10}>
              <TitleLarge>{t("project")}</TitleLarge>
              <BodyLarge>
                {t("select-project-to-invite-collaborators")}
              </BodyLarge>
              <NativeSelectRoot
                shadow="1dp"
                borderRadius="4px"
                border="inputBox"
                fontSize="body.lg"
                loading={isLoading}
                h="full"
                w="full"
                _focus={{
                  borderWidth: "1px",
                  borderColor: "content.link",
                  shadow: "none",
                }}
              >
                <NativeSelectField
                  placeholder={t("select-project")}
                  onChange={(e) => {
                    console.log("the e clicked", e.currentTarget.value);
                    setSelectedProject(e.currentTarget.value);
                  }}
                  value={selectedProject}
                  items={projectsData.map((project) => ({
                    label: project.name,
                    value: project.projectId,
                  }))}
                />
              </NativeSelectRoot>
            </Box>
          )}
          <Box>
            <TitleLarge>{t("select-cities-to-share")}</TitleLarge>
            <BodyLarge>{t("select-cities-to-share-description")}</BodyLarge>
            {cityData?.length === 0 && (
              <Text fontSize="body.md" mt={3} color="content.tertiary">
                {isAdmin && !selectedProject
                  ? t("select-project")
                  : t("no-cities-available")}
              </Text>
            )}
            <CheckboxGroup unstyled my={"24px"} mx={"32px"}>
              <HStack width="100%" flexWrap="wrap">
                {cityData?.map(({ cityId, name }) => (
                  <Checkbox
                    key={cityId}
                    checked={selectedCities.includes(cityId)}
                    onChange={() => handleCityChange(cityId)}
                  >
                    <Text fontWeight="semibold" fontSize="body.lg">
                      {name}
                    </Text>
                  </Checkbox>
                ))}
              </HStack>
            </CheckboxGroup>
          </Box>
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
