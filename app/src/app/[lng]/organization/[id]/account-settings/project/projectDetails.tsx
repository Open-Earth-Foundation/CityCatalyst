import {
  CityResponse,
  OrganizationRole,
  ProjectUserResponse,
  ProjectWithCities,
  Roles,
} from "@/util/types";
import React, { useEffect, useState } from "react";
import {
  Box,
  Button,
  Flex,
  HStack,
  Icon,
  IconButton,
  Table,
  useDisclosure,
  Tabs,
  Text,
} from "@chakra-ui/react";
import ProgressLoader from "@/components/ProgressLoader";
import { MdMoreVert, MdOutlineFolder } from "react-icons/md";
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
import DownloadButton from "@/components/GHGIHomePage/DownloadButton";
import InventoryView from "./InventoryView";
import { FiFolder } from "react-icons/fi";
import ProjectHeader from "./projectHeader";
import DeleteInventoryModal from "@/components/Modals/delete-inventory-modal";
import { UserAttributes } from "@/models/User";
import RemoveUserModal from "@/app/[lng]/admin/organization/[id]/team/RemoveUserModal";
import { useOrganizationContext } from "@/hooks/organization-context-provider/use-organizational-context";

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
  selectedCityData: CityResponse | undefined;
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
  const [isDeleteUserModalOpen, setIsDeleteUserModal] = useState(false);
  const [cityToDelete, setCityToDelete] = useState<{
    cityName: string;
    cityId: string;
    countryName: string;
  } | null>(null);

  const [inventoryToDelete, setInventoryToDelete] = useState<string | null>(
    null,
  );

  const [selectedInventory, setSelectedInventory] = useState<{
    inventoryId: string;
    year: number;
  } | null>(null);

  const {
    open: isInventoryDeleteModalOpen,
    onOpen: onInventoryDeleteModalOpen,
    onClose: onInventoryDeleteModalClose,
  } = useDisclosure();

  useEffect(() => {
    setSelectedCity(null);
  }, [selectedProjectData, setSelectedCity]);

  useEffect(() => {
    setSelectedInventory(null);
  }, [selectedCityData]);

  const [userData, setUserData] = useState<UserAttributes>({
    email: "",
    userId: "",
    name: "",
    role: Roles.User,
  });

  const { isFrozenCheck } = useOrganizationContext();

  if (isLoadingProjectUsers) {
    return <ProgressLoader />;
  }

  return (
    <Box w="full">
      <Box backgroundColor="white" p={6} rounded={2} mt={12}>
        <ProjectHeader
          t={t}
          lng={lng}
          selectedProjectData={selectedProjectData}
          selectedInventory={selectedInventory}
          selectedCityData={selectedCityData}
          onSetSelectedCity={setSelectedCity}
          setSelectedInventory={setSelectedInventory}
        />
        {selectedInventory ? (
          <InventoryView
            inventoryId={selectedInventory.inventoryId}
            cityLocode={selectedCityData?.locode as string}
            inventoryYear={selectedInventory.year}
            cityId={selectedCityData?.cityId as string}
            t={t}
            city={selectedCityData as CityResponse} // Still need to pass full city data
            lng={lng}
          />
        ) : (
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
                          textOverflow="ellipsis"
                          overflow="hidden"
                          whiteSpace="nowrap"
                          textTransform="capitalize"
                          textDecoration="underline"
                          fontSize="label.lg"
                        >
                          {item.name}
                        </Text>
                      </Button>
                    </Table.Cell>
                    <Table.Cell>{item.inventories.length}</Table.Cell>
                    <Table.Cell w="10">
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
                              if (isFrozenCheck()) {
                                return;
                              }
                              setIsDeleteModalOpen(true);
                              setCityToDelete({
                                cityName: item.name,
                                cityId: item.cityId,
                                countryName: item.countryLocode,
                              });
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
                    <Table.Cell w="10">
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
            </Tabs.Content>
            <Tabs.Content value="inventories">
              <Text
                color="content.tertiary"
                mb={2}
                mt={6}
                textTransform="uppercase"
                fontWeight="bold"
              >
                {t("all-inventory-years")}
              </Text>
              <DataTableCore
                data={selectedCityData?.inventories ?? []}
                columns={[
                  { header: t("year"), accessor: "year" },
                  { header: t("last-updated"), accessor: "lastUpdated" },
                ]}
                renderRow={(item, idx) => (
                  <Table.Row key={idx}>
                    <Table.Cell>
                      <Button
                        variant="ghost"
                        onClick={() => {
                          setSelectedInventory({
                            inventoryId: item.inventoryId,
                            year: item.year,
                          });
                        }}
                      >
                        <Flex gap={2} alignItems="center" w="300px">
                          <Icon
                            as={MdOutlineFolder}
                            color="content.tertiary"
                            size="lg"
                          />
                          <Text
                            color="content.link"
                            fontWeight="normal"
                            textOverflow="ellipsis"
                            overflow="hidden"
                            whiteSpace="nowrap"
                            textTransform="capitalize"
                            textDecoration="underline"
                            fontSize="label.lg"
                          >
                            {item.year}
                          </Text>
                        </Flex>
                      </Button>
                    </Table.Cell>
                    <Table.Cell>
                      <HStack gap={6} justifyContent="space-between">
                        {getInventoryLastUpdated(new Date(item.lastUpdated), t)}
                        <DownloadButton
                          lng={lng}
                          inventoryId={item.inventoryId}
                          city={selectedCityData}
                          inventory={item}
                        >
                          <IconButton
                            data-testid="download-inventory-icon"
                            aria-label="more-icon"
                            variant="ghost"
                            color="content.tertiary"
                          >
                            <Icon as={BsDownload} size="lg" />
                          </IconButton>
                        </DownloadButton>
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
                              value={t("open-inventory")}
                              valueText={t("open-inventory")}
                              p="16px"
                              display="flex"
                              alignItems="center"
                              gap="16px"
                              _hover={{ bg: "content.link", cursor: "pointer" }}
                              className="group"
                              onClick={() => {
                                setSelectedInventory({
                                  inventoryId: item.inventoryId,
                                  year: item.year,
                                });
                              }}
                            >
                              <Icon
                                _groupHover={{
                                  color: "white",
                                }}
                                color="content.secondary"
                                as={FiFolder}
                                h="24px"
                                w="24px"
                              />
                              <Text
                                _groupHover={{
                                  color: "white",
                                }}
                                color="content.primary"
                              >
                                {t("open-inventory")}
                              </Text>
                            </MenuItem>
                            <MenuItem
                              value={t("delete-inventory")}
                              valueText={t("delete-inventory")}
                              p="16px"
                              display="flex"
                              alignItems="center"
                              gap="16px"
                              _hover={{ bg: "content.link", cursor: "pointer" }}
                              className="group"
                              onClick={() => {
                                if (isFrozenCheck()) {
                                  return;
                                }
                                setInventoryToDelete(item.inventoryId);
                                onInventoryDeleteModalOpen();
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
                                {t("delete-inventory")}
                              </Text>
                            </MenuItem>
                          </MenuContent>
                        </MenuRoot>
                      </HStack>
                    </Table.Cell>
                  </Table.Row>
                )}
              />
            </Tabs.Content>
          </Tabs.Root>
        )}
      </Box>
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
      <DeleteInventoryModal
        inventoryId={inventoryToDelete as string}
        isOpen={isInventoryDeleteModalOpen}
        onClose={onInventoryDeleteModalClose}
        userData={userData}
        t={t}
      />
    </Box>
  );
};

export default ProjectDetails;
