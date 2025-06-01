"use client";

import {
  Badge,
  Box,
  Icon,
  IconButton,
  List,
  Popover,
  PopoverArrow,
  PopoverBody,
  PopoverContent,
  Tabs,
  Table,
  Text,
  useDisclosure,
  PopoverTrigger,
} from "@chakra-ui/react";
import React, { FC, useState } from "react";

import {
  MdMoreVert,
  MdOutlineCheck,
  MdOutlineFileDownload,
  MdOutlineFolder,
  MdChevronRight,
} from "react-icons/md";
import { FiTrash2 } from "react-icons/fi";
import { FaFileCsv } from "react-icons/fa";

import { Session } from "next-auth";

import DeleteFileModal from "@/components/Modals/delete-file-modal";

import { TFunction } from "i18next";
import { UserAttributes } from "@/models/User";
import { UserFileAttributes } from "@/models/UserFile";

import Link from "next/link";
import { InventoryResponse } from "@/util/types";
import { CircleFlag } from "react-circle-flags";
import SettingsSkeleton from "../Skeletons/settings-skeleton";
import FilesTable from "../Files/fileTable";

interface MyFilesTabProps {
  t: TFunction;
  userFiles: UserFileAttributes[] | any;
  inventory: InventoryResponse;
}

const MyFilesTab: FC<MyFilesTabProps> = ({ t, userFiles, inventory }) => {
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
      <Tabs.Content value="my-files">
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
            {inventory?.city ? (
              <Tabs.Root
                display="flex"
                flexDirection="row"
                gap="36px"
                defaultValue="city"
                variant="enclosed"
              >
                <Tabs.List display="flex" flexDirection="column" gap="12px">
                  <Tabs.Trigger
                    value="city"
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
                    {inventory?.city.name}
                  </Tabs.Trigger>
                </Tabs.List>

                <Tabs.Content
                  value="city"
                  backgroundColor="background.default"
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
                          <Icon as={MdChevronRight} color="content.tertiary" />{" "}
                          <span>{selectedYear}</span>
                        </>
                      )}
                    </Text>
                  </Box>
                  <Box display="flex" flexDirection="column" gap="24px">
                    {!isYearSelected ? (
                      <Table.Root
                        variant="outline"
                        borderStyle="solid"
                        borderWidth="1px"
                        borderColor="border.overlay"
                        borderRadius="12px"
                      >
                        <Table.ColumnHeader>
                          <Table.Row>
                            <Table.ColumnHeader>
                              {t("inventory-year")}
                            </Table.ColumnHeader>
                            <Table.ColumnHeader>
                              {t("files")}
                            </Table.ColumnHeader>
                            <Table.ColumnHeader align="right">
                              {t("last-updated")}
                            </Table.ColumnHeader>
                          </Table.Row>
                        </Table.ColumnHeader>
                        <Table.Body
                          fontFamily="heading"
                          color="content.primary"
                          fontSize="body.md"
                        >
                          {years.map((year: any) => (
                            <Table.Row key={year}>
                              <Table.Cell
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
                              </Table.Cell>

                              <Table.Cell>
                                {filterDataByYear(userFiles, year).length}{" "}
                                {filterDataByYear(userFiles, year).length == 0
                                  ? "files"
                                  : "file"}
                              </Table.Cell>

                              <Table.Cell align="right">-</Table.Cell>
                            </Table.Row>
                          ))}
                        </Table.Body>
                      </Table.Root>
                    ) : (
                      <FilesTable t={t} files={filteredData} />
                    )}
                  </Box>
                </Tabs.Content>
              </Tabs.Root>
            ) : (
              <SettingsSkeleton />
            )}
          </Box>
        </Box>
      </Tabs.Content>
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
