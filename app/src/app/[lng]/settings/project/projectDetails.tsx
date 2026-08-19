import { CityResponse, ProjectWithCities, Roles } from "@/util/types";
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
  Text,
} from "@chakra-ui/react";
import ProgressLoader from "@/components/ProgressLoader";
import { MdMoreVert, MdOutlineFolder } from "react-icons/md";
import DataTableAlt from "@/components/ui/data-table-alt";
import {
  MenuContent,
  MenuItem,
  MenuRoot,
  MenuTrigger,
} from "@/components/ui/menu";
import { RiDeleteBin6Line } from "react-icons/ri";
import { BsDownload } from "react-icons/bs";
import DeleteCityModal from "@/app/[lng]/settings/project/deleteCityModal";
import { TFunction } from "i18next";
import DownloadButton from "@/components/GHGIHomePage/DownloadButton";
import InventoryView from "./InventoryView";
import { FiFolder } from "react-icons/fi";
import ProjectHeader from "./projectHeader";
import DeleteInventoryModal from "@/components/Modals/delete-inventory-modal";
import { UserAttributes } from "@/models/User";
import { useOrganizationContext } from "@/hooks/organization-context-provider/use-organizational-context";

const getInventoryLastUpdated = (
  lastUpdated: Date | string | null,
  t: TFunction,
) => {
  if (!lastUpdated || isNaN(new Date(lastUpdated).getTime())) {
    return <Text color="content.primary">{t("no-date-available")}</Text>;
  }
  return (
    <Text color="content.primary">
      {new Date(lastUpdated).toLocaleDateString()}
    </Text>
  );
};

interface ProjectDetailsProps {
  t: TFunction;
  lng: string;
  selectedProjectData: ProjectWithCities | null | undefined;
  selectedCityData: CityResponse | undefined;
  isLoadingProjectUsers: boolean;
  setSelectedCity: (value: string | null) => void;
}

const ProjectDetails: React.FC<ProjectDetailsProps> = ({
  t,
  lng,
  selectedProjectData,
  selectedCityData,
  isLoadingProjectUsers,
  setSelectedCity,
}) => {
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
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

  const [userData] = useState<UserAttributes>({
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
          inventoryYear={selectedInventory.year}
          cityId={selectedCityData?.cityId as string}
          t={t}
          city={selectedCityData as CityResponse} // Still need to pass full city data
          lng={lng}
        />
      ) : !selectedCityData ? (
        <DataTableAlt
          data={selectedProjectData?.cities ?? []}
          columns={[
            { header: t("name"), accessor: "name", width: "50%" },
            { header: t("inventories"), accessor: null, width: "35%" },
            { header: "", accessor: null, width: "15%" },
          ]}
          renderRow={(item, idx) => (
            <Table.Row key={idx} fontFamily="body">
              <Table.Cell maxW="0" title={item.name}>
                <Button
                  variant="ghost"
                  color="content.primary"
                  onClick={() => setSelectedCity(item.cityId)}
                  px={0}
                  h="auto"
                  minH="unset"
                >
                  <Text
                    truncate
                    color="content.link"
                    fontWeight="normal"
                    textTransform="capitalize"
                    textDecoration="underline"
                    fontSize="body.md"
                  >
                    {item.name}
                  </Text>
                </Button>
              </Table.Cell>
              <Table.Cell>
                <Text color="content.primary" fontSize="body.md">
                  {item.inventories.length}
                </Text>
              </Table.Cell>
              <Table.Cell textAlign="right">
                <MenuRoot>
                  <MenuTrigger asChild>
                    <IconButton
                      data-testid="activity-more-icon"
                      aria-label="more-icon"
                      variant="ghost"
                      color="content.tertiary"
                      _hover={{ bg: "background.controlHover" }}
                      _expanded={{ bg: "background.controlHover" }}
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
                        color="sentiment.negativeDefault"
                        as={RiDeleteBin6Line}
                        h="24px"
                        w="24px"
                        _groupHover={{
                          color: "white",
                        }}
                      />
                      <Text
                        color="content.primary"
                        _groupHover={{
                          color: "white",
                        }}
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
      ) : (
        <DataTableAlt
          data={selectedCityData?.inventories ?? []}
          title={t("inventories")}
          columns={[
            { header: t("inventory-year"), accessor: "year", width: "40%" },
            {
              header: t("last-updated"),
              accessor: "lastUpdated",
              width: "45%",
            },
            { header: "", accessor: null, width: "15%" },
          ]}
          renderRow={(item, idx) => (
            <Table.Row key={idx} fontFamily="body">
              <Table.Cell maxW="0" title={String(item.year)}>
                <Button
                  variant="ghost"
                  onClick={() => {
                    setSelectedInventory({
                      inventoryId: item.inventoryId,
                      year: item.year ?? 0,
                    });
                  }}
                  px={0}
                  h="auto"
                  minH="unset"
                >
                  <Flex gap={2} alignItems="center" maxW="100%">
                    <Icon
                      as={MdOutlineFolder}
                      color="content.tertiary"
                      size="lg"
                      flexShrink={0}
                    />
                    <Text
                      truncate
                      color="content.link"
                      fontWeight="normal"
                      textTransform="capitalize"
                      textDecoration="underline"
                      fontSize="body.md"
                    >
                      {item.year}
                    </Text>
                  </Flex>
                </Button>
              </Table.Cell>
              <Table.Cell>
                {getInventoryLastUpdated(item.lastUpdated ?? null, t)}
              </Table.Cell>
              <Table.Cell textAlign="right">
                <HStack gap={1} justifyContent="flex-end">
                  <DownloadButton
                    lng={lng}
                    inventoryId={item.inventoryId}
                    city={selectedCityData}
                    inventory={item}
                  >
                    <IconButton
                      data-testid="download-inventory-icon"
                      aria-label="download-inventory"
                      variant="ghost"
                      color="content.tertiary"
                      _hover={{ bg: "background.controlHover" }}
                    >
                      <Icon as={BsDownload} size="lg" />
                    </IconButton>
                  </DownloadButton>
                  <MenuRoot>
                    <MenuTrigger asChild>
                      <IconButton
                        data-testid="activity-more-icon"
                        aria-label="more-icon"
                        variant="ghost"
                        color="content.tertiary"
                        _hover={{ bg: "background.controlHover" }}
                        _expanded={{ bg: "background.controlHover" }}
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
                            year: item.year ?? 0,
                          });
                        }}
                      >
                        <Icon
                          color="content.secondary"
                          as={FiFolder}
                          h="24px"
                          w="24px"
                          _groupHover={{
                            color: "white",
                          }}
                        />
                        <Text
                          color="content.primary"
                          _groupHover={{
                            color: "white",
                          }}
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
                          color="sentiment.negativeDefault"
                          as={RiDeleteBin6Line}
                          h="24px"
                          w="24px"
                          _groupHover={{
                            color: "white",
                          }}
                        />
                        <Text
                          color="content.primary"
                          _groupHover={{
                            color: "white",
                          }}
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
