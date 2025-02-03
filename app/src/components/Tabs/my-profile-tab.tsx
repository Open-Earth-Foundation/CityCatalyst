"use client";

import { ProfileInputs } from "@/app/[lng]/[inventory]/settings/page";
import AddUserModal from "@/components/Modals/add-user-modal";
import DeleteUserModal from "@/components/Modals/delete-user-modal";
import UpdateUserModal from "@/components/Modals/update-user-modal";
import {
  AddIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  SearchIcon,
} from "@chakra-ui/icons";
import {
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
  useToast,
} from "@chakra-ui/react";
import { Session } from "next-auth";
import NextLink from "next/link";
import { FC, useEffect, useState } from "react";
import { SubmitHandler, useForm } from "react-hook-form";
import { FiTrash2 } from "react-icons/fi";
import {
  MdCheckCircleOutline,
  MdDomain,
  MdMoreVert,
  MdOutlineFileDownload,
  MdOutlineIndeterminateCheckBox,
  MdOutlineModeEditOutline,
} from "react-icons/md";
import FormInput from "../form-input";
import FormSelectInput from "../form-select-input";

import DeleteCityModal from "@/components/Modals/delete-city-modal";
import { CityAttributes } from "@/models/City";
import { UserAttributes } from "@/models/User";
import { api, useSetCurrentUserDataMutation } from "@/services/api";
import { TFunction } from "i18next";
import EmailInput from "../email-input";

interface MyProfileTabProps {
  session: Session | null;
  status: "loading" | "authenticated" | "unauthenticated";
  t: TFunction;
  lng: string;
  userInfo: UserAttributes | any;
  cityUsers: UserAttributes[] | any;
  cities: CityAttributes[] | any;
  defaultCityId: string | undefined;
}

