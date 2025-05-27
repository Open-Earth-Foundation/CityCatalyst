import {
  OrganizationRole,
  ProjectUserResponse,
  ProjectWithCities,
} from "@/util/types";
import React, { useState } from "react";
import {
  Box,
  BreadcrumbItem,
  Button,
  Flex,
  Icon,
  IconButton,
  Progress,
  Table,
  Tabs,
  Text,
} from "@chakra-ui/react";
import ProgressLoader from "@/components/ProgressLoader";
import {
  BreadcrumbCurrentLink,
  BreadcrumbLink,
  BreadcrumbRoot,
} from "@/components/ui/breadcrumb";
import {
  MdAdd,
  MdChevronRight,
  MdMoreVert,
  MdOutlineFolder,
} from "react-icons/md";
import { CircleFlag } from "react-circle-flags";
import DataTableCore from "@/components/ui/data-table-core";
import {
  MenuContent,
  MenuItem,
  MenuRoot,
  MenuTrigger,
} from "@/components/ui/menu";
import { RiDeleteBin6Line } from "react-icons/ri";
import { Tag } from "@/components/ui/tag";
import { BsDownload } from "react-icons/bs";
import { TagMapping } from "./index";
import DeleteCityModal from "@/app/[lng]/organization/[id]/account-settings/project/deleteCityModal";
import { TFunction } from "i18next";

const getInventoryLastUpdated = (lastUpdated: Date, t: Function) => {
  if (!lastUpdated || isNaN(new Date(lastUpdated).getTime())) {
    return <p>{t("no-date-available")}</p>;
  }
  return <p>{new Date(lastUpdated).toLocaleDateString()}</p>;
};

interface ProjectDetailsProps {
  t: TFunction;
  lng: string;
  router: any;
  selectedCity: string | null;
  selectedProjectData: ProjectWithCities | null | undefined;
  selectedCityData:
    | {
        cityId: string;
        name: string;
        countryLocode: string;
        inventories: {
          inventoryId: string;
          year: number;
          lastUpdated: string;
        }[];
      }
    | undefined;
  organizationName?: string;
  projectUsers: ProjectUserResponse[] | undefined;
  userList: ProjectUserResponse[] | undefined;
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
}) => {
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [cityToDelete, setCityToDelete] = useState<{
    cityName: string;
    cityId: string;
    countryName: string;
  } | null>(null);
  return (
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
                      onClick={() => {
                        setSelectedCity(null);
                        setTabValue("city");
                      }}
                      color="content.tertiary"
                      fontWeight="normal"
                      truncate
                      cursor="pointer"
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
            background="base.light"
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
                  <Text
                    fontSize="title.md"
                    fontStyle="normal"
                    lineHeight="24px"
                  >
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
                  <Text
                    fontSize="title.md"
                    fontStyle="normal"
                    lineHeight="24px"
                  >
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
                            onClick={() => {
                              setIsDeleteModalOpen(true);
                              setCityToDelete({
                                cityName: item.name,
                                cityId: item.cityId,
                                countryName: item.countryLocode,
                              });
                            }}
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
                data={userList ?? []}
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
      <DeleteCityModal
        t={t}
        cityName={cityToDelete?.cityName as string}
        cityId={cityToDelete?.cityId as string}
        countryName={cityToDelete?.countryName as string}
        isOpen={isDeleteModalOpen}
        onClose={() => {
          setIsDeleteModalOpen(false);
          setCityToDelete(null);
        }}
        onOpenChange={setIsDeleteModalOpen}
      />
    </Box>
  );
};

export default ProjectDetails;
