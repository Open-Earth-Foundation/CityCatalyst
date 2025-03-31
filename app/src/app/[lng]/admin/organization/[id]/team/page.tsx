"use client";
import {
  Accordion,
  Box,
  Button,
  Heading,
  Icon,
  IconButton,
  Table,
  Tabs,
  Text,
  useDisclosure,
} from "@chakra-ui/react";
import { MdAdd, MdMoreVert, MdOutlineGroup } from "react-icons/md";
import React, { useEffect, useMemo, useState } from "react";
import { useTranslation } from "@/i18n/client";
import {
  useGetOrganizationQuery,
  useGetProjectsQuery,
  useGetProjectUsersQuery,
} from "@/services/api";
import ProgressLoader from "@/components/ProgressLoader";
import {
  AccordionItem,
  AccordionItemContent,
  AccordionItemTrigger,
  AccordionRoot,
} from "@/components/ui/accordion";
import { convertKgToTonnes } from "@/util/helpers";
import { LuChevronDown } from "react-icons/lu";
import DataTable from "@/components/ui/data-table";
import { OrganizationRole } from "@/util/types";
import {
  MenuContent,
  MenuItem,
  MenuRoot,
  MenuTrigger,
} from "@/components/ui/menu";
import { RiDeleteBin6Line, RiEditLine } from "react-icons/ri";
import { Tag } from "@/components/ui/tag";
import AddCollaboratorsModal from "@/components/HomePage/AddCollaboratorModal/AddCollaboratorsModal";
import { uniqBy } from "lodash";

const AdminOrganizationTeamPage = ({
  params: { lng, id },
}: {
  params: { lng: string; id: string };
}) => {
  const { t } = useTranslation(lng, "admin");

  const TagMapping = {
    [OrganizationRole.ORG_ADMIN]: {
      color: "green",
      text: t("owner"),
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

  const [selectedProject, setSelectedProject] = React.useState<string[]>([]);
  const [selectedCity, setSelectedCity] = React.useState<string | null>("");

  const { data: organization, isLoading: isOrganizationLoading } =
    useGetOrganizationQuery(id);

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
      selectedProject.length > 0 ? selectedProject[0] : null,
      {
        skip: !(selectedProject.length > 0),
      },
    );

  const userList = useMemo(() => {
    if (!projectUsers) return [];
    if (selectedCity) {
      return projectUsers.filter(
        (user) =>
          user.cityId === selectedCity ||
          user.role === OrganizationRole.ORG_ADMIN ||
          user.role === OrganizationRole.ADMIN,
      );
    }
    return uniqBy(projectUsers, "email");
  }, [projectUsers, selectedCity]);

  console.log(userList, "the user list");

  useEffect(() => {
    if (projectsData && projectsData.length > 0) {
      setSelectedProject([projectsData[0].projectId]);
    }
  }, [projectsData]);

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

  const [isModalOpen, setIsModalOpen] = useState(false);

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
        alignItems="center"
        justifyContent="space-between"
      >
        <Box w="250px" flex={1}>
          <Text
            fontSize="title.md"
            mb={3}
            fontWeight="semibold"
            color="content.secondary"
          >
            {t("projects")}
          </Text>
          <AccordionRoot
            variant="plain"
            value={selectedProject}
            onValueChange={(val) => {
              setSelectedProject(val.value);
              setSelectedCity(null);
            }}
          >
            {projectsData?.map((item) => (
              <AccordionItem key={item} value={item.projectId}>
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
                    alignItems="center"
                    color={
                      selectedProject.includes(item.projectId)
                        ? "interactive.secondary"
                        : "content.secondary"
                    }
                  >
                    <Text
                      fontSize="label.lg"
                      fontWeight="semibold"
                      color="currentcolor"
                    >
                      {item.name}
                    </Text>
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
        </Box>
        <Box w="full">
          {isLoadingProjectUsers ? (
            <ProgressLoader
              size="sm"
              color="content.secondary"
              thickness="2px"
            />
          ) : (
            <DataTable
              data={userList}
              t={t}
              searchable={true}
              pagination={true}
              filterOptions={Object.values(OrganizationRole)}
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
                { header: t("status"), accessor: "status" },
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
                  <Table.Cell title={item.role}>
                    {" "}
                    <Tag size="lg" colorPalette="muted">
                      {item.status === "accepted"
                        ? t("accepted")
                        : t("invite-sent")}
                    </Tag>
                  </Table.Cell>
                  {[
                    OrganizationRole.ADMIN,
                    OrganizationRole.COLLABORATOR,
                  ].includes(item.role) ? (
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
                          <MenuItem
                            value={t("edit-project")}
                            valueText={t("edit-project")}
                            p="16px"
                            display="flex"
                            alignItems="center"
                            gap="16px"
                            _hover={{
                              bg: "content.link",
                              cursor: "pointer",
                            }}
                            className="group"
                            onClick={() => {}}
                          >
                            <Icon
                              className="group-hover:text-white"
                              color="interactive.control"
                              as={MdOutlineGroup}
                              h="24px"
                              w="24px"
                            />
                            <Text
                              className="group-hover:text-white"
                              color="content.primary"
                            >
                              {t("change-to-admin")}
                            </Text>
                          </MenuItem>
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
                            onClick={() => {}}
                          >
                            <Icon
                              className="group-hover:text-white"
                              color="sentiment.negativeDefault"
                              as={RiDeleteBin6Line}
                              h="24px"
                              w="24px"
                            />
                            <Text
                              className="group-hover:text-white"
                              color="content.primary"
                            >
                              {t("remove")}
                            </Text>
                          </MenuItem>
                        </MenuContent>
                      </MenuRoot>
                    </Table.Cell>
                  ) : (
                    <Table.Cell>
                      <span></span>
                    </Table.Cell>
                  )}
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
        isAdmin={true}
      />
    </Box>
  );
};

export default AdminOrganizationTeamPage;
