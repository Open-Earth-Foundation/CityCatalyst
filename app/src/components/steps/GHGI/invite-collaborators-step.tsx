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
  chakra,
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
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { MdInfoOutline } from "react-icons/md";
import type { TFunction } from "i18next";
import { useGetUserProjectsQuery, useInviteUsersMutation } from "@/services/api";
import { z } from "zod";

interface InvitedMember {
  email: string;
  role: "admin" | "collaborator";
}

export interface InviteCollaboratorsStepRef {
  sendInvites: () => Promise<void>;
}

const InviteCollaboratorsStep = forwardRef<
  InviteCollaboratorsStepRef,
  { t: TFunction }
>(({ t }, ref) => {
  const [emailInput, setEmailInput] = useState("");
  const [emailError, setEmailError] = useState("");
  const [selectedRole, setSelectedRole] = useState<"admin" | "collaborator">(
    "collaborator",
  );
  const [invitedMembers, setInvitedMembers] = useState<InvitedMember[]>([]);
  const [selectedProject, setSelectedProject] = useState<string[]>([]);
  const [selectedCities, setSelectedCities] = useState<string[]>([]);

  useEffect(() => {
    if (invitedMembers.length === 0) {
      setSelectedCities([]);
    }
  }, [invitedMembers.length]);

  const { data: projectsData } = useGetUserProjectsQuery({});
  const [inviteUsers] = useInviteUsersMutation();

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
    setInvitedMembers((prev) => [...prev, { email: trimmed, role: selectedRole }]);
    setEmailInput("");
    setEmailError("");
  };

  const handleCityToggle = (id: string) => {
    setSelectedCities((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id],
    );
  };

  useImperativeHandle(ref, () => ({
    sendInvites: async () => {
      if (!invitedMembers.length || !selectedCities.length) return;
      await inviteUsers({
        cityIds: selectedCities,
        emails: invitedMembers.map((m) => m.email),
      }).unwrap();
    },
  }));

  return (
    <Box w="720px" display="flex" flexDirection="column" gap={8} data-testid="invite-collaborators-step">
      <Box>
        <Heading
          fontSize="headline.lg"
          fontFamily="heading"
          fontWeight="bold"
          mb={2}
        >
          {t("invite-collaborators-heading")}
        </Heading>
        <Text color="content.tertiary">
          {t("invite-collaborators-description")}
        </Text>
      </Box>

      <Box>
        <Text fontWeight="semibold" mb={2}>
          {t("select-project")}
        </Text>
        <SelectRoot
          value={selectedProject}
          onValueChange={(e) => {
            setSelectedProject(e.value);
            setSelectedCities([]);
          }}
          collection={projectCollection}
          variant="subtle"
        >
          <SelectTrigger>
            <SelectValueText placeholder={t("select-project")} />
          </SelectTrigger>
          <SelectContent portalled={false}>
            {projectCollection.items.map((p) => (
              <SelectItem key={p.value} item={p.value}>
                {p.label}
              </SelectItem>
            ))}
          </SelectContent>
        </SelectRoot>
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
        </Text>
        <HStack w="full" align="flex-start">
          {/* Input with role selector inlined on the right */}
          <Box
            flex={1}
            display="flex"
            alignItems="center"
            borderWidth="1px"
            borderColor={
              emailError ? "sentiment.negativeDefault" : "border.neutral"
            }
            borderRadius="md"
            bg={
              emailError ? "sentiment.negativeOverlay" : "background.default"
            }
            overflow="hidden"
            h="40px"
            _focusWithin={{
              borderColor: "interactive.secondary",
              boxShadow:
                "0 0 0 1px var(--chakra-colors-interactive-secondary)",
            }}
          >
            <Input
              flex={1}
              border="none"
              bg="transparent"
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
            <chakra.select
              value={selectedRole}
              onChange={(e) =>
                setSelectedRole(e.target.value as "admin" | "collaborator")
              }
              bg="background.neutral"
              border="none"
              borderRadius="md"
              ps={2}
              pe={1}
              mx={2}
              h="28px"
              color="content.secondary"
              fontFamily="body"
              fontSize="body.sm"
              fontWeight="normal"
              lineHeight="16px"
              letterSpacing="0.5px"
              cursor="pointer"
              flexShrink={0}
              _focus={{ outline: "none", boxShadow: "none" }}
            >
              <option value="collaborator">{t("collaborator")}</option>
              <option value="admin">{t("admin")}</option>
            </chakra.select>
          </Box>
          <Button
            onClick={addMember}
            disabled={!emailInput.trim()}
            textTransform="uppercase"
            letterSpacing="wider"
            px="24px"
            h="40px"
            flexShrink={0}
          >
            {t("add-member")}
          </Button>
        </HStack>
        {emailError ? (
          <HStack mt={2}>
            <Icon as={MdInfoOutline} color="sentiment.negativeDefault" />
            <Text color="sentiment.negativeDefault" fontSize="body.md">
              {t(emailError)}
            </Text>
          </HStack>
        ) : (
          <HStack mt={2}>
            <Icon as={MdInfoOutline} color="interactive.secondary" boxSize={4} />
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
                borderRadius="9999px"
                borderWidth="1px"
                borderColor="border.neutral"
                py={1}
                px={3}
                gap={2}
              >
                <Text
                  color="content.alternative"
                  fontFamily="body"
                  fontSize="body.lg"
                  fontWeight="normal"
                  lineHeight="24px"
                  letterSpacing="0.5px"
                >
                  {member.email}
                </Text>
                <Box
                  bg="background.graySubtle"
                  borderRadius="md"
                  px={1}
                  display="inline-flex"
                  alignItems="center"
                >
                  <Text
                    fontSize="label.sm"
                    color="content.secondary"
                    fontWeight="medium"
                  >
                    {t(member.role)}
                  </Text>
                </Box>
                <CloseButton
                  w="24px"
                  h="24px"
                  minW="24px"
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

      {invitedMembers.length > 0 && selectedProject.length > 0 && (
      <Box>
        <Text
          fontFamily="heading"
          fontWeight="bold"
          fontSize="headline.sm"
          mb={4}
        >
          {t("invite-collaborators-select-cities")}
        </Text>
        {selectedProject.length > 0 ? (
          <Box
            bg="background.default"
            px={6}
            py={4}
          >
            <Checkbox
              checked={
                cityData.length > 0 &&
                selectedCities.length === cityData.length
              }
              onChange={() => {
                if (selectedCities.length === cityData.length) {
                  setSelectedCities([]);
                } else {
                  setSelectedCities(cityData.map((c) => c.cityId));
                }
              }}
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
            <CheckboxGroup>
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
                  <Checkbox
                    key={cityId}
                    checked={selectedCities.includes(cityId)}
                    onChange={() => handleCityToggle(cityId)}
                  >
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
                  </Checkbox>
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
