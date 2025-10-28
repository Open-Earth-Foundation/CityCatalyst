"use client";
import {
  Accordion,
  Box,
  Button,
  Heading,
  Icon,
  IconButton,
  Input,
  Table,
  Tabs,
  Text,
} from "@chakra-ui/react";
import { MdAdd, MdMoreVert, MdOutlineGroup, MdSearch } from "react-icons/md";
import React, { useEffect, useMemo, useState, use } from "react";
import { useTranslation } from "@/i18n/client";
import { useFuzzySearch } from "@/hooks/useFuzzySearch";
import {
  api,
  useGetOrganizationQuery,
  useGetProjectsQuery,
  useGetProjectUsersQuery,
  useUpdateUserRoleInOrganizationMutation,
} from "@/services/api";
import ProgressLoader from "@/components/ProgressLoader";
import {
  AccordionItem,
  AccordionItemContent,
  AccordionItemTrigger,
  AccordionRoot,
} from "@/components/ui/accordion";
import { InputGroup } from "@/components/ui/input-group";
import { convertKgToTonnes } from "@/util/helpers";
import { LuChevronDown } from "react-icons/lu";
import DataTable from "@/components/ui/data-table";
import {
  InviteStatus,
  OrganizationRole,
  ProjectUserResponse,
  ProjectWithCities,
} from "@/util/types";
import {
  MenuContent,
  MenuItem,
  MenuRoot,
  MenuTrigger,
} from "@/components/ui/menu";
import { RiDeleteBin6Line, RiEditLine } from "react-icons/ri";
import { Tag } from "@/components/ui/tag";
import AddCollaboratorsModal from "@/components/GHGIHomePage/AddCollaboratorModal/AddCollaboratorsModal";
import { uniqBy } from "lodash";
import RemoveUserModal from "@/app/[lng]/admin/organization/[id]/team/RemoveUserModal";
import { UseErrorToast, UseSuccessToast } from "@/hooks/Toasts";
import { toaster } from "@/components/ui/toaster";
import { TitleMedium } from "@/components/package/Texts";