const MyProfileTab: FC<MyProfileTabProps> = ({
  session,
  status,
  t,
  lng,
  userInfo,
  cityUsers,
  cities,
  defaultCityId,
}) => {
  const [inputValue, setInputValue] = useState<string>("");
  const {
    handleSubmit,
    register,
    formState: { errors, isSubmitting },
    setValue,
  } = useForm<ProfileInputs>();

  useEffect(() => {
    if (userInfo) {
      setValue("name", userInfo.name);
      setValue("city", "City");
      setValue("email", userInfo.email!);
      setValue("role", userInfo.role);
    }
  }, [setValue, session, status, userInfo]);

  const [setCurrentUserData] = useSetCurrentUserDataMutation();
  const toast = useToast();
  const onSubmit: SubmitHandler<ProfileInputs> = async (data) => {
    await setCurrentUserData({
      cityId: defaultCityId!,
      userId: userInfo.userId,
      name: data.name,
      email: data.email,
      role: data.role,
    }).then(() =>
      toast({
        description: "User details updated!",
        status: "success",
        duration: 5000,
        isClosable: true,
        render: () => (
          <Box
            display="flex"
            gap="8px"
            color="white"
            alignItems="center"
            justifyContent="space-between"
            p={3}
            bg="interactive.primary"
            width="600px"
            height="60px"
            borderRadius="8px"
          >
            <Box display="flex" gap="8px" alignItems="center">
              <MdCheckCircleOutline fontSize="24px" />

              <Text
                color="base.light"
                fontWeight="bold"
                lineHeight="52"
                fontSize="label.lg"
              >
                User details updated
              </Text>
            </Box>
          </Box>
        ),
      }),
    );
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
  const [filteredUsers, setFilteredUsers] = useState<Array<UserAttributes>>([]);
  const [filteredUsersByRole, setFilteredUsersByRole] = useState<
    Array<UserAttributes>
  >([]);

  useEffect(() => {
    if (cityUsers) {
      const result = cityUsers.filter(
        (users: any) =>
          users.name
            .toLocaleLowerCase()
            .includes(searchTerm.toLocaleLowerCase()) ||
          users.email
            .toLocaleLowerCase()
            .includes(searchTerm.toLocaleLowerCase()),
      );

      setFilteredUsers(result);
    }
  }, [role, searchTerm, cityUsers]);

  useEffect(() => {
    const selectedUsersByRole = filteredUsers.filter((users) =>
      users?.role?.toLocaleLowerCase().includes(role.toLocaleLowerCase()),
    );
    if (role !== "all") {
      setFilteredUsersByRole(selectedUsersByRole);
    } else {
      setFilteredUsersByRole(filteredUsers);
    }
  }, [filteredUsers, role]);

  const {
    open: isUserModalOpen,
    onOpen: onUserModalOpen,
    onClose: onUserModalClose,
  } = useDisclosure();
  const {
    open: isUserUpdateModalOpen,
    onOpen: onUserUpdateModalOpen,
    onClose: onUserUpdateModalClose,
  } = useDisclosure();

  const {
    open: isUserDeleteModalOpen,
    onOpen: onUserDeleteModalOpen,
    onClose: onUserDeleteModalClose,
  } = useDisclosure();

  const {
    open: isCityDeleteModalOpen,
    onOpen: onCityDeleteModalOpen,
    onClose: onCityDeleteModalClose,
  } = useDisclosure();

  const [userData, setUserData] = useState<UserAttributes>({
    email: "",
    userId: "",
    name: "",
    role: "",
  });

  const [cityData, setCityData] = useState<CityAttributes>({
    cityId: "",
    name: "",
    region: "",
    country: "",
    lastUpdated: undefined,
  });

  const [removeUser] = api.useRemoveUserMutation();
  const handleDeleteUsers = async () => {
    selectedUsers.map(async (user: string) => {
      await removeUser({
        userId: user,
        cityId: defaultCityId!,
      }).then((res: any) => {
        if (res.data.deleted) {
          toast({
            description: "User details updated!",
            status: "success",
            duration: 5000,
            isClosable: true,
            render: () => (
              <Box
                display="flex"
                gap="8px"
                color="white"
                alignItems="center"
                justifyContent="space-between"
                p={3}
                bg="interactive.primary"
                width="600px"
                height="60px"
                borderRadius="8px"
              >
                <Box display="flex" gap="8px" alignItems="center">
                  <MdCheckCircleOutline fontSize="24px" />

                  <Text
                    color="base.light"
                    fontWeight="bold"
                    lineHeight="52"
                    fontSize="label.lg"
                  >
                    {t("users-deleted-from-city")}
                  </Text>
                </Box>
              </Box>
            ),
          });
        }
      });
    });
  };

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
              {t("my-profile")}
            </Text>
            <Text
              color="content.tertiary"
              fontWeight="normal"
              lineHeight="24"
              fontSize="body.lg"
              letterSpacing="wide"
              marginTop="8px"
            >
              {t("my-profile-sub-title")}
            </Text>
          </Box>
          <Box>
            <Tabs
              display="flex"
              flexDirection="row"
              variant="soft-rounded"
              gap="36px"
            >
              <TabList display="flex" flexDirection="column" gap="12px">
                <Tab
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
                  {t("account-details")}
                </Tab>
                <Tab
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
                  {t("users")}
                </Tab>
                <Tab
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
                  {t("city")}
                </Tab>
              </TabList>

              <TabPanels backgroundColor="background.default">
                <TabPanel
                  display="flex"
                  flexDirection="column"
                  gap="36px"
                  borderRadius="8px"
                >
                  <Box>
                    <Text
                      color="content.primary"
                      fontWeight="semibold"
                      lineHeight="24"
                      fontSize="title.md"
                      fontFamily="heading"
                      fontStyle="normal"
                    >
                      {t("account-details")}
                    </Text>
                    <Text
                      color="content.tertiary"
                      fontWeight="normal"
                      lineHeight="24"
                      fontSize="body.lg"
                      letterSpacing="wide"
                      marginTop="8px"
                    >
                      {t("my-profile-sub-title")}
                    </Text>
                  </Box>
                  <Box display="flex" flexDirection="column" gap="24px">
                    <form
                      onSubmit={handleSubmit(onSubmit)}
                      className="flex flex-col gap-[24px]"
                    >
                      <FormInput
                        label={t("full-name")}
                        register={register}
                        error={errors.name}
                        id="name"
                      />
                      <EmailInput
                        disabled
                        t={t}
                        register={register}
                        error={errors.email}
                        id="email"
                      />

                      <FormSelectInput
                        label={t("role")}
                        value={inputValue}
                        register={register}
                        error={errors.role}
                        id="role"
                        onInputChange={onInputChange}
                      />
                      <Box
                        display="flex"
                        w="100%"
                        justifyContent="right"
                        marginTop="12px"
                      >
                        <Button
                          type="submit"
                          isLoading={isSubmitting}
                          h="48px"
                          w="auto"
                          paddingTop="16px"
                          paddingBottom="16px"
                          px="24px"
                          letterSpacing="widest"
                          textTransform="uppercase"
                          fontWeight="semibold"
                          fontSize="button.md"
                        >
                          {t("save-changes")}
                        </Button>
                      </Box>
                    </form>
                  </Box>
                </TabPanel>
                <TabPanel
                  width="full"
                  padding="24px"
                  display="flex"
                  flexDirection="column"
                  gap="24px"
                >
                  <Box
                    height="36px"
                    display="flex"
                    alignItems="center"
                    justifyContent="space-between"
                  >
                    <Text
                      fontSize="title.md"
                      fontWeight="semibold"
                      lineHeight="24px"
                      color="content.secondary"
                      textTransform="capitalize"
                    >
                      {t("manage-users")}
                    </Text>
                    <Button
                      aria-label="Add User"
                      leftIcon={<AddIcon />}
                      type="submit"
                      h="48px"
                      w="auto"
                      gap="8px"
                      paddingTop="16px"
                      paddingBottom="16px"
                      px="24px"
                      letterSpacing="widest"
                      textTransform="uppercase"
                      fontWeight="semibold"
                      fontSize="button.md"
                      onClick={onUserModalOpen}
                    >
                      {t("add-user")}
                    </Button>
                  </Box>
                  <Box display="flex" justifyContent="space-between">
                    <Box display="flex" gap="24px">
                      <InputGroup
                        w="365px"
                        height="48px"
                        shadow="1dp"
                        alignItems="center"
                        display="flex"
                        borderRadius="4px"
                        borderWidth="1px"
                        borderStyle="solid"
                        borderColor="border.neutral"
                      >
                        <InputLeftElement
                          h="100%"
                          display="flex"
                          paddingLeft="10px"
                          pointerEvents="none"
                          alignItems="center"
                        >
                          <SearchIcon color="content.tertiary" />
                        </InputLeftElement>
                        <Input
                          type="tel"
                          fontSize="body.md"
                          fontFamily="heading"
                          letterSpacing="wide"
                          color="content.tertiary"
                          placeholder={t("search-filter-placeholder")}
                          border="none"
                          h="100%"
                          onChange={(e) => setSearchTerm(e.target.value)}
                        />
                      </InputGroup>
                      <Select
                        h="48px"
                        w="auto"
                        borderWidth="1px"
                        borderStyle="solid"
                        borderColor="border.neutral"
                        onChange={(e) => setRole(e.target.value)}
                      >
                        <option value="all">{t("all")}</option>
                        <option value="admin">{t("admin")}</option>
                        <option value="contributor">{t("contributor")}</option>
                      </Select>
                    </Box>
                    <Box display="flex" alignItems="center" gap="8px">
                      <Text
                        color="content.tertiary"
                        fontSize="body.md"
                        fontFamily="heading"
                        fontWeight="normal"
                        letterSpacing="wide"
                      >
                        1-{filteredUsers.length} of {filteredUsers.length}
                      </Text>
                      <Box display="flex" gap="8px">
                        <Button variant="ghost" h="24px" w="24px">
                          <ChevronLeftIcon
                            h="24px"
                            w="24px"
                            color="background.overlay"
                          />
                        </Button>
                        <Button variant="ghost" h="24px" w="24px">
                          <ChevronRightIcon
                            h="24px"
                            w="24px"
                            color="content.secondary"
                          />
                        </Button>
                      </Box>
                    </Box>
                  </Box>
                  {selectedUsers.length > 0 && (
                    <Box
                      display="flex"
                      alignItems="center"
                      justifyContent="space-between"
                    >
                      <Box display="flex" alignItems="center" gap="8px">
                        <Button
                          variant="ghost"
                          padding="0"
                          marginLeft="-10px"
                          onClick={() => setSelectedUsers([])}
                        >
                          <MdOutlineIndeterminateCheckBox
                            size={24}
                            color="content.link"
                          />
                        </Button>
                        <Text
                          color="content.tertiary"
                          fontSize="body.md"
                          fontFamily="heading"
                          fontWeight="normal"
                          letterSpacing="wide"
                        >
                          {selectedUsers.length} {t("selected-users")}
                        </Text>
                      </Box>
                      <Box>
                        <Button
                          color="sentiment.negativeDefault"
                          textTransform="capitalize"
                          fontSize="body.md"
                          fontFamily="heading"
                          fontWeight="normal"
                          letterSpacing="wide"
                          leftIcon={<FiTrash2 size={24} />}
                          variant="ghost"
                          onClick={handleDeleteUsers}
                        >
                          {t("remove-users")}
                        </Button>
                      </Box>
                    </Box>
                  )}
                  <Box>
                    <TableContainer
                      borderWidth="1px"
                      borderColor="border.overlay"
                      borderRadius="12px"
                    >
                      <Table variant="simple" borderStyle="solid">
                        <Thead>
                          <Tr>
                            <Th>{t("select")}</Th>
                            <Th>{t("name")}</Th>
                            <Th>{t("email")}</Th>
                            <Th>{t("role")}</Th>
                          </Tr>
                        </Thead>
                        <Tbody fontFamily="heading">
                          {filteredUsersByRole.map((user) => (
                            <Tr key={user.userId}>
                              <Td>
                                <Checkbox
                                  onChange={(e) =>
                                    handleCheckboxChange(
                                      user.userId,
                                      e.target.checked,
                                    )
                                  }
                                  isChecked={selectedUsers.includes(
                                    user.userId,
                                  )}
                                />
                              </Td>
                              <Td>{user.name}</Td>
                              <Td>{user.email}</Td>
                              <Td
                                display="flex"
                                alignItems="center"
                                justifyContent="space-between"
                              >
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
                                    user.role === "admin"
                                      ? "content.alternative"
                                      : "sentiment.warningDefault"
                                  }
                                  textColor={
                                    user.role === "admin"
                                      ? "content.alternative"
                                      : "sentiment.warningDefault"
                                  }
                                  backgroundColor={
                                    user.role === "admin"
                                      ? "background.neutral"
                                      : "sentiment.warningOverlay"
                                  }
                                >
                                  {t(`${user.role}`)}
                                </Badge>
                                <Popover isLazy>
                                  <PopoverTrigger>
                                    <Button
                                      variant="ghost"
                                      color="interactive.control"
                                    >
                                      <MdMoreVert size={24} />
                                    </Button>
                                  </PopoverTrigger>
                                  <PopoverContent
                                    h="128px"
                                    w="250px"
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
                                          display="flex"
                                          cursor="pointer"
                                          gap="16px"
                                          color="content.secondary"
                                          alignItems="center"
                                          px="16px"
                                          paddingTop="12px"
                                          paddingBottom="12px"
                                          className="group"
                                          _hover={{
                                            background: "interactive.secondary",
                                          }}
                                          onClick={() => {
                                            setUserData(user);
                                            onUserUpdateModalOpen();
                                          }}
                                        >
                                          <MdOutlineModeEditOutline
                                            size={24}
                                            className="group-hover:text-light text-content_tertiary"
                                          />

                                          <Text
                                            fontFamily="heading"
                                            letterSpacing="wide"
                                            color="content.secondary"
                                            fontWeight="normal"
                                            fontSize="body.lg"
                                            className="group-hover:text-light"
                                          >
                                            {t("edit-user")}
                                          </Text>
                                        </ListItem>
                                        <ListItem
                                          display="flex"
                                          cursor="pointer"
                                          gap="16px"
                                          color="sentiment.negativeDefault"
                                          alignItems="center"
                                          px="16px"
                                          paddingTop="12px"
                                          paddingBottom="12px"
                                          className="group"
                                          _hover={{
                                            background: "interactive.secondary",
                                          }}
                                          onClick={() => {
                                            setUserData(user);
                                            onUserDeleteModalOpen();
                                          }}
                                        >
                                          <FiTrash2
                                            size={24}
                                            className="group-hover:text-light text-sentiment_negative_default"
                                          />

                                          <Text
                                            color="content.secondary"
                                            fontFamily="heading"
                                            letterSpacing="wide"
                                            fontWeight="normal"
                                            fontSize="body.lg"
                                            className="group-hover:text-light"
                                          >
                                            {t("remove-user")}
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
                <TabPanel
                  padding="24px"
                  display="flex"
                  flexDirection="column"
                  gap="24px"
                >
                  <Box
                    height="36px"
                    display="flex"
                    alignItems="center"
                    justifyContent="space-between"
                  >
                    <Text
                      fontSize="title.md"
                      fontWeight="semibold"
                      lineHeight="24px"
                      color="content.secondary"
                    >
                      {t("city")}
                    </Text>
                    <NextLink href="/onboarding/setup">
                      <Button
                        aria-label="Add User"
                        leftIcon={<AddIcon />}
                        type="submit"
                        h="48px"
                        w="auto"
                        gap="8px"
                        paddingTop="16px"
                        paddingBottom="16px"
                        px="24px"
                        letterSpacing="widest"
                        textTransform="uppercase"
                        fontWeight="semibold"
                        fontSize="button.md"
                      >
                        {t("add-city")}
                      </Button>
                    </NextLink>
                  </Box>
                  <Box maxHeight="500px" overflow="scroll">
                    <TableContainer
                      borderWidth="1px"
                      borderColor="border.overlay"
                      borderRadius="12px"
                    >
                      <Table variant="simple" borderStyle="solid">
                        <Thead>
                          <Tr>
                            <Th>{t("city-name")}</Th>
                            <Th>{t("state-province")}</Th>
                            <Th>{t("country")}</Th>
                            <Th align="right">{t("last-updated")}</Th>
                          </Tr>
                        </Thead>
                        <Tbody fontFamily="heading">
                          {cities?.map((city: any) => (
                            <Tr key={city.cityId}>
                              <Td>
                                <Box
                                  color="interactive.secondary"
                                  display="flex"
                                  alignItems="center"
                                  gap="10px"
                                >
                                  <MdDomain size={24} />
                                  <Text color="base.dark">{city.name}</Text>
                                </Box>
                              </Td>

                              <Td>{city.region}</Td>
                              <Td>{city.country}</Td>
                              <Td
                                display="flex"
                                alignItems="center"
                                gap="8px"
                                align="right"
                              >
                                <Text>
                                  {new Date(
                                    city.last_updated,
                                  ).toLocaleDateString()}
                                </Text>
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
                                    w="300px"
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
                                          <MdOutlineFileDownload size={24} />

                                          <Text
                                            color="content.secondary"
                                            fontFamily="heading"
                                            letterSpacing="wide"
                                            fontWeight="normal"
                                            fontSize="body.lg"
                                            className="group group-hover:text-white"
                                          >
                                            {t("download-city-data")}
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
                                            onCityDeleteModalOpen();
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
                                            {t("remove-city")}
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
              </TabPanels>
            </Tabs>
          </Box>
        </Box>
      </TabPanel>
      <AddUserModal
        isOpen={isUserModalOpen}
        onClose={onUserModalClose}
        defaultCityId={defaultCityId}
        userInfo={userInfo}
        t={t}
      />
      <UpdateUserModal
        isOpen={isUserUpdateModalOpen}
        onClose={onUserUpdateModalClose}
        userData={userData}
        userInfo={userInfo}
        t={t}
      />
      <DeleteUserModal
        isOpen={isUserDeleteModalOpen}
        onClose={onUserDeleteModalClose}
        userData={userData}
        cityId={cityData.cityId}
        t={t}
      />
      <DeleteCityModal
        isOpen={isCityDeleteModalOpen}
        onClose={onCityDeleteModalClose}
        userData={userData}
        cityData={cityData}
        t={t}
        lng={lng}
      />
    </>
  );
};

export default MyProfileTab;
