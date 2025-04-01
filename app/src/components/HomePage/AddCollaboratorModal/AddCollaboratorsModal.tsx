import React, { useState, useMemo, useEffect } from "react";
import {
  Box,
  Button,
  CheckboxGroup,
  createListCollection,
  HStack,
  Icon,
  NativeSelectRoot,
  ProgressCircle,
  Separator,
  Text,
} from "@chakra-ui/react";
import { MdInfoOutline, MdPersonAdd } from "react-icons/md";
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
import {
  SelectContent,
  SelectItem,
  SelectItemGroup,
  SelectLabel,
  SelectRoot,
  SelectTrigger,
  SelectValueText,
} from "@/components/ui/select";

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
      organizationId: organizationId as string,
    },
    {
      skip: !isAdmin || !organizationId,
    },
  );

  const projectCollection = useMemo(() => {
    return createListCollection({
      items:
        projectsData?.map((project) => ({
          label: project.name,
          value: project.projectId,
        })) ?? [],
    });
  }, [projectsData]);

  const { data: citiesAndYears } = useGetCitiesAndYearsQuery(undefined, {
    skip: isAdmin,
  });
  const [inviteUsers, { isLoading: isInviteUsersLoading }] =
    useInviteUsersMutation();
  const [emails, setEmails] = useState<string[]>([]);
  const [selectedCities, setSelectedCities] = useState<string[]>([]);
  const [selectedProject, setSelectedProject] = useState<string[]>([]);

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
    setSelectedProject([]);
    onClose();
  };

  const cityData = useMemo<
    {
      cityId: string;
      name: string;
    }[]
  >(() => {
    if (!isAdmin) {
      return (
        citiesAndYears?.map(({ city }) => ({
          cityId: city.cityId,
          name: city.name as string,
        })) ?? []
      );
    }
    if (!selectedProject || selectedProject.length === 0) return [];

    const project = projectsData?.find(
      (project) => project.projectId === selectedProject[0],
    );
    return (
      project?.cities.map((city) => ({
        cityId: city.cityId,
        name: city.name,
      })) ?? []
    );
  }, [isAdmin, citiesAndYears, projectsData, selectedProject]);

  return (
    <DialogRoot
      open={isOpen}
      onOpenChange={closeFunction}
      onExitComplete={onClose}
    >
      <DialogContent minH="300px" minW="600px" marginTop="2%" p={0}>
        <DialogHeader
          display="flex"
          justifyContent="start"
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
          <HStack>
            <MdPersonAdd fontSize={"32px"} />
            <HeadlineSmall text={t("invite-your-colleagues")} />
          </HStack>
        </DialogHeader>
        <DialogCloseTrigger mt={"2"} color="interactive.control" mr={"2"} />
        <DialogBody p={0}>
          <Box paddingX={6} mt={6}>
            <TitleLarge color="content.tertiary">
              {t("send-invites")}
            </TitleLarge>
            <Text color="content.tertiary">
              {t("send-invites-description-1")}
              <Text as="span" fontWeight="bold">
                {t("send-invites-description-2")}
              </Text>
              {t("send-invites-description-3")}
            </Text>
            <LabelLarge text={t("email")} mt={3} />
            <MultipleEmailInput t={t} emails={emails} setEmails={setEmails} />
          </Box>
          {isAdmin && (
            <Box
              display="flex"
              paddingX={6}
              mt={6}
              flexDirection="column"
              gap={3}
              mb={10}
            >
              <TitleLarge color="content.tertiary">
                {t("project-to-share")}
              </TitleLarge>
              {isLoading ? (
                <ProgressCircle.Root value={null} size="sm">
                  <ProgressCircle.Circle>
                    <ProgressCircle.Track />
                    <ProgressCircle.Range />
                  </ProgressCircle.Circle>
                </ProgressCircle.Root>
              ) : (
                <SelectRoot
                  value={selectedProject}
                  onValueChange={(e) => setSelectedProject(e.value)}
                  variant="subtle"
                  collection={projectCollection}
                >
                  <SelectLabel display="flex" alignItems="center" gap="8px">
                    <Text fontFamily="heading" color="content.secondary">
                      {t("project")}
                    </Text>
                  </SelectLabel>
                  <SelectTrigger>
                    <SelectValueText
                      color="content.tertiary"
                      fontWeight="medium"
                      placeholder={t("select-project")}
                    />
                  </SelectTrigger>
                  <SelectContent portalled={false}>
                    {projectCollection?.items.map((project) => (
                      <SelectItem key={project.value} item={project.value}>
                        {project.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </SelectRoot>
              )}
            </Box>
          )}
          {isAdmin && !(selectedProject.length > 0) ? null : (
            <Box paddingX={6}>
              <TitleLarge color="content.tertiary">
                {t("select-cities-to-share")}
              </TitleLarge>
              <BodyLarge>{t("select-cities-to-share-description")}</BodyLarge>
              {cityData?.length === 0 && (
                <Text fontSize="body.md" mt={3} color="content.tertiary">
                  {isAdmin && !selectedProject
                    ? t("select-project")
                    : t("no-cities-available")}
                </Text>
              )}
              <CheckboxGroup my="24px">
                <Box
                  display="grid"
                  gridTemplateColumns={{
                    base: "1fr",
                    sm: "repeat(2, 1fr)",
                    md: "repeat(3, 1fr)",
                  }}
                  gap={4}
                >
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
                </Box>
              </CheckboxGroup>
            </Box>
          )}
          <DialogFooter
            paddingX={6}
            paddingY={6}
            borderTop="2px"
            borderColor="background.neutral"
            borderStyle="solid"
          >
            <Box>
              <Button
                disabled={
                  emails.length === 0 ||
                  selectedCities.length === 0 ||
                  isInviteUsersLoading
                }
                loading={isInviteUsersLoading}
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
