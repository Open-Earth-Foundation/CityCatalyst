import {
  Table,
  Box,
  Badge,
  Text,
  PopoverTrigger,
  Popover,
  PopoverArrow,
  PopoverBody,
  PopoverContent,
  Icon,
  IconButton,
  useDisclosure,
  List,
} from "@chakra-ui/react";
import { useState } from "react";

import Link from "next/link";
import {
  MdMoreVert,
  MdOutlineCheck,
  MdOutlineFileDownload,
} from "react-icons/md";

import DeleteFileModal from "@/components/Modals/delete-file-modal";
import { FiTrash2 } from "react-icons/fi";
import { FaFileCsv } from "react-icons/fa";
import { TFunction } from "i18next";
import { UserFile, UserFileAttributes } from "@/models/UserFile";

const FilesTable = ({ t, files }: { t: TFunction; files: UserFile[] }) => {
  const {
    open: isFileDeleteModalOpen,
    onOpen: onFileDeleteModalOpen,
    onClose: onFileDeleteModalClose,
  } = useDisclosure();

  const [fileData, setFileData] = useState<UserFileAttributes>();

  return (
    <>
      <Table.Root
        variant="outline"
        borderStyle="solid"
        borderWidth="1px"
        borderColor="border.overlay"
        borderRadius="12px"
      >
        <Table.Header bg="background.backgroundLight">
          <Table.Row>
            <Table.ColumnHeader>{t("name")}</Table.ColumnHeader>
            <Table.ColumnHeader>{t("sector")}</Table.ColumnHeader>
            <Table.ColumnHeader>{t("status")}</Table.ColumnHeader>
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
          {files?.map((file) => (
            <Table.Row key={`${file.id}`}>
              <Table.Cell gap="16px" alignItems="center">
                <Box display="flex" alignItems="center" gap="8px">
                  <Box color="interactive.primary">
                    <FaFileCsv size={24} />
                  </Box>
                  <Text maxW="200px" truncate>
                    {file.fileName}
                  </Text>
                </Box>
              </Table.Cell>
              <Table.Cell>{file.sector}</Table.Cell>
              <Table.Cell>
                <Badge
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
                  color={
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
              </Table.Cell>
              <Table.Cell
                textAlign="end"
                display="flex"
                gap="16px"
                alignItems="center"
                justifyContent="end"
              >
                <span>{file.lastUpdated as any}</span>
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
                    h="auto"
                    w="auto"
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
                            <MdOutlineFileDownload size={24} />

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
                            setFileData(file);
                            onFileDeleteModalOpen();
                          }}
                        >
                          <Icon as={FiTrash2} boxSize={6} />
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
                        </List.Item>
                        <List.Item
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
                        </List.Item>
                      </List.Root>
                    </PopoverBody>
                  </PopoverContent>
                </Popover.Root>
              </Table.Cell>
            </Table.Row>
          ))}
        </Table.Body>
      </Table.Root>
      <DeleteFileModal
        isOpen={isFileDeleteModalOpen}
        onClose={onFileDeleteModalClose}
        fileData={fileData}
        t={t}
      />
    </>
  );
};

export default FilesTable;
