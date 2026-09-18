"use client";

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useState,
  useMemo,
} from "react";
import {
  Box,
  Checkbox as ChakraCheckbox,
  CheckboxGroup,
  CloseButton,
  createListCollection,
  Flex,
  Heading,
  HStack,
  Icon,
  Input,
  Separator,
  Text,
} from "@chakra-ui/react";
import {
  SelectContent,
  SelectItem,
  SelectRoot,
  SelectTrigger,
  SelectValueText,
} from "@/components/ui/select";
import {
  MenuContent,
  MenuItem,
  MenuRoot,
  MenuTrigger,
} from "@/components/ui/menu";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { MdArrowDropDown, MdInfoOutline } from "react-icons/md";
import { useTranslation } from "@/i18n/client";
import {
  useGetUserProjectsQuery,
  useGetUserAccessStatusQuery,
  useInviteUsersMutation,
} from "@/services/api";
import { z } from "zod";
import { copyInviteUrlsToClipboard } from "@/util/copy-invite-urls";
import { InfoOutlineIcon } from "@/components/icons";

const ROLES = ["collaborator", "admin"] as const;

interface InvitedMember {
  email: string;
  role: "admin" | "collaborator";
}

export interface InviteCollaboratorsStepRef {
  sendInvites: () => Promise<{
    inviteUrls?: Record<string, string>;
  } | void>;
}

const InviteCollaboratorsStep = forwardRef<
  InviteCollaboratorsStepRef,
  {
    lng: string;
    onValidityChange?: (canSubmit: boolean) => void;
    createdProjectId?: string | null;
  }
