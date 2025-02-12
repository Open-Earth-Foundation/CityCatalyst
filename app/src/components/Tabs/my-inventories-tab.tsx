"use client";

import {
  Box,
  Icon,
  IconButton,
  List,
  Popover,
  PopoverArrow,
  PopoverBody,
  PopoverContent,
  PopoverTrigger,
  Progress,
  Tabs,
  Table,
  Text,
  useDisclosure,
} from "@chakra-ui/react";
import React, { FC, useEffect, useState } from "react";

import {
  MdMoreVert,
  MdOutlineFileDownload,
  MdOutlineFolder,
} from "react-icons/md";
import { FiTrash2 } from "react-icons/fi";

import type { TFunction } from "i18next";
import DeleteInventoryModal from "../Modals/delete-inventory-modal";
import type { UserAttributes } from "@/models/User";
import type { CityAttributes } from "@/models/City";
import { api } from "@/services/api";
import type { InventoryAttributes } from "@/models/Inventory";
import { CircleFlag } from "react-circle-flags";
import { Roles } from "@/util/types";
import SettingsSkeleton from "../Skeletons/settings-skeleton";

interface MyInventoriesTabProps {
  t: TFunction;
  lng: string;
  cities: CityAttributes[] | any;
  defaultCityId?: string;
}

const MyInventoriesTab: FC<MyInventoriesTabProps> = ({
  t,
  lng,
  cities,
  defaultCityId,
}) => {
  const [cityId, setCityId] = useState<string | undefined>(defaultCityId);
  const [inventoryId, setInventoryId] = useState("");

  useEffect(() => {
    if (!cityId && defaultCityId && defaultCityId !== cityId) {
      setCityId(defaultCityId);
    }
  }, [defaultCityId, cityId]);

  const { data: inventories, isLoading: isInventoriesLoading } =
    api.useGetInventoriesQuery({ cityId: cityId! }, { skip: !cityId });

  const {
    open: isInventoryDeleteModalOpen,
    onOpen: onInventoryDeleteModalOpen,
    onClose: onInventoryDeleteModalClose,
  } = useDisclosure();

  const [userData, setUserData] = useState<UserAttributes>({
    email: "",
    userId: "",
    name: "",
    role: Roles.User,
  });

  return (
    <>
      <Tabs.Content value="my-inventories">
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
            {cities && cities.length > 0 ? (
              <Tabs.Root
                display="flex"
                flexDirection="row"
                variant="subtle"
                gap="36px"
                defaultValue={cities?.[0]?.cityId}
              >
                <Tabs.List display="flex" flexDirection="column" gap="12px">
                  {cities?.map((city: CityAttributes) => (
                    <Tabs.Trigger
                      value={city.cityId}
                      key={city.cityId}
                      onClick={() => setCityId(city?.cityId!)}
                      fontFamily="heading"
                      justifyContent={"left"}
                      letterSpacing={"wide"}
                      color="content.secondary"
                      lineHeight="20px"
                      fontStyle="normal"
                      fontSize="label.lg"
                      height="52px"
                      w={"223px"}
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

                {cities?.map((city: CityAttributes) => (
                  <Tabs.Content
                    backgroundColor="background.default"
                    onClick={() => setCityId(city.cityId)}
                    key={city.cityId}
                    value={city.cityId}
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
                      <Table.Root
                        variant="outline"
                        borderStyle="solid"
                        w="783px"
                        borderWidth="1px"
                        borderColor="border.overlay"
                        borderRadius="12px"
                      >
                        <Table.Header>
                          <Table.Row>
                            <Table.ColumnHeader />
                            <Table.ColumnHeader>
                              {t("inventory-year")}
                            </Table.ColumnHeader>
                            <Table.ColumnHeader>
                              {t("status")}
                            </Table.ColumnHeader>
                            <Table.ColumnHeader align="right">
                              {t("last-updated")}
                            </Table.ColumnHeader>
                          </Table.Row>
                        </Table.Header>
                        <Table.Body
                          fontFamily="heading"
                          color="content.primary"
                          fontSize="body.md"
                        >
                          {inventories?.map(
                            (inventory: InventoryAttributes) => (
                              <Table.Row key={inventory.inventoryId}>
                                <Table.Cell>
                                  <Box color="content.tertiary">
                                    <MdOutlineFolder size={24} />
                                  </Box>
                                </Table.Cell>
                                <Table.Cell>
                                  <Text>{inventory.year}</Text>
                                </Table.Cell>
                                <Table.Cell>
                                  {/* TODO */}
                                  {/* generate status from progress API */}
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
                                {/* TODO remove hardcoded date https://openearth.atlassian.net/browse/ON-3350 */}
                                <Table.Cell align="right">
                                  21 Sept, 2023
                                </Table.Cell>
                                <Table.Cell align="right">
                                  <Popover.Root lazyMount>
                                    <PopoverTrigger>
                                      <IconButton
                                        aria-label="action-button"
                                        variant="ghost"
                                        color="interactive.control"
                                        height="36px"
                                        width="36px"
                                      >
                                        <Icon as={MdMoreVert} boxSize={6} />
                                      </IconButton>
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
                                      pos="absolute"
                                    >
                                      <PopoverArrow />
                                      <PopoverBody padding="0">
                                        <List.Root padding="0">
                                          <List.Item
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
                                            <MdOutlineFileDownload size={24} />

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
                                          </List.Item>
                                          <List.Item
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
                                              setInventoryId(
                                                inventory.inventoryId,
                                              );
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
                                          </List.Item>
                                        </List.Root>
                                      </PopoverBody>
                                    </PopoverContent>
                                  </Popover.Root>
                                </Table.Cell>
                              </Table.Row>
                            ),
                          )}
                        </Table.Body>
                      </Table.Root>
                    </Box>
                  </Tabs.Content>
                ))}
              </Tabs.Root>
            ) : (
              <SettingsSkeleton />
            )}
          </Box>
        </Box>
      </Tabs.Content>

      <DeleteInventoryModal
        inventoryId={inventoryId}
        isOpen={isInventoryDeleteModalOpen}
        onClose={onInventoryDeleteModalClose}
        userData={userData}
        t={t}
      />
    </>
  );
};

export default MyInventoriesTab;
