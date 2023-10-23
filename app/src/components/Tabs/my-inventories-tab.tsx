"use client";

import {
  Avatar,
  Badge,
  Box,
  Button,
  Checkbox,
  IconButton,
  Input,
  InputGroup,
  InputLeftElement,
  List,
  ListItem,
  Popover,
  PopoverArrow,
  PopoverBody,
  PopoverContent,
  PopoverTrigger,
  Progress,
  Select,
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
import React, { FC, useEffect, useMemo, useState } from "react";
import FormInput from "../form-input";
import FormSelectInput from "../form-select-input";
import {
  AddIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  SearchIcon,
} from "@chakra-ui/icons";
import {
  MdFolder,
  MdMoreVert,
  MdOutlineFileDownload,
  MdOutlineFolder,
  MdOutlineIndeterminateCheckBox,
  MdOutlineModeEditOutline,
} from "react-icons/md";
import { FiTrash2 } from "react-icons/fi";
import { FaFileCsv } from "react-icons/fa";
import NextLink from "next/link";
import {
  CityData,
  ProfileInputs,
  UserDetails,
} from "@/app/[lng]/settings/page";
import { SubmitHandler, useForm } from "react-hook-form";
import { Session } from "next-auth";
import AddUserModal from "@/components/Modals/add-user-modal";
import UpdateUserModal from "@/components/Modals/update-user-modal";
import DeleteUserModal from "@/components/Modals/delete-user-modal";
import DeleteFileModal from "@/components/Modals/delete-file-modal";

import DeleteCityModal from "@/components/Modals/delete-city-modal";
import { TFunction } from "i18next";
import DeleteInventoryModal from "../Modals/delete-inventory-modal";

interface MyInventoriesTabProps {
  session: Session | null;
  status: "loading" | "authenticated" | "unauthenticated";
  t: TFunction;
  lng: string;
}

const MyInventoriesTab: FC<MyInventoriesTabProps> = ({
  session,
  status,
  t,
  lng,
}) => {
  const [cities, setCities] = useState<Array<any>>([]);
  const [tabIndex, setTabIndex] = useState(0);

  useEffect(() => {
    const data = [
      {
        id: "1",
        name: "Test City 1",
        state: "Test Region",
        country: "Argentina",
        inventory: [
          {
            year: 2020,
            progress: "60",
            files: [
              {
                id: "1",
                fileName: "your_nov_2020_data_file.csv",
                sector: "Stationary Energy",
                status: "pending",

                lastUpdated: "22 November, 2022",
              },
              {
                id: "2",
                fileName: "your_dec_2020_data_file.csv",
                sector: "Transportion",
                status: "added to inventory",

                lastUpdated: "1 December, 2022",
              },
            ],
          },
          {
            year: 2021,
            progress: "30",
            files: [
              {
                id: "1",
                fileName: "20_data_file.csv",
                sector: "Stationay Energy",
                status: "pending",
                progress: "70",
                lastUpdated: "22 November, 2022",
              },
              {
                id: "2",
                fileName: "20_data_file.csv",
                sector: "Stationary Energy",
                status: "pending",
                progress: "70",
                lastUpdated: "22 November, 2022",
              },
            ],
          },
          {
            year: 2022,
            progress: "90",
            files: [
              {
                id: "1",
                fileName: "21_data_file.csv",
                status: "pending",
                lastUpdated: "22 November, 2021",
              },
              {
                id: "2",
                fileName: "21_data_file.csv",
                status: "pending",
                lastUpdated: "22 November, 2021",
              },
            ],
          },
        ],
        lastUpdated: "2023-10-10T12:05:41.340Z",
      },
    ];
    setCities(data);
  }, []);

  const years = cities
    .flatMap((city) => city.inventory.map((item: any) => item.year))
    .filter((year, index, self) => self.indexOf(year) === index)
    .sort();

  const {
    isOpen: isInventoryDeleteModalOpen,
    onOpen: onInventoryDeleteModalOpen,
    onClose: onInventoryDeleteModalClose,
  } = useDisclosure();

  const [userData, setUserData] = useState<UserDetails>({
    email: "",
    id: "",
    name: "",
    role: "",
  });

  const [cityData, setCityData] = useState<CityData>({
    id: "",
    name: "",
    state: "",
    country: "",
    lastUpdated: "",
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
              fontFamily="body"
              fontStyle="normal"
            >
              My Inventories
            </Text>
            <Text
              color="content.tertiary"
              fontWeight="normal"
              lineHeight="24"
              fontFamily="heading"
              fontSize="body.lg"
              letterSpacing="wide"
              marginTop="8px"
            >
              Here you can find all your inventories to edit or download.
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
            >
              City
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
                {cities.map(({ name, id, country, lastUpdated, state }) => (
                  <Tab
                    onClick={() =>
                      setCityData({ name, country, id, lastUpdated, state })
                    }
                    key={id}
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
                    {name}
                  </Tab>
                ))}
              </TabList>

              <TabPanels backgroundColor="background.default">
                {cities.map((city) => (
                  <TabPanel
                    key={city.id}
                    display="flex"
                    flexDirection="column"
                    gap="24px"
                    borderRadius="8px"
                  >
                    <Box>
                      <Box display="flex" gap="8px" alignItems="center">
                        <Avatar
                          className="h-[32px] w-[32px]"
                          name="Argentina"
                          src="https://upload.wikimedia.org/wikipedia/commons/1/1a/Flag_of_Argentina.svg"
                        />
                        <Text
                          color="content.primary"
                          fontWeight="semibold"
                          lineHeight="24"
                          fontSize="title.md"
                          fontFamily="body"
                          fontStyle="normal"
                        >
                          {cityData.name}
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
                        ALL INVENTORY YEARS
                      </Text>
                    </Box>
                    <Box display="flex" flexDirection="column" gap="24px">
                      <TableContainer w="783px">
                        <Table
                          variant="simple"
                          borderWidth="1px"
                          borderStyle="solid"
                          borderColor="border.neutral"
                        >
                          <Thead>
                            <Tr>
                              <Th>INVENTORY YEAR</Th>
                              <Th>STATUS</Th>
                              <Th isNumeric>LAST UPDATED</Th>
                            </Tr>
                          </Thead>
                          <Tbody
                            fontFamily="heading"
                            color="content.primary"
                            fontSize="body.md"
                          >
                            {years.map((year) => (
                              <Tr key={year}>
                                <Td
                                  display="flex"
                                  gap="16px"
                                  alignItems="center"
                                >
                                  <Box color="content.tertiary">
                                    <MdOutlineFolder size={24} />
                                  </Box>
                                  <Text>{year}</Text>
                                </Td>
                                {cities.map((city) => {
                                  const inventory = city.inventory.find(
                                    (item: any) => item.year === year,
                                  );

                                  if (inventory && inventory.progress) {
                                    return (
                                      <Td key={city.id}>
                                        <Progress
                                          value={inventory.progress}
                                          borderRadius="8px"
                                          colorScheme="baseStyle"
                                          height="8px"
                                          width="137px"
                                        />
                                      </Td>
                                    );
                                  }
                                })}
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
                                      w="239px"
                                      borderRadius="8px"
                                      shadow="2dp"
                                      borderWidth="1px"
                                      borderStyle="solid"
                                      borderColor="border.neutral"
                                      padding="10px"
                                      paddingLeft="0"
                                      paddingRight="0"
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
                                            paddingLeft="16px"
                                            paddingRight="16px"
                                            paddingTop="12px"
                                            paddingBottom="12px"
                                            _hover={{
                                              background: "content.link",
                                              color: "white",
                                            }}
                                            onClick={() => {
                                              alert(city.id);
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
                                              Download in CSV
                                            </Text>
                                          </ListItem>
                                          <ListItem
                                            display="flex"
                                            cursor="pointer"
                                            gap="16px"
                                            className="group "
                                            color="sentiment.negativeDefault"
                                            alignItems="center"
                                            paddingLeft="16px"
                                            paddingRight="16px"
                                            paddingTop="12px"
                                            paddingBottom="12px"
                                            _hover={{
                                              background: "content.link",
                                              color: "white",
                                            }}
                                            onClick={() => {
                                              setCityData(city);
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
                                              Delete Inventory
                                            </Text>
                                          </ListItem>
                                        </List>
                                      </PopoverBody>
                                    </PopoverContent>
                                  </Popover>
                                </Td>
                              </Tr>
                            ))}
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
        tf={t}
      />
    </>
  );
};

export default MyInventoriesTab;
