"use client";

import {
  Avatar,
  Box,
  IconButton,
  List,
  ListItem,
  Popover,
  PopoverArrow,
  PopoverBody,
  PopoverContent,
  PopoverTrigger,
  Progress,
  Tab,
  TabList,
  TabPanel,
  TabPanels,
  Table,
  TableContainer,
  Tabs,
  Tbody,
  Td,
  Text,
  Th,
  Thead,
  Tr,
  useDisclosure,
} from "@chakra-ui/react";
import React, { FC, useEffect, useState } from "react";

import {
  MdMoreVert,
  MdOutlineFileDownload,
  MdOutlineFolder,
} from "react-icons/md";
import { FiTrash2 } from "react-icons/fi";

import type { Session } from "next-auth";

import type { TFunction } from "i18next";
import DeleteInventoryModal from "../Modals/delete-inventory-modal";
import type { UserAttributes } from "@/models/User";
import type { CityAttributes } from "@/models/City";
import { api } from "@/services/api";
import type { InventoryAttributes } from "@/models/Inventory";
import { CircleFlag } from "react-circle-flags";

interface MyInventoriesTabProps {
  session: Session | null;
  status: "loading" | "authenticated" | "unauthenticated";
  t: TFunction;
  lng: string;
  cities: CityAttributes[] | any;
  defaultCityId?: string;
}

