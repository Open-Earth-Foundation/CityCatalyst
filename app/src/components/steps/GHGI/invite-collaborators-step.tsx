"use client";

import {
  forwardRef,
  useImperativeHandle,
  useState,
  useMemo,
} from "react";
import {
  Box,
  CheckboxGroup,
  createListCollection,
  Heading,
  HStack,
  Icon,
  Input,
  Separator,
  Tag,
  Text,
} from "@chakra-ui/react";
import { Field } from "@/components/ui/field";
import {
  SelectContent,
  SelectItem,
  SelectRoot,
  SelectTrigger,
  SelectValueText,
} from "@/components/ui/select";
import { NativeSelectField, NativeSelectRoot } from "@/components/ui/native-select";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { MdInfoOutline } from "react-icons/md";
import type { TFunction } from "i18next";
import { useGetUserProjectsQuery, useInviteUsersMutation } from "@/services/api";

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
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

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
    <Box w="720px" display="flex" flexDirection="column" gap={8}>
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
        <Text fontWeight="semibold" mb={2}>
          {t("email")}
        </Text>
        <Field invalid={!!emailError}>
          <HStack w="full">
            <Input
              flex={1}
              value={emailInput}
              onChange={(e) => {
                setEmailInput(e.target.value);
                if (emailError) setEmailError("");
              }}
              onKeyDown={(e) => e.key === "Enter" && addMember()}
              placeholder={t("invite-collaborators-email-placeholder")}
              borderColor="border.neutral"
              backgroundColor={
                emailError ? "sentiment.negativeOverlay" : "background.default"
              }
            />
            <NativeSelectRoot variant="outline" w="150px">
              <NativeSelectField
                value={selectedRole}
                onChange={(e) =>
                  setSelectedRole(e.target.value as "admin" | "collaborator")
                }
              >
                <option value="collaborator">{t("collaborator")}</option>
                <option value="admin">{t("admin")}</option>
              </NativeSelectField>
            </NativeSelectRoot>
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
        </Field>
        {emailError && (
          <HStack mt={2}>
            <Icon as={MdInfoOutline} color="sentiment.negativeDefault" />
            <Text color="sentiment.negativeDefault" fontSize="body.md">
              {t(emailError)}
            </Text>
          </HStack>
        )}
        {invitedMembers.length > 0 && (
          <Box
            mt={3}
            borderWidth="2px"
            borderColor="border.neutral"
            borderRadius="8px"
            p={3}
            display="flex"
            flexWrap="wrap"
            gap={2}
          >
            {invitedMembers.map((member) => (
              <Tag.Root
                key={member.email}
                variant="solid"
                backgroundColor="background.neutral"
                py={1}
                px={2}
                gap={2}
              >
                <Text color="content.alternative" fontSize="body.md">
                  {member.email}
                </Text>
                <Text fontSize="label.sm" color="content.secondary" fontWeight="medium">
                  {t(member.role)}
                </Text>
                <Tag.EndElement>
                  <Tag.CloseTrigger
                    color="interactive.control"
                    onClick={() =>
                      setInvitedMembers((prev) =>
                        prev.filter((m) => m.email !== member.email),
                      )
                    }
                  />
                </Tag.EndElement>
              </Tag.Root>
            ))}
          </Box>
        )}
      </Box>

      {selectedProject.length > 0 && (
        <Box>
          <Text fontWeight="semibold" mb={4}>
            {t("invite-collaborators-select-cities")}
          </Text>
          {cityData.length > 1 && (
            <>
              <Checkbox
                checked={selectedCities.length === cityData.length}
                onChange={() => {
                  if (selectedCities.length === cityData.length) {
                    setSelectedCities([]);
                  } else {
                    setSelectedCities(cityData.map((c) => c.cityId));
                  }
                }}
                mb={4}
              >
                <Text fontWeight="semibold" fontSize="body.lg">
                  {t("invite-collaborators-all-cities")}
                </Text>
              </Checkbox>
              <Separator borderColor="border.overlay" mb={4} />
            </>
          )}
          <CheckboxGroup mb={6}>
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
                  <Text fontWeight="semibold" fontSize="body.lg">
                    {name}
                  </Text>
                </Checkbox>
              ))}
            </Box>
          </CheckboxGroup>
        </Box>
      )}
    </Box>
  );
});

InviteCollaboratorsStep.displayName = "InviteCollaboratorsStep";
export default InviteCollaboratorsStep;
