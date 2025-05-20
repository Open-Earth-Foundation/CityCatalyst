import { useTranslation } from "@/i18n/client";
import {
  Accordion,
  Box,
  BreadcrumbItem,
  Button,
  Flex,
  Heading,
  Icon,
  IconButton,
  Progress,
  Spinner,
  Table,
  Tabs,
  Text,
} from "@chakra-ui/react";
import {
  MdAdd,
  MdChevronRight,
  MdMoreVert,
  MdOutlineFolder,
} from "react-icons/md";
import {
  AccordionItem,
  AccordionItemContent,
  AccordionItemTrigger,
  AccordionRoot,
} from "@/components/ui/accordion";
import { LuChevronDown } from "react-icons/lu";
import ProgressLoader from "@/components/ProgressLoader";
import DataTableCore from "@/components/ui/data-table-core";
import { OrganizationRole, ProjectWithCities } from "@/util/types";
import { Trans } from "react-i18next";
import { Tag } from "@/components/ui/tag";
import {
  MenuContent,
  MenuItem,
  MenuRoot,
  MenuTrigger,
} from "@/components/ui/menu";
import { RiDeleteBin6Line } from "react-icons/ri";
import React, { useEffect, useMemo, useState, useCallback } from "react";
import {
  useGetOrganizationQuery,
  useGetProjectsQuery,
  useGetProjectUsersQuery,
} from "@/services/api";
import { useRouter } from "next/navigation";
import { uniqBy } from "lodash";
import { CircleFlag } from "react-circle-flags";
import {
  BreadcrumbCurrentLink,
  BreadcrumbLink,
  BreadcrumbRoot,
} from "@/components/ui/breadcrumb";
import { BsDownload } from "react-icons/bs";
import { TFunction } from "i18next";

const TagMapping = {
  [OrganizationRole.ORG_ADMIN]: { color: "green", text: "owner" },
  [OrganizationRole.ADMIN]: { color: "blue", text: "admin" },
  [OrganizationRole.COLLABORATOR]: { color: "yellow", text: "collaborator" },
};

const getInventoryLastUpdated = (lastUpdated: Date, t: Function) => {
  if (!lastUpdated || isNaN(new Date(lastUpdated).getTime())) {
    return <p>{t("no-date-available")}</p>;
  }
  return <p>{new Date(lastUpdated).toLocaleDateString()}</p>;
};

interface UseProjectDataProps {
  organizationId: string;
  selectedProjectId: string | null;
  selectedCityId: string | null;
}

const useProjectData = ({
  organizationId,
  selectedProjectId,
  selectedCityId,
}: UseProjectDataProps) => {
  const { data: organization, isLoading: isOrganizationLoading } =
    useGetOrganizationQuery(organizationId);
  const { data: projectsData, isLoading: isProjectsLoading } =
    useGetProjectsQuery({ organizationId }, { skip: !organizationId });
  const { data: projectUsers, isLoading: isProjectUsersLoading } =
    useGetProjectUsersQuery(selectedProjectId || "", {
      skip: !selectedProjectId,
    });

  const { numCities, totalCities } = useMemo(() => {
    return (
      organization?.projects.reduce(
        (acc, proj) => ({
          numCities: acc.numCities + (proj?.cities?.length ?? 0),
          totalCities: acc.totalCities + BigInt(proj?.cityCountLimit),
        }),
        { numCities: 0, totalCities: BigInt(0) },
      ) ?? { numCities: 0, totalCities: BigInt(0) }
    );
  }, [organization?.projects]);

  const selectedProjectData = useMemo(() => {
    return projectsData?.find(
      (project) => project.projectId === selectedProjectId,
    );
  }, [selectedProjectId, projectsData]);

  const selectedCityData = useMemo(() => {
    return selectedProjectData?.cities.find(
      (city) => city.cityId === selectedCityId,
    );
  }, [selectedCityId, selectedProjectData]);

  const userList = useMemo(() => {
    if (!projectUsers) return [];
    if (selectedCityId) {
      return projectUsers
        .filter(
          (user) =>
            user.cityId === selectedCityId ||
            user.role === OrganizationRole.ORG_ADMIN ||
            user.role === OrganizationRole.ADMIN,
        )
        .map((user) => ({ ...user, role: user.role }));
    }
    return uniqBy(projectUsers, "email");
  }, [projectUsers, selectedCityId]);

  return {
    organization,
    isOrganizationLoading,
    projectsData,
    isProjectsLoading,
    projectUsers,
    isProjectUsersLoading,
    numCities,
    totalCities,
    selectedProjectData,
    selectedCityData,
    userList,
  };
};