const MyInventoriesTab: FC<MyInventoriesTabProps> = ({
  session,
  status,
  t,
  lng,
  cities,
  defaultCityId,
}) => {
  const [tabIndex, setTabIndex] = useState(0);
  const [cityId, setCityId] = useState<string | undefined>(defaultCityId);
  useEffect(() => {
    if (!cityId && defaultCityId && defaultCityId !== cityId) {
      setCityId(defaultCityId);
    }
  }, [defaultCityId, cityId]);

  const { data: inventories, isLoading: isInventoriesLoading } =
    api.useGetInventoriesQuery({ cityId: cityId! }, { skip: !cityId });

  const {
    isOpen: isInventoryDeleteModalOpen,
    onOpen: onInventoryDeleteModalOpen,
    onClose: onInventoryDeleteModalClose,
  } = useDisclosure();

  const [userData, setUserData] = useState<UserAttributes>({
    email: "",
    userId: "",
    name: "",
    role: "",
  });

  return (
    <>
      <TabPanel>
        <Box display="flex" flexDirection="column" gap="48px" marginTop="32px">
          <Box>
            <Text
              color="content.primary"
              fontWeight="bold"
              lineHeight="32"
              fontSize="headline.sm"
              fontFamily="heading"
              fontStyle="normal"
            >
              {t("my-inventories")}
            </Text>
            <Text
              color="content.tertiary"
              fontWeight="normal"
              lineHeight="24"
              fontSize="body.lg"
              letterSpacing="wide"
              marginTop="8px"
            >
              {t("my-inventories-sub-title")}
            </Text>
          </Box>

          <Box display="flex" flexDirection="column" gap="12px">
            <Text
              color="content.secondary"
              fontWeight="semibold"
              lineHeight="24"
              fontSize="title.md"
              letterSpacing="wide"
              marginTop="8px"
              fontFamily="heading"
            >
              {t("city")}
            </Text>
            <Tabs
              display="flex"
              flexDirection="row"
              variant="soft-rounded"
              gap="36px"
              index={tabIndex}
              onChange={(index) => setTabIndex(index)}
            >
              <TabList display="flex" flexDirection="column" gap="12px">
                {cities?.map((city: CityAttributes) => (
                  <Tab
                    key={city.cityId}
                    onClick={() => setCityId(city?.cityId!)}
                    sx={{
                      w: "223px",
                      justifyContent: "left",
                      h: "52px",
                      letterSpacing: "wide",
                      color: "content.secondary",
                      lineHeight: "20px",
                      fontStyle: "normal",
                      fontSize: "label.lg",
                      fontWeight: "medium",
                      fontFamily: "heading",
                    }}
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
                  </Tab>
                ))}
              </TabList>

              <TabPanels backgroundColor="background.default">
                {cities?.map((city: CityAttributes) => (
                  <TabPanel
                    onClick={() => setCityId(city.cityId)}
                    key={city.cityId}
                    display="flex"
                    flexDirection="column"
                    gap="24px"
                    borderRadius="8px"
                  >
                    <Box>
                      <Box display="flex" gap="8px" alignItems="center">
                        <CircleFlag
                          countryCode={city.countryLocode?.toLocaleLowerCase()!}
                          height="32px"
                          width="32px"
                        />
                        <Text
                          color="content.secondary"
                          fontWeight="semibold"
                          lineHeight="24"
                          fontSize="title.md"
                          fontFamily="heading"
                          fontStyle="normal"
                        >
                          {city.name}
                        </Text>
                      </Box>
                    </Box>
                    <Box display="flex">
                      <Text
                        color="content.tertiary"
                        fontWeight="bold"
                        lineHeight="24"
                        fontSize="body.lg"
                        letterSpacing="widest"
                        marginTop="8px"
                        textTransform="uppercase"
                        cursor="pointer"
                      >
                        {t("all-inventory-years")}
                      </Text>
                    </Box>
                    <Box display="flex" flexDirection="column" gap="24px">
                      <TableContainer
                        w="783px"
                        borderWidth="1px"
                        borderColor="border.overlay"
                        borderRadius="12px"
                      >
                        <Table variant="simple" borderStyle="solid">
                          <Thead>
                            <Tr>
                              <Th></Th>
                              <Th>{t("inventory-year")}</Th>
                              <Th>{t("status")}</Th>
                              <Th isNumeric>{t("last-updated")}</Th>
                            </Tr>
                          </Thead>
                          <Tbody
                            fontFamily="heading"
                            color="content.primary"
                            fontSize="body.md"
                          >
                            {inventories?.map(
                              (inventory: InventoryAttributes) => (
                                <Tr key={inventory.inventoryId}>
                                  <Td>
                                    <Box color="content.tertiary">
                                      <MdOutlineFolder size={24} />
                                    </Box>
                                  </Td>
                                  <Td>
                                    <Text>{inventory.year}</Text>
                                  </Td>

                                  <Td>
                                    {/* TODO */}
                                    {/* generate status from progress API */}
                                    <Progress
                                      value={0}
                                      borderRadius="8px"
                                      colorScheme="baseStyle"
                                      height="8px"
                                      width="137px"
                                    />
                                  </Td>

                                  <Td isNumeric>21 Sept, 2023</Td>
                                  <Td isNumeric>
                                    <Popover isLazy>
                                      <PopoverTrigger>
                                        <IconButton
                                          aria-label="action-button"
                                          variant="ghost"
                                          color="interactive.control"
                                          height="36px"
                                          width="36px"
                                          icon={<MdMoreVert size={24} />}
                                        ></IconButton>
                                      </PopoverTrigger>
                                      <PopoverContent
                                        h="128px"
                                        w="260px"
                                        borderRadius="8px"
                                        shadow="2dp"
                                        borderWidth="1px"
                                        borderStyle="solid"
                                        borderColor="border.neutral"
                                        padding="10px"
                                        px="0"
                                      >
                                        <PopoverArrow />
                                        <PopoverBody padding="0">
                                          <List padding="0">
                                            <ListItem
                                              className="group "
                                              display="flex"
                                              cursor="pointer"
                                              gap="16px"
                                              color="content.tertiary"
                                              alignItems="center"
                                              px="16px"
                                              paddingTop="12px"
                                              paddingBottom="12px"
                                              _hover={{
                                                background: "content.link",
                                                color: "white",
                                              }}
                                            >
                                              <MdOutlineFileDownload
                                                size={24}
                                              />

                                              <Text
                                                color="content.secondary"
                                                fontFamily="heading"
                                                letterSpacing="wide"
                                                fontWeight="normal"
                                                fontSize="body.lg"
                                                className="group group-hover:text-white"
                                              >
                                                {t("download-csv")}
                                              </Text>
                                            </ListItem>
                                            <ListItem
                                              display="flex"
                                              cursor="pointer"
                                              gap="16px"
                                              className="group "
                                              color="sentiment.negativeDefault"
                                              alignItems="center"
                                              px="16px"
                                              paddingTop="12px"
                                              paddingBottom="12px"
                                              _hover={{
                                                background: "content.link",
                                                color: "white",
                                              }}
                                              onClick={() => {
                                                onInventoryDeleteModalOpen();
                                              }}
                                            >
                                              <FiTrash2 size={24} />
                                              <Text
                                                color="content.secondary"
                                                fontFamily="heading"
                                                letterSpacing="wide"
                                                fontWeight="normal"
                                                fontSize="body.lg"
                                                className="group group-hover:text-white"
                                              >
                                                {t("delete-inventory")}
                                              </Text>
                                            </ListItem>
                                          </List>
                                        </PopoverBody>
                                      </PopoverContent>
                                    </Popover>
                                  </Td>
                                </Tr>
                              ),
                            )}
                          </Tbody>
                        </Table>
                      </TableContainer>
                    </Box>
                  </TabPanel>
                ))}
              </TabPanels>
            </Tabs>
          </Box>
        </Box>
      </TabPanel>

      <DeleteInventoryModal
        isOpen={isInventoryDeleteModalOpen}
        onClose={onInventoryDeleteModalClose}
        userData={userData}
        lng={lng}
        t={t}
      />
    </>
  );
};

export default MyInventoriesTab;