const AdminOrganizationTeamPage = (props: {
  params: Promise<{ lng: string; id: string }>;
}) => {
  const { lng, id } = use(props.params);
  const { t } = useTranslation(lng, "admin");

  const TagMapping = {
    [OrganizationRole.ORG_ADMIN]: {
      color: "blue",
      text: t("admin"),
    },
    [OrganizationRole.ADMIN]: {
      color: "blue",
      text: t("admin"),
    },
    [OrganizationRole.COLLABORATOR]: {
      color: "yellow",
      text: t("collaborator"),
    },
  };

  const { showSuccessToast } = UseSuccessToast({
    title: t("role-update-success-toast-title"),
  });

  const { showErrorToast } = UseErrorToast({
    title: t("invite-error-toast-title"),
  });

  const [selectedProject, setSelectedProject] = React.useState<string[]>([]);
  const [selectedCity, setSelectedCity] = React.useState<string | null>("");
  const [searchTerm, setSearchTerm] = useState("");

  const { data: organization, isLoading: isOrganizationLoading } =
    useGetOrganizationQuery(id);

  const [updateUserRole, { isLoading: isUpdatingUserRole }] =
    useUpdateUserRoleInOrganizationMutation();

  const { data: projectsData, isLoading } = useGetProjectsQuery(
    {
      organizationId: id,
    },
    {
      skip: !id,
    },
  );

  const { data: projectUsers, isLoading: isLoadingProjectUsers } =
    useGetProjectUsersQuery(
      selectedProject.length > 0 ? selectedProject[0] : "",
      {
        skip: !(selectedProject.length > 0),
      },
    );

  const userList = useMemo(() => {
    if (!projectUsers) return [];
    if (selectedCity) {
      return projectUsers
        .filter(
          (user) =>
            user.cityId === selectedCity ||
            user.role === OrganizationRole.ORG_ADMIN ||
            user.role === OrganizationRole.ADMIN,
        )
        .map((user) => ({
          ...user,
          role: user.role,
        }));
    }
    return uniqBy(projectUsers, "email");
  }, [projectUsers, selectedCity]);

  useEffect(() => {
    if (projectsData && projectsData.length > 0) {
      setSelectedProject([projectsData[0].projectId]);
    }
  }, [projectsData]);

  const upgradeRole = async ({ contactEmail }: { contactEmail: string }) => {
    toaster.loading({
      title: t("updating-role"),
      type: "info",
    });
    const { data, error } = await updateUserRole({
      organizationId: organization?.organizationId as string,
      contactEmail,
    });
    toaster.dismiss();
    if (data?.success && !error) {
      showSuccessToast();
    } else {
      showErrorToast();
    }
  };

  const selectedCityData = useMemo(() => {
    if (!projectsData || !selectedProject) return null;
    const selectedProjectData = projectsData.find(
      (project) => project.projectId === selectedProject[0],
    );
    if (!selectedProjectData) return null;
    return selectedProjectData.cities.find(
      (city) => city.cityId === selectedCity,
    );
  }, [selectedCity, selectedProject, projectsData]);

  // Flatten projects and cities for fuzzy search
  const flattenedCities = useMemo(() => {
    if (!projectsData) return [];
    return projectsData.flatMap((project) =>
      project.cities.map((city) => ({
        ...city,
        projectId: project.projectId,
        projectName: project.name,
      })),
    );
  }, [projectsData]);

  // Use fuzzy search hook for filtering cities
  const filteredFlatCities = useFuzzySearch({
    data: flattenedCities,
    keys: ["name", "projectName"],
    searchTerm,
    threshold: 0.3,
  });

  // Reconstruct projects with filtered cities
  const filteredProjectsData = useMemo(() => {
    if (!projectsData) return [];
    if (!searchTerm) return projectsData;

    const matchedCityIds = new Set(
      filteredFlatCities.map((city) => city.cityId),
    );

    return projectsData
      .map((project) => ({
        ...project,
        cities: project.cities.filter((city) =>
          matchedCityIds.has(city.cityId),
        ),
      }))
      .filter((project) => project.cities.length > 0);
  }, [projectsData, searchTerm, filteredFlatCities]);

  // Auto-expand all projects with matching cities when searching
  const expandedProjects = useMemo(() => {
    if (!searchTerm || !filteredProjectsData) return selectedProject;

    return filteredProjectsData.map((project) => project.projectId);
  }, [searchTerm, filteredProjectsData, selectedProject]);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [userToRemove, setUserToRemove] = useState<ProjectUserResponse | null>(
    null,
  );
  if (isOrganizationLoading || isLoading) {
    return <ProgressLoader />;
  }

  return (
    <Box>
      <Box display="flex" alignItems="center" justifyContent="space-between">
        <Box>
          <Heading
            fontSize="headline.sm"
            mb={2}
            fontWeight="semibold"
            lineHeight="32px"
            fontStyle="normal"
            textTransform="capitalize"
            color="content.secondary"
          >
            {t("org-project-heading", { name: organization?.name })}
          </Heading>
          <Text color="content.tertiary" fontSize="body.lg">
            {t("org-project-caption", { name: organization?.name })}
          </Text>
        </Box>
        <Button
          onClick={() => {
            setIsModalOpen(true);
          }}
          h="48px"
          mt="auto"
        >
          <Icon as={MdAdd} h={8} w={8} />
          {t("invite-collaborator")}
        </Button>
      </Box>
      {projectsData?.length === 0 && (
        <Text
          mt={12}
          fontSize="body.lg"
          fontWeight={600}
          color="content.primary"
        >
          {t("no-data")}
        </Text>
      )}
      <Box
        display="flex"
        gap={9}
        mt={12}
        alignItems="flex-start"
        justifyContent="space-between"
      >
        <Box w="250px" flexShrink={0} display="flex" flexDirection="column">
          <Text
            fontSize="title.md"
            mb={3}
            fontWeight="semibold"
            color="content.secondary"
          >
            {t("projects")}
          </Text>

          {/* Search Bar */}
          <Box mb="12px">
            <InputGroup
              w="full"
              height="48px"
              shadow="1dp"
              alignItems="center"
              display="flex"
              borderRadius="4px"
              borderWidth="1px"
              borderStyle="solid"
              borderColor="border.neutral"
              startElement={
                <Icon
                  as={MdSearch}
                  color="content.tertiary"
                  display="flex"
                  pointerEvents="none"
                  alignItems="center"
                  size="md"
                />
              }
            >
              <Input
                type="search"
                fontSize="body.md"
                fontFamily="heading"
                letterSpacing="wide"
                color="content.tertiary"
                placeholder={t("search-by-city-or-country")}
                border="none"
                h="100%"
                onChange={(e) => setSearchTerm(e.target.value)}
                value={searchTerm}
              />
            </InputGroup>
          </Box>

          <Box maxHeight="600px" overflowY="auto" minHeight="200px">
            {filteredProjectsData && filteredProjectsData.length > 0 ? (
              <AccordionRoot
                variant="plain"
                collapsible
                multiple
                value={expandedProjects}
                onValueChange={(val) => {
                  setSelectedProject(val.value);
                  setSelectedCity(null);
                }}
              >
                {filteredProjectsData.map((item) => (
                  <AccordionItem key={item.projectId} value={item.projectId}>
                    <AccordionItemTrigger
                      onClick={() => {
                        setSelectedCity(null);
                      }}
                      w="full"
                      hideIndicator
                      padding="0px"
                    >
                      <Button
                        rounded={0}
                        variant="plain"
                        display="flex"
                        justifyContent="space-between"
                        w="full"
                        minH="56px"
                        p={4}
                        pr={0}
                      >
                        <TitleMedium>{item.name}</TitleMedium>
                        <Accordion.ItemIndicator
                          color="currentColor"
                          rotate={{ base: "-90deg", _open: "-180deg" }}
                        >
                          <Icon
                            as={LuChevronDown}
                            color="currentColor"
                            boxSize={4}
                          />
                        </Accordion.ItemIndicator>
                      </Button>
                    </AccordionItemTrigger>
                    <AccordionItemContent padding="0px" pb={4}>
                      {item.cities.length === 0 && (
                        <Text
                          fontSize="body.lg"
                          fontWeight={600}
                          color="content.primary"
                        >
                          {t("no-cities")}
                        </Text>
                      )}
                      {item.cities.length > 0 && (
                        <Tabs.Root
                          display="flex"
                          mt="12px"
                          flexDirection="row"
                          variant="subtle"
                          w="full"
                          gap="12px"
                          value={selectedCity}
                          onValueChange={(val) => setSelectedCity(val.value)}
                        >
                          <Tabs.List
                            w="full"
                            display="flex"
                            flexDirection="column"
                            gap="12px"
                          >
                            {item.cities.map((city) => (
                              <Tabs.Trigger
                                key={city.cityId}
                                value={city.cityId}
                                fontFamily="heading"
                                justifyContent={"left"}
                                letterSpacing={"wide"}
                                color="content.secondary"
                                lineHeight="20px"
                                fontStyle="normal"
                                fontSize="label.lg"
                                minH="52px"
                                w="full"
                                _selected={{
                                  color: "content.link",
                                  fontSize: "label.lg",
                                  fontWeight: "medium",
                                  backgroundColor: "background.neutral",
                                  borderRadius: "8px",
                                  borderWidth: "1px",
                                  borderStyle: "solid",
                                  borderColor: "content.link",
                                }}
                              >
                                {city.name}
                              </Tabs.Trigger>
                            ))}
                          </Tabs.List>
                        </Tabs.Root>
                      )}
                    </AccordionItemContent>
                  </AccordionItem>
                ))}
              </AccordionRoot>
            ) : (
              <Text
                fontSize="body.lg"
                fontWeight={600}
                color="content.primary"
                textAlign="center"
                pt={8}
              >
                {t("no-matching-cities")}
              </Text>
            )}
          </Box>
        </Box>
        <Box w="full">
          {isLoadingProjectUsers ? (
            <ProgressLoader />
          ) : (
            <DataTable
              data={userList}
              searchable={true}
              pagination={true}
              filterOptions={Object.keys(TagMapping).map((item) => ({
                value: item,
                label: TagMapping[item as OrganizationRole].text,
              }))}
              filterProperty={"role"}
              title={`${selectedCityData ? selectedCityData.name + " ," : ""} ${t(
                "org-team-heading",
                {
                  name: organization?.name,
                },
              )}`}
              columns={[
                { header: t("email"), accessor: "email" },
                { header: t("role"), accessor: "role" },
                { header: "", accessor: null },
              ]}
              renderRow={(item, idx) => (
                <Table.Row key={idx}>
                  <Table.Cell>{item.email}</Table.Cell>
                  <Table.Cell title={item.role}>
                    {" "}
                    <Tag
                      size="lg"
                      colorPalette={
                        TagMapping[item.role as OrganizationRole].color
                      }
                    >
                      {TagMapping[item.role as OrganizationRole].text}
                    </Tag>
                  </Table.Cell>

                  <Table.Cell>
                    <MenuRoot>
                      <MenuTrigger>
                        <IconButton
                          data-testid="activity-more-icon"
                          aria-label="more-icon"
                          variant="ghost"
                          color="content.tertiary"
                        >
                          <Icon as={MdMoreVert} size="lg" />
                        </IconButton>
                      </MenuTrigger>
                      <MenuContent
                        w="auto"
                        borderRadius="8px"
                        shadow="2dp"
                        px="0"
                      >
                        {item.role === OrganizationRole.COLLABORATOR && (
                          <MenuItem
                            value={t("change-to-admin")}
                            valueText={t("change-to-admin")}
                            p="16px"
                            display="flex"
                            alignItems="center"
                            gap="16px"
                            _hover={{
                              bg: "content.link",
                              cursor: "pointer",
                            }}
                            className="group"
                            onClick={() =>
                              upgradeRole({ contactEmail: item.email })
                            }
                          >
                            <Icon
                              _groupHover={{
                                color: "white",
                              }}
                              as={MdOutlineGroup}
                              h="24px"
                              w="24px"
                            />
                            <Text
                              _groupHover={{
                                color: "white",
                              }}
                              color="content.primary"
                            >
                              {t("change-to-admin")}
                            </Text>
                          </MenuItem>
                        )}
                        <MenuItem
                          value={t("remove-user")}
                          valueText={t("remove-user")}
                          p="16px"
                          display="flex"
                          alignItems="center"
                          gap="16px"
                          _hover={{
                            bg: "content.link",
                            cursor: "pointer",
                          }}
                          className="group"
                          onClick={() => {
                            setIsDeleteModalOpen(true);
                            setUserToRemove(item);
                          }}
                        >
                          <Icon
                            _groupHover={{
                              color: "white",
                            }}
                            color="sentiment.negativeDefault"
                            as={RiDeleteBin6Line}
                            h="24px"
                            w="24px"
                          />
                          <Text
                            _groupHover={{
                              color: "white",
                            }}
                            color="content.primary"
                          >
                            {t("remove-user")}
                          </Text>
                        </MenuItem>
                      </MenuContent>
                    </MenuRoot>
                  </Table.Cell>
                </Table.Row>
              )}
            />
          )}
        </Box>
      </Box>
      <AddCollaboratorsModal
        lng={lng}
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        organizationId={id}
      />
      <RemoveUserModal
        t={t}
        isOpen={isDeleteModalOpen}
        onClose={() => {
          setIsDeleteModalOpen(false);
          setUserToRemove(null);
        }}
        onOpenChange={setIsDeleteModalOpen}
        projectData={projectsData as ProjectWithCities[]}
        selectedProject={selectedProject.length > 0 ? selectedProject[0] : null}
        selectedCity={selectedCity}
        user={userToRemove}
        organization={organization}
      />
    </Box>
  );
};

export default AdminOrganizationTeamPage;
