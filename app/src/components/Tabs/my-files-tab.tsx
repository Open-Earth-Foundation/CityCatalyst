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

import { CheckIcon, ChevronRightIcon, SearchIcon } from "@chakra-ui/icons";
import {
  MdMoreVert,
  MdOutlineCheck,
  MdOutlineFileDownload,
  MdOutlineFolder,
} from "react-icons/md";
import { FiTrash2 } from "react-icons/fi";
import { FaFileCsv } from "react-icons/fa";

import { CityData } from "@/app/[lng]/[inventory]/settings/page";
import { Session } from "next-auth";

import DeleteFileModal from "@/components/Modals/delete-file-modal";

import { TFunction } from "i18next";
import { UserAttributes } from "@/models/User";
import { UserFileAttributes } from "@/models/UserFile";

import Link from "next/link";
import { InventoryResponse } from "@/util/types";
import { CircleFlag } from "react-circle-flags";

interface MyFilesTabProps {
  session: Session | null;
  status: "loading" | "authenticated" | "unauthenticated";
  t: TFunction;
  userInfo: UserAttributes | any;
  lng: string;
  userFiles: UserFileAttributes[] | any;
  inventory: InventoryResponse
}

const MyFilesTab: FC<MyFilesTabProps> = ({
  session,
  status,
  t,
  lng,
  userInfo,
  userFiles,
  inventory
}) => {
  
  const getYears = userFiles?.map((item: any): number => {
    const date = new Date(item.lastUpdated);
    return date.getFullYear();
  });
  const years: number[] = Array.from(new Set(getYears));

  function getYearFromDate(dateString: string) {
    return new Date(dateString).getFullYear();
  }

  function filterDataByYear(
    data: any,
    selectedYear: number | null | undefined,
  ) {
    return data?.filter((item: any) => {
      return getYearFromDate(item?.lastUpdated) === selectedYear;
    });
  }

  const [isYearSelected, setIsYearSelected] = useState<boolean>(false);
  const [selectedYear, setSelectedYear] = useState<number | null>();

  const filteredData = filterDataByYear(userFiles, selectedYear);

  const {
    open: isFileDeleteModalOpen,
    onOpen: onFileDeleteModalOpen,
    onClose: onFileDeleteModalClose,
  } = useDisclosure();

  const [fileData, setFileData] = useState<UserFileAttributes>();

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
              fontStyle="normal"
              fontFamily="heading"
            >
              {t("my-files")}
            </Text>
            <Text
              color="content.tertiary"
              fontWeight="normal"
              lineHeight="24"
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
              fontFamily="heading"
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
                    {inventory?.city.name}
                  </Tab>
              </TabList>

              <TabPanels backgroundColor="background.default">
                  <TabPanel
                    display="flex"
                    flexDirection="column"
                    gap="24px"
                    borderRadius="8px"
                  >
                    <Box>
                      <Box display="flex" gap="8px" alignItems="center">
                      <CircleFlag
                        countryCode={
                          inventory?.city.locode
                            ?.substring(0, 2)
                            .toLowerCase() || ""
                        }
                        width={32}
                      />
                        <Text
                          color="content.secondary"
                          fontWeight="semibold"
                          lineHeight="24"
                          fontSize="title.md"
                          fontFamily="heading"
                          fontStyle="normal"
                        >
                          {inventory?.city.name}
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
                          setSelectedYear(null);
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
                            <span>{selectedYear}</span>
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
                              {years.map((year: any) => (
                                <Tr key={year}>
                                  <Td
                                    onClick={() => {
                                      setIsYearSelected(true);
                                      setSelectedYear(year);
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

                                  <Td>
                                    {filterDataByYear(userFiles, year).length}{" "}
                                    {filterDataByYear(userFiles, year).length ==
                                    0
                                      ? "files"
                                      : "file"}
                                  </Td>

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
                              {filteredData.map((file: any) => (
                                <Tr key={`${file.id}`}>
                                  <Td gap="16px" alignItems="center">
                                    <Box
                                      display="flex"
                                      alignItems="center"
                                      gap="8px"
                                    >
                                      <Box color="interactive.primary">
                                        <FaFileCsv size={24} />
                                      </Box>
                                      <Text maxW="200px" isTruncated>
                                        {file.file.fileName}
                                      </Text>
                                    </Box>
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
                                    <span>{file.lastUpdated as any}</span>
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
                                        h="auto"
                                        w="auto"
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
                                              <Link
                                                href={`/api/v0/city/${file.cityId}/file/${file.id}/download-file`}
                                                download
                                                className="flex gap-4"
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
                                              </Link>
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
                                                setFileData(file);
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
                                            <ListItem
                                              display="flex"
                                              cursor="pointer"
                                              gap="16px"
                                              className="group "
                                              color="interactive.tertiary"
                                              alignItems="center"
                                              px="16px"
                                              paddingTop="12px"
                                              paddingBottom="12px"
                                              _hover={{
                                                background: "content.link",
                                                color: "white",
                                              }}
                                            >
                                              <MdOutlineCheck size={24} />
                                              <Text
                                                color="content.secondary"
                                                fontFamily="heading"
                                                letterSpacing="wide"
                                                fontWeight="normal"
                                                fontSize="body.lg"
                                                className="group group-hover:text-white"
                                              >
                                                {t("mark-as-completed")}
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
                      )}
                    </Box>
                  </TabPanel>
              </TabPanels>
            </Tabs>
          </Box>
        </Box>
      </TabPanel>
      <DeleteFileModal
        isOpen={isFileDeleteModalOpen}
        onClose={onFileDeleteModalClose}
        fileData={fileData}
        t={t}
      />
    </>
  );
};

export default MyFilesTab;