>(({ lng, onValidityChange, createdProjectId }, ref) => {
  const { t } = useTranslation(lng, "onboarding");
  const { t: tSettings } = useTranslation(lng, "settings");
  const [emailInput, setEmailInput] = useState("");
  const [emailError, setEmailError] = useState("");
  const [selectedRole, setSelectedRole] = useState<"admin" | "collaborator">(
    "collaborator",
  );
  const [invitedMembers, setInvitedMembers] = useState<InvitedMember[]>([]);
  const [selectedProject, setSelectedProject] = useState<string[]>([]);
  const [selectedCities, setSelectedCities] = useState<string[]>([]);

  const { data: projectsData } = useGetUserProjectsQuery({});
  const { data: accessStatus } = useGetUserAccessStatusQuery({});
  const [inviteUsers] = useInviteUsersMutation();

  const hasSingleProject = projectsData?.length === 1;

  useEffect(() => {
    if (selectedProject.length > 0 || !projectsData) return;
    if (
      createdProjectId &&
      projectsData.some((p) => p.projectId === createdProjectId)
    ) {
      setSelectedProject([createdProjectId]);
    } else if (projectsData.length === 1) {
      setSelectedProject([projectsData[0].projectId]);
    }
  }, [createdProjectId, projectsData, selectedProject.length]);

  const isCollaborator =
    accessStatus?.isCollaborator &&
    !accessStatus?.isOrgOwner &&
    !accessStatus?.isProjectAdmin;

  const projectCollection = useMemo(
    () =>
      createListCollection({
        items:
          projectsData?.map((p) => ({ label: p.name, value: p.projectId })) ??
          [],
      }),
    [projectsData],
  );

  const cityData = useMemo(() => {
    if (!selectedProject.length) return [];
    const project = projectsData?.find(
      (p) => p.projectId === selectedProject[0],
    );
    return (
      project?.cities.map((c) => ({ cityId: c.cityId, name: c.name })) ?? []
    );
  }, [projectsData, selectedProject]);

  // Admin invites grant project-wide access (ProjectAdmin) on accept, so
  // cities only need choosing when at least one collaborator is invited.
  const hasCollaboratorInvite = invitedMembers.some(
    (m) => m.role === "collaborator",
  );
  // The invite API still requires city IDs, so admin-only batches are sent
  // every city in the project.
  const inviteCityIds = hasCollaboratorInvite
    ? selectedCities
    : cityData.map((c) => c.cityId);

  useEffect(() => {
    if (!hasCollaboratorInvite) {
      setSelectedCities([]);
    }
  }, [hasCollaboratorInvite]);

  useEffect(() => {
    onValidityChange?.(
      invitedMembers.length > 0 &&
        selectedProject.length > 0 &&
        inviteCityIds.length > 0,
    );
  }, [
    invitedMembers.length,
    selectedProject.length,
    inviteCityIds.length,
    onValidityChange,
  ]);

  const validateEmail = (email: string) =>
    z.string().email().safeParse(email).success;

  const addMember = () => {
    const trimmed = emailInput.trim();
    if (!trimmed) return;
    if (!validateEmail(trimmed)) {
      setEmailError("invalid-email");
      return;
    }
    if (invitedMembers.some((m) => m.email === trimmed)) {
      setEmailError("email-already-exists");
      return;
    }
    setInvitedMembers((prev) => [
      ...prev,
      { email: trimmed, role: selectedRole },
    ]);
    setEmailInput("");
    setEmailError("");
  };

  useImperativeHandle(ref, () => ({
    sendInvites: async () => {
      if (
        !invitedMembers.length ||
        !selectedProject.length ||
        !inviteCityIds.length
      )
        return;
      const result = await inviteUsers({
        projectId: selectedProject[0],
        cityIds: inviteCityIds,
        invites: invitedMembers.map((m) => ({ email: m.email, role: m.role })),
      }).unwrap();

      await copyInviteUrlsToClipboard(result.inviteUrls);
      return result;
    },
  }));

  return (
    <Box
      w="full"
      display="flex"
      flexDirection="column"
      gap={8}
      data-testid="invite-collaborators-step"
    >
      <Box display="flex" flexDirection="column" gap={6}>
        <Heading
          as="h1"
          color="content.secondary"
          fontFamily="heading"
          fontSize="headline.lg"
          fontStyle="normal"
          fontWeight="semibold"
          lineHeight="40"
          data-testid="invite-collaborators-heading"
        >
          {t("invite-collaborators-title")}
        </Heading>
        <Text color="content.tertiary">
          {t("invite-collaborators-description")}
        </Text>
      </Box>

      <Flex
        direction="column"
        gap={8}
        bg="background.default"
        borderRadius="rounded"
        p={6}
        boxShadow="1dp"
        data-testid="invite-collaborators-form-card"
      >
        <Box>
          <Text
            fontFamily="heading"
            fontWeight="semibold"
            mb={4}
            fontSize="title.md"
          >
            {t("project")}
          </Text>
          {hasSingleProject ? (
            <Input
              readOnly
              value={projectsData?.[0]?.name ?? ""}
              h={12}
              border="inputBox"
              borderRadius="sm"
              background="background.neutral"
              color="content.tertiary"
              data-testid="invite-collaborators-project-readonly"
            />
          ) : (
            <SelectRoot
              value={selectedProject}
              onValueChange={(e) => {
                setSelectedProject(e.value);
                setSelectedCities([]);
              }}
              collection={projectCollection}
              variant="outline"
              h={12}
              css={{
                "& [data-part=trigger]": {
                  h: "full",
                  bg: "background.default",
                  shadow: "sm",
                  borderColor: "border.default",
                  borderRadius: "sm",
                },
              }}
            >
              <SelectTrigger h="full">
                <SelectValueText
                  placeholder={tSettings("select-a-project")}
                  mt={1}
                />
              </SelectTrigger>
              <SelectContent portalled={false}>
                {projectCollection.items.map((p) => (
                  <SelectItem key={p.value} item={p.value}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </SelectRoot>
          )}
        </Box>

        <Box>
          <Text
            color="content.secondary"
            fontFamily="heading"
            fontSize="label.lg"
            fontWeight="medium"
            lineHeight="20px"
            letterSpacing="0.5px"
            mb={2}
          >
            {t("email")}
            <Text as="span" color="sentiment.negativeDefault">
              {" *"}
            </Text>
          </Text>
          <HStack w="full" align="flex-start">
            {/* Input with role selector inlined on the right */}
            <Box
              flex={1}
              display="flex"
              alignItems="center"
              borderWidth="1px"
              borderColor={
                emailError ? "sentiment.negativeDefault" : "border.default"
              }
              borderRadius="md"
              bg="background.default"
              overflow="hidden"
              h={12}
              _focusWithin={{
                borderColor: "interactive.secondary",
                boxShadow:
                  "0 0 0 1px var(--chakra-colors-interactive-secondary)",
              }}
            >
              <Input
                flex={1}
                bg={emailError ? "sentiment.negativeOverlay" : "transparent"}
                border="none"
                h="full"
                borderRadius={0}
                _focusVisible={{ boxShadow: "none" }}
                value={emailInput}
                onChange={(e) => {
                  setEmailInput(e.target.value);
                  if (emailError) setEmailError("");
                }}
                onKeyDown={(e) => e.key === "Enter" && addMember()}
                placeholder={t("invite-collaborators-email-placeholder")}
              />
              {!isCollaborator && (
                <MenuRoot>
                  <MenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="xs"
                      mx={2}
                      px={2}
                      gap={1}
                      flexShrink={0}
                      bg="background.neutral"
                      color="content.tertiary"
                      fontFamily="body"
                      fontSize="body.sm"
                      fontWeight="normal"
                      textTransform="none"
                      letterSpacing="normal"
                      _hover={{ bg: "background.controlHover" }}
                      _expanded={{ bg: "background.controlHover" }}
                      data-testid="invite-collaborators-role-select"
                    >
                      {t(selectedRole)}
                      <Icon as={MdArrowDropDown} boxSize={5} />
                    </Button>
                  </MenuTrigger>
                  <MenuContent
                    w="auto"
                    minW={44}
                    display="inline-flex"
                    flexDirection="column"
                    alignItems="flex-start"
                    py={4}
                    px={0}
                    borderRadius="rounded"
                    bg="background.default"
                    shadow="2dp"
                  >
                    {ROLES.map((role) => (
                      <MenuItem
                        key={role}
                        value={role}
                        w="full"
                        py={3}
                        px={4}
                        gap={4}
                        fontSize="body.lg"
                        cursor="pointer"
                        color="content.primary"
                        _hover={{ bg: "content.link", color: "white" }}
                        onClick={() => setSelectedRole(role)}
                      >
                        {t(role)}
                      </MenuItem>
                    ))}
                  </MenuContent>
                </MenuRoot>
              )}
            </Box>
            <Button
              onClick={addMember}
              disabled={!emailInput.trim()}
              textTransform="uppercase"
              letterSpacing="wider"
              px={6}
              h={12}
              flexShrink={0}
            >
              {t("add-member")}
            </Button>
          </HStack>
          {emailError ? (
            <HStack mt={2}>
              <Icon as={MdInfoOutline} color="sentiment.negativeDefault" />
              <Text color="sentiment.negativeDefault" fontSize="body.sm">
                {t(emailError)}
              </Text>
            </HStack>
          ) : (
            <HStack mt={2} gap={1.5}>
              <InfoOutlineIcon boxSize={4} color="semantic.info" />
              <Text fontSize="body.sm" color="content.tertiary">
                {t("invite-collaborators-info")}
              </Text>
            </HStack>
          )}
          {invitedMembers.length > 0 && (
            <Flex mt={3} flexWrap="wrap" gap={2}>
              {invitedMembers.map((member) => (
                <Box
                  key={member.email}
                  display="inline-flex"
                  alignItems="center"
                  bg="background.neutral"
                  borderRadius="full"
                  py={1}
                  px={3}
                  gap={2}
                  fontSize="body.lg"
                >
                  <Text
                    color="content.alternative"
                    fontFamily="body"
                    fontWeight="normal"
                    lineHeight="24px"
                    letterSpacing="0.5px"
                  >
                    {member.email}
                  </Text>
                  <Text color="content.secondary">({t(member.role)})</Text>
                  <CloseButton
                    w={6}
                    h={6}
                    minW={6}
                    display="flex"
                    justifyContent="center"
                    alignItems="center"
                    color="content.alternative"
                    onClick={() =>
                      setInvitedMembers((prev) =>
                        prev.filter((m) => m.email !== member.email),
                      )
                    }
                  />
                </Box>
              ))}
            </Flex>
          )}
        </Box>
      </Flex>

      {hasCollaboratorInvite && selectedProject.length > 0 && (
        <Box
          bg="background.default"
          borderRadius="rounded"
          p={6}
          boxShadow="1dp"
          data-testid="invite-collaborators-cities-card"
        >
          <Flex direction="column" gap={2} mb={6}>
            <Text
              fontFamily="heading"
              fontWeight="bold"
              fontSize="headline.sm"
              color="content.tertiary"
            >
              {t("invite-collaborators-select-cities")}
            </Text>
            <Text color="content.tertiary" fontSize="body.md">
              {t("invite-collaborators-select-cities-description")}
            </Text>
          </Flex>
          {selectedProject.length > 0 ? (
            <Box>
              <Checkbox
                checked={
                  cityData.length > 0 &&
                  selectedCities.length === cityData.length
                }
                onCheckedChange={(e) =>
                  setSelectedCities(
                    e.checked === true ? cityData.map((c) => c.cityId) : [],
                  )
                }
                mb={4}
              >
                <Text
                  color="content.secondary"
                  fontFamily="body"
                  fontSize="body.lg"
                  fontWeight="normal"
                  lineHeight="24px"
                  letterSpacing="0.5px"
                >
                  {t("invite-collaborators-all-cities")}
                </Text>
              </Checkbox>
              <Separator borderColor="border.overlay" mb={4} />
              <CheckboxGroup
                value={selectedCities}
                onValueChange={setSelectedCities}
              >
                <Box
                  display="grid"
                  gridTemplateColumns={{
                    base: "1fr",
                    sm: "repeat(2, 1fr)",
                    md: "repeat(3, 1fr)",
                  }}
                  gap={4}
                >
                  {cityData.map(({ cityId, name }) => (
                    <ChakraCheckbox.Root key={cityId} value={cityId}>
                      <ChakraCheckbox.HiddenInput />
                      <ChakraCheckbox.Control>
                        <ChakraCheckbox.Indicator cursor="pointer" />
                      </ChakraCheckbox.Control>
                      <ChakraCheckbox.Label>
                        <Text
                          color="content.secondary"
                          fontFamily="body"
                          fontSize="body.lg"
                          fontWeight="normal"
                          lineHeight="24px"
                          letterSpacing="0.5px"
                        >
                          {name}
                        </Text>
                      </ChakraCheckbox.Label>
                    </ChakraCheckbox.Root>
                  ))}
                </Box>
              </CheckboxGroup>
            </Box>
          ) : (
            <Text color="content.tertiary" fontSize="body.md">
              {t("invite-collaborators-select-project-first")}
            </Text>
          )}
        </Box>
      )}
    </Box>
  );
});

InviteCollaboratorsStep.displayName = "InviteCollaboratorsStep";
export default InviteCollaboratorsStep;
