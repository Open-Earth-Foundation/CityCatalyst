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
import { UserAttributes } from "@/models/User";

interface MyFilesTabProps {
  session: Session | null;
  status: "loading" | "authenticated" | "unauthenticated";
  t: TFunction;
  userInfo: UserAttributes;
  lng: string;
}

const MyFilesTab: FC<MyFilesTabProps> = ({
  session,
  status,
  t,
  lng,
  userInfo,
}) => {
  const [inputValue, setInputValue] = useState<string>("");
  const {
    handleSubmit,
    register,
    formState: { errors, isSubmitting },
    setValue,
  } = useForm<ProfileInputs>();
  useEffect(() => {
    if (session?.user && status === "authenticated") {
      setValue("name", session.user?.name!);
      setValue("city", "City");
      setValue("email", session.user.email!);
      setValue("role", "admin");
    }
  }, [setValue, session, status]);

  const onSubmit: SubmitHandler<ProfileInputs> = async (data) => {
    //  Todo
    // send data to api
  };

  const onInputChange = (e: any) => {
    setInputValue(e.target.value);
  };

  const [selectedUsers, setSelectedUsers] = useState<any>([]);

  const handleCheckboxChange = (userId: string, isChecked: boolean) => {
    if (isChecked) {
      setSelectedUsers((prev: any) => [...prev, userId]);
    } else {
      setSelectedUsers((prev: []) =>
        prev.filter((id: string) => id !== userId),
      );
    }
  };

  const [searchTerm, setSearchTerm] = useState<string>("");
  const [role, setRole] = useState<string>("");
  const [filteredUsers, setFilteredUsers] = useState<Array<UserDetails>>([]);
  const [filteredUsersByRole, setFilteredUsersByRole] = useState<
    Array<UserDetails>
  >([]);

  useEffect(() => {
    const users = [
      { id: "1", name: "John Doe", email: "john@example.com", role: "admin" },
      {
        id: "2",
        name: "Jane Smith",
        email: "jane@example.com",
        role: "contributor",
      },
    ];

    const result = users.filter(
      (users) =>
        users.name
          .toLocaleLowerCase()
          .includes(searchTerm.toLocaleLowerCase()) ||
        users.email
          .toLocaleLowerCase()
          .includes(searchTerm.toLocaleLowerCase()),
    );

    setFilteredUsers(result);
  }, [role, searchTerm]);

  useEffect(() => {
    const selectedUserByRole = filteredUsers.filter((users) =>
      users.role.toLocaleLowerCase().includes(role.toLocaleLowerCase()),
    );
    if (role !== "all") {
      setFilteredUsersByRole(selectedUserByRole);
    } else {
      setFilteredUsersByRole(filteredUsers);
    }
  }, [filteredUsers, role]);

  const [cities, setCities] = useState<Array<any>>([]);

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
            year: 2022,
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
    isOpen: isUserModalOpen,
    onOpen: onUserModalOpen,
    onClose: onUserModalClose,
  } = useDisclosure();
  const {
    isOpen: isUserUpdateModalOpen,
    onOpen: onUserUpdateModalOpen,
    onClose: onUserUpdateModalClose,
  } = useDisclosure();

  const {
    isOpen: isUserDeleteModalOpen,
    onOpen: onUserDeleteModalOpen,
    onClose: onUserDeleteModalClose,
  } = useDisclosure();

  const {
    isOpen: isCityDeleteModalOpen,
    onOpen: onCityDeleteModalOpen,
    onClose: onCityDeleteModalClose,
  } = useDisclosure();

  const {
    isOpen: isFileDeleteModalOpen,
    onOpen: onFileDeleteModalOpen,
    onClose: onFileDeleteModalClose,
  } = useDisclosure();

  const [userData, setUserData] = useState<UserAttributes>({
    email: "",
    userId: "",
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
  const [isYearSelected, setIsYearSelected] = useState<boolean>(false);
  const [inventoryYear, setInventoryYear] = useState<number | null>();
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
              {t("my-files")}
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
              {t("my-files-sub-title")}
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
              {t("city")}
            </Text>
            <Tabs
              display="flex"
              flexDirection="row"
              variant="soft-rounded"
              gap="36px"
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
                        onClick={() => {
                          setIsYearSelected(false);
                          setInventoryYear(null);
                        }}
                      >
                        {t("all-inventory-years")}{" "}
                      </Text>
                      <Text
                        color="content.link"
                        textDecoration="underline"
                        fontWeight="bold"
                        lineHeight="24"
                        fontSize="body.lg"
                        letterSpacing="widest"
                        marginTop="8px"
                        textTransform="uppercase"
                        cursor="pointer"
                      >
                        {isYearSelected && (
                          <>
                            <ChevronRightIcon color="content.tertiary" />{" "}
                            <span>{inventoryYear}</span>
                          </>
                        )}
                      </Text>
                    </Box>
                    <Box display="flex" flexDirection="column" gap="24px">
                      {!isYearSelected ? (
                        <TableContainer
                          borderWidth="1px"
                          borderColor="border.overlay"
                          borderRadius="12px"
                        >
                          <Table variant="simple" borderStyle="solid">
                            <Thead>
                              <Tr>
                                <Th>{t("inventory-year")}</Th>
                                <Th>{t("files")}</Th>
                                <Th isNumeric>{t("last-updated")}</Th>
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
                                    onClick={() => {
                                      setIsYearSelected(true);
                                      setInventoryYear(year);
                                    }}
                                    display="flex"
                                    gap="16px"
                                    alignItems="center"
                                    _hover={{
                                      textDecoration: "underline",
                                      cursor: "pointer",
                                      color: "content.link",
                                    }}
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

                                    if (
                                      inventory &&
                                      inventory.files.length > 0
                                    ) {
                                      return (
                                        <Td key={city.id}>
                                          {inventory &&
                                          inventory.files.length > 0
                                            ? inventory.files.length
                                            : "0"}{" "}
                                          file(s)
                                        </Td>
                                      );
                                    }
                                  })}
                                  <Td isNumeric>21 Sept, 2023</Td>
                                </Tr>
                              ))}
                            </Tbody>
                          </Table>
                        </TableContainer>
                      ) : (
                        <TableContainer
                          borderWidth="1px"
                          borderColor="border.overlay"
                          borderRadius="12px"
                        >
                          <Table variant="simple" borderStyle="solid">
                            <Thead>
                              <Tr>
                                <Th>{t("name")}</Th>
                                <Th>{t("sector")}</Th>
                                <Th>{t("status")}</Th>
                                <Th isNumeric>{t("last-updated")}</Th>
                              </Tr>
                            </Thead>
                            <Tbody
                              fontFamily="heading"
                              color="content.primary"
                              fontSize="body.md"
                            >
                              {cities.map((city) => {
                                const inventoryForSelectedYear =
                                  city.inventory.find(
                                    (item: any) => item.year === inventoryYear,
                                  );
                                if (!inventoryForSelectedYear) return null;

                                return inventoryForSelectedYear.files.map(
                                  (file: any) => (
                                    <Tr key={`${city.id}-${file.fileName}`}>
                                      <Td
                                        display="flex"
                                        gap="16px"
                                        alignItems="center"
                                      >
                                        <Box color="interactive.primary">
                                          <FaFileCsv size={24} />
                                        </Box>
                                        <span>{file.fileName}</span>
                                      </Td>
                                      <Td>{file.sector}</Td>
                                      <Td>
                                        <Badge
                                          color="blue"
                                          borderRadius="full"
                                          px="16px"
                                          paddingTop="4px"
                                          paddingBottom="4px"
                                          borderWidth="1px"
                                          borderStyle="solid"
                                          fontWeight="normal"
                                          textTransform="capitalize"
                                          letterSpacing="wide"
                                          fontSize="body.md"
                                          borderColor={
                                            file.status === "pending"
                                              ? "sentiment.warningDefault"
                                              : "interactive.tertiary"
                                          }
                                          textColor={
                                            file.status === "added to inventory"
                                              ? "interactive.tertiary"
                                              : "sentiment.warningDefault"
                                          }
                                          backgroundColor={
                                            file.status === "pending"
                                              ? "sentiment.warningOverlay"
                                              : "sentiment.positiveOverlay"
                                          }
                                        >
                                          {t(`${file.status}`)}
                                        </Badge>
                                      </Td>
                                      <Td
                                        isNumeric
                                        display="flex"
                                        gap="16px"
                                        alignItems="center"
                                        justifyContent="end"
                                      >
                                        <span>{file.lastUpdated}</span>
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
                                                  onClick={() => {
                                                    alert(city.id);
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
                                                    {t("download-file")}
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
                                                    setCityData(city);
                                                    onFileDeleteModalOpen();
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
                                                    {t("delete-file")}
                                                  </Text>
                                                </ListItem>
                                              </List>
                                            </PopoverBody>
                                          </PopoverContent>
                                        </Popover>
                                      </Td>
                                    </Tr>
                                  ),
                                );
                              })}
                            </Tbody>
                          </Table>
                        </TableContainer>
                      )}
                    </Box>
                  </TabPanel>
                ))}
              </TabPanels>
            </Tabs>
          </Box>
        </Box>
      </TabPanel>
      <DeleteFileModal
        isOpen={isFileDeleteModalOpen}
        onClose={onFileDeleteModalClose}
        userData={userData}
      />
    </>
  );
};

export default MyFilesTab;