interface ProjectOverviewProps {
  t: TFunction;
  organizationName?: string;
  projectCount: number;
  totalCities: bigint;
}

const ProjectOverview: React.FC<ProjectOverviewProps> = ({
  t,
  organizationName,
  projectCount,
  totalCities,
}) => (
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
      {t("Projects")}
    </Heading>
    <Text color="content.tertiary" fontSize="body.lg">
      <Trans
        i18nKey="projects-description"
        t={t}
        values={{
          orgName: organizationName,
          projectCount: projectCount,
          cityCount: totalCities,
        }}
        components={{ bold: <strong /> }}
      />
    </Text>
  </Box>
);

interface ProjectListProps {
  t: Function;
  projects: ProjectWithCities[];
  selectedProjectId: string[];
  setSelectedProject: (value: string[]) => void;
  setSelectedCity: (value: string | null) => void;
}

const ProjectList: React.FC<ProjectListProps> = ({
  t,
  projects,
  selectedProjectId,
  setSelectedProject,
  setSelectedCity,
}) => (
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
      value={selectedProjectId}
      onValueChange={(val) => {
        setSelectedProject(val.value);
        setSelectedCity(null);
      }}
    >
      {projects.map((item) => (
        <AccordionItem key={item.projectId} value={item.projectId}>
          <AccordionItemTrigger
            onClick={() => setSelectedCity(null)}
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
                selectedProjectId.includes(item.projectId)
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
                <Icon as={LuChevronDown} color="currentColor" boxSize={4} />
              </Accordion.ItemIndicator>
            </Button>
          </AccordionItemTrigger>
          <AccordionItemContent padding="0px" pb={4}>
            {item.cities.length === 0 ? (
              <Text fontSize="body.lg" fontWeight={600} color="content.primary">
                {t("no-cities")}
              </Text>
            ) : (
              <Tabs.Root
                display="flex"
                mt="12px"
                flexDirection="row"
                variant="subtle"
                w="full"
                gap="12px"
                value={selectedProjectId[0]} // Use selectedProjectId[0] as value to indicate selected project
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
);

interface ProjectDetailsProps {
  t: Function;
  lng: string;
  router: any;
  selectedCity: string | null;
  selectedProjectData: ProjectWithCities | null | undefined;
  selectedCityData: any; // Define a more specific type if possible
  organizationName?: string;
  projectUsers: any[]; // Define a more specific type if possible
  userList: any[]; // Define a more specific type if possible
  isLoadingProjectUsers: boolean;
  tabValue: string;
  setTabValue: (value: string) => void;
  setSelectedCity: (value: string | null) => void;
}

const ProjectDetails: React.FC<ProjectDetailsProps> = ({
  t,
  lng,
  router,
  selectedCity,
  selectedProjectData,
  selectedCityData,
  organizationName,
  projectUsers,
  userList,
  isLoadingProjectUsers,
  tabValue,
  setTabValue,
  setSelectedCity,
}) => (
  <Box w="full">
    {isLoadingProjectUsers ? (
      <ProgressLoader />
    ) : (
      <Box className="bg-white" p={6} rounded={2} mt={12}>
        <Flex justifyContent="space-between" alignItems="center" mb={6}>
          {selectedCity ? (
            <Box>
              <BreadcrumbRoot
                gap="8px"
                fontFamily="heading"
                fontWeight="bold"
                letterSpacing="widest"
                fontSize="14px"
                textTransform="uppercase"
                separator={
                  <Icon
                    as={MdChevronRight}
                    boxSize={4}
                    color="content.primary"
                    h="32px"
                  />
                }
              >
                <BreadcrumbItem>
                  <BreadcrumbLink
                    href={`/${lng}/admin`}
                    color="content.tertiary"
                    fontWeight="normal"
                    truncate
                    className="capitalize"
                  >
                    {selectedProjectData?.name}
                  </BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbCurrentLink color="content.link">
                  <Text truncate lineClamp={1} className="capitalize">
                    {selectedCityData?.name}
                  </Text>
                </BreadcrumbCurrentLink>
              </BreadcrumbRoot>
              <Flex mt={2} gap={2}>
                <CircleFlag
                  countryCode={
                    selectedCityData?.countryLocode
                      ?.substring(0, 2)
                      .toLowerCase() || ""
                  }
                  width={32}
                />
                <Text fontWeight="bold" fontSize="title.md" mb={2}>
                  {selectedCityData?.name}
                </Text>
              </Flex>
            </Box>
          ) : (
            <Text fontWeight="bold" fontSize="title.md" mb={2}>
              {organizationName}
            </Text>
          )}
          <Button
            onClick={() => router.push(`/${lng}/onboarding/setup`)}
            variant="outline"
            ml="auto"
            h="48px"
            mt="auto"
          >
            <Icon as={MdAdd} h={8} w={8} />
            {t("add-city")}
          </Button>
        </Flex>
        <Tabs.Root
          value={tabValue}
          onValueChange={(val) => setTabValue(val.value)}
          defaultValue="city"
          variant="enclosed"
        >
          <Tabs.List p={0} w="full">
            {selectedCityData ? (
              <Tabs.Trigger
                value="inventories"
                _selected={{
                  borderColor: "content.link",
                  borderBottomWidth: "2px",
                  boxShadow: "none",
                  fontWeight: "bold",
                  borderRadius: "0",
                  color: "content.link",
                }}
              >
                <Text fontSize="title.md" fontStyle="normal" lineHeight="24px">
                  {t("all-inventories", {
                    count: selectedCityData?.inventories?.length,
                  })}
                </Text>
              </Tabs.Trigger>
            ) : (
              <Tabs.Trigger
                value="city"
                _selected={{
                  borderColor: "content.link",
                  borderBottomWidth: "2px",
                  boxShadow: "none",
                  fontWeight: "bold",
                  borderRadius: "0",
                  color: "content.link",
                }}
              >
                <Text fontSize="title.md" fontStyle="normal" lineHeight="24px">
                  {t("all-cities", {
                    count: selectedProjectData?.cities?.length,
                  })}
                </Text>
              </Tabs.Trigger>
            )}
            <Tabs.Trigger
              value="collaborators"
              _selected={{
                borderColor: "content.link",
                borderBottomWidth: "2px",
                boxShadow: "none",
                fontWeight: "bold",
                borderRadius: "0",
                color: "content.link",
              }}
            >
              <Text fontSize="title.md" fontStyle="normal" lineHeight="24px">
                {t("all-collaborators", { count: projectUsers?.length })}
              </Text>
            </Tabs.Trigger>
          </Tabs.List>
          <Tabs.Content value="city">
            <DataTableCore
              data={selectedProjectData?.cities ?? []}
              columns={[
                { header: t("name"), accessor: "name" },
                { header: t("inventories"), accessor: null },
                { header: "", accessor: null },
              ]}
              renderRow={(item, idx) => (
                <Table.Row key={idx}>
                  <Table.Cell>
                    <Button
                      variant="ghost"
                      color="content.primary"
                      onClick={() => setSelectedCity(item.cityId)}
                    >
                      <Text
                        color="content.link"
                        fontWeight="normal"
                        className="truncate capitalize underline"
                        fontSize="label.lg"
                      >
                        {item.name}
                      </Text>
                    </Button>
                  </Table.Cell>
                  <Table.Cell>{item.inventories.length}</Table.Cell>
                  <Table.Cell w={10} className="w-10">
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
                          value={t("delete-city")}
                          valueText={t("delete-city")}
                          p="16px"
                          display="flex"
                          alignItems="center"
                          gap="16px"
                          _hover={{ bg: "content.link", cursor: "pointer" }}
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
                            {t("delete-city")}
                          </Text>
                        </MenuItem>
                      </MenuContent>
                    </MenuRoot>
                  </Table.Cell>
                </Table.Row>
              )}
            />
          </Tabs.Content>
          <Tabs.Content value="collaborators">
            <DataTableCore
              data={userList}
              columns={[
                { header: t("email"), accessor: "email" },
                { header: t("role"), accessor: "role" },
                { header: "", accessor: null },
                { header: "", accessor: null },
              ]}
              renderRow={(item, idx) => (
                <Table.Row key={idx}>
                  <Table.Cell>{item.email}</Table.Cell>
                  <Table.Cell title={item.role}>
                    <Tag
                      size="lg"
                      colorPalette={
                        TagMapping[item.role as OrganizationRole].color
                      }
                    >
                      {TagMapping[item.role as OrganizationRole].text}
                    </Tag>
                  </Table.Cell>
                  <Table.Cell className="w-10">
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
                          value={t("remove-user")}
                          valueText={t("remove-user")}
                          p="16px"
                          display="flex"
                          alignItems="center"
                          gap="16px"
                          _hover={{ bg: "content.link", cursor: "pointer" }}
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
                            {t("remove-user")}
                          </Text>
                        </MenuItem>
                      </MenuContent>
                    </MenuRoot>
                  </Table.Cell>
                </Table.Row>
              )}
            />
          </Tabs.Content>
          <Tabs.Content value="inventories">
            <Text
              color="content.tertiary"
              mb={2}
              mt={6}
              className="uppercase"
              fontWeight="bold"
            >
              {t("all-inventory-years")}
            </Text>
            <DataTableCore
              data={selectedCityData?.inventories ?? []}
              columns={[
                { header: t("year"), accessor: "year" },
                { header: t("status"), accessor: null },
                { header: t("last-updated"), accessor: "lastUpdated" },
                { header: "", accessor: null },
                { header: "", accessor: null },
              ]}
              renderRow={(item, idx) => (
                <Table.Row key={idx}>
                  <Table.Cell>
                    <Flex gap={2} alignItems="center">
                      <Icon
                        as={MdOutlineFolder}
                        color="content.tertiary"
                        size="lg"
                      />
                      <Text
                        color="content.link"
                        fontWeight="normal"
                        className="truncate capitalize underline"
                        fontSize="label.lg"
                      >
                        {item.year}
                      </Text>
                    </Flex>
                  </Table.Cell>
                  <Table.Cell>
                    <Progress.Root
                      maxW="137px"
                      value={0}
                      borderRadius="8px"
                      colorScheme="baseStyle"
                      height="8px"
                      width="137px"
                    >
                      <Progress.Track>
                        <Progress.Range />
                      </Progress.Track>
                    </Progress.Root>
                  </Table.Cell>
                  <Table.Cell>
                    {getInventoryLastUpdated(new Date(item.lastUpdated), t)}
                  </Table.Cell>
                  <Table.Cell>
                    <IconButton
                      data-testid="download-inventory-icon"
                      aria-label="more-icon"
                      variant="ghost"
                      color="content.tertiary"
                    >
                      <Icon as={BsDownload} size="lg" />
                    </IconButton>
                  </Table.Cell>
                  <Table.Cell className="w-10">
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
                          value={t("delete-inventory")}
                          valueText={t("delete-inventory")}
                          p="16px"
                          display="flex"
                          alignItems="center"
                          gap="16px"
                          _hover={{ bg: "content.link", cursor: "pointer" }}
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
                            {t("delete-inventory")}
                          </Text>
                        </MenuItem>
                      </MenuContent>
                    </MenuRoot>
                  </Table.Cell>
                </Table.Row>
              )}
            />
          </Tabs.Content>
        </Tabs.Root>
      </Box>
    )}
  </Box>
);

// --- Main Component ---

const ProjectSettings = ({ lng, id }: { lng: string; id: string }) => {
  const { t } = useTranslation(lng, "settings");
  const router = useRouter();

  const [selectedProjectId, setSelectedProjectId] = useState<string[]>([]);
  const [selectedCityId, setSelectedCityId] = useState<string | null>(null);
  const [tabValue, setTabValue] = useState("city");

  const {
    organization,
    isOrganizationLoading,
    projectsData,
    isProjectsLoading,
    projectUsers,
    isProjectUsersLoading,
    totalCities,
    selectedProjectData,
    selectedCityData,
    userList,
  } = useProjectData({
    organizationId: id,
    selectedProjectId:
      selectedProjectId.length > 0 ? selectedProjectId[0] : null,
    selectedCityId,
  });

  useEffect(() => {
    if (projectsData?.length && selectedProjectId.length === 0) {
      setSelectedProjectId([projectsData[0].projectId]);
      setSelectedCityId(null);
    }
  }, [projectsData, selectedProjectId.length]);

  useEffect(() => {
    if (selectedCityId) {
      setTabValue("inventories");
    } else {
      setTabValue("city");
    }
  }, [selectedCityId]);

  if (isOrganizationLoading || isProjectsLoading) {
    return <ProgressLoader />;
  }

  return (
    <Box>
      <Box display="flex" alignItems="center" justifyContent="space-between">
        <ProjectOverview
          t={t}
          organizationName={organization?.name}
          projectCount={organization?.projects?.length ?? 0}
          totalCities={totalCities}
        />
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
        {projectsData && projectsData.length > 0 && (
          <ProjectList
            t={t}
            projects={projectsData}
            selectedProjectId={selectedProjectId}
            setSelectedProject={setSelectedProjectId}
            setSelectedCity={setSelectedCityId}
          />
        )}
        <ProjectDetails
          t={t}
          lng={lng}
          router={router}
          selectedCity={selectedCityId}
          selectedProjectData={selectedProjectData}
          selectedCityData={selectedCityData}
          organizationName={organization?.name}
          projectUsers={projectUsers || []}
          userList={userList}
          isLoadingProjectUsers={isProjectUsersLoading}
          tabValue={tabValue}
          setTabValue={setTabValue}
          setSelectedCity={setSelectedCityId}
        />
      </Box>
    </Box>
  );
};

export default ProjectSettings;
