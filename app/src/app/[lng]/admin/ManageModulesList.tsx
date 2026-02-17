"use client";

import {
  Box,
  Button,
  Heading,
  Icon,
  IconButton,
  Link,
  Table,
  Text,
} from "@chakra-ui/react";
import { BsPlus } from "react-icons/bs";
import { useTranslation } from "@/i18n/client";
import React, { useState } from "react";
import { api } from "@/services/api";
import DataTable from "@/components/ui/data-table";
import { Tag } from "@/components/ui/tag";
import {
  MenuContent,
  MenuItem,
  MenuRoot,
  MenuTrigger,
} from "@/components/ui/menu";
import { MdDelete, MdEdit, MdMoreVert } from "react-icons/md";
import ProgressLoader from "@/components/ProgressLoader";
import CreateModuleModal from "./CreateModuleModal";
import EditModuleModal from "./EditModuleModal";
import DeleteModuleModal from "./DeleteModuleModal";
import type { ModuleAttributes } from "@/models/Module";

const typeColorMap: Record<string, string> = {
  CC: "blue",
  OEF: "green",
  POC: "yellow",
};

const stageKeyMap: Record<string, string> = {
  "assess-&-analyze": "stage-assess-and-analyze",
  "plan": "stage-plan",
  "implement": "stage-implement",
  "monitor-evaluate-&-report": "stage-monitor-evaluate-and-report",
};

const isExternalUrl = (url: string) =>
  url.startsWith("http://") || url.startsWith("https://");

const ManageModulesList = ({ lng }: { lng: string }) => {
  const { t } = useTranslation(lng, "admin");
  const { data: modules, isLoading } = api.useGetAdminModulesQuery();

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  const [editingModule, setEditingModule] = useState<ModuleAttributes | null>(
    null,
  );
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);

  const [deletingModule, setDeletingModule] = useState<ModuleAttributes | null>(
    null,
  );
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);

  const handleEdit = (module: ModuleAttributes) => {
    setEditingModule(module);
    setIsEditModalOpen(true);
  };

  const handleDelete = (module: ModuleAttributes) => {
    setDeletingModule(module);
    setIsDeleteModalOpen(true);
  };

  return (
    <>
      <Box
        display="flex"
        alignItems="center"
        justifyContent="space-between"
      >
        <Box>
          <Heading
            fontSize="headline.sm"
            mb={2}
            fontWeight="semibold"
            lineHeight="32px"
            fontStyle="normal"
            textTransform="capitalize"
            color="content.secondary"
          >
            {t("manage-modules-heading")}
          </Heading>
          <Text color="content.tertiary" fontSize="body.lg">
            {t("manage-modules-caption")}
          </Text>
        </Box>
        <Button
          onClick={() => setIsCreateModalOpen(true)}
          variant="ghost"
          h="48px"
          bg="interactive.secondary"
          color="base.light"
          mt="auto"
        >
          <Icon as={BsPlus} h={8} w={8} />
          {t("add-module")}
        </Button>
      </Box>
      <Box>
        {isLoading && <ProgressLoader />}
        {!isLoading && (!modules || modules.length === 0) && (
          <Text color="content.tertiary" fontSize="body.lg">
            {t("no-modules")}
          </Text>
        )}
        {!isLoading && modules && modules.length > 0 && (
          <DataTable
            searchable={true}
            pagination={true}
            filterProperty="type"
            filterOptions={[
              { label: "CC", value: "CC" },
              { label: "OEF", value: "OEF" },
              { label: "POC", value: "POC" },
            ]}
            data={modules}
            title={t("manage-modules")}
            columns={[
              { header: t("module-name"), accessor: "name" },
              { header: t("module-type"), accessor: "type" },
              { header: t("module-stage"), accessor: "stage" },
              { header: t("module-url"), accessor: "url" },
              { header: "", accessor: null },
            ]}
            renderRow={(item, idx) => (
              <Table.Row key={idx}>
                <Table.Cell>{item.name?.en || item.name?.["en"]}</Table.Cell>
                <Table.Cell>
                  <Tag
                    size="lg"
                    colorPalette={typeColorMap[item.type] || "gray"}
                  >
                    {item.type}
                  </Tag>
                </Table.Cell>
                <Table.Cell>{t(stageKeyMap[item.stage] || item.stage)}</Table.Cell>
                <Table.Cell>
                  {isExternalUrl(item.url) ? (
                    <Tag size="sm" colorPalette="blue" variant="outline">
                      <Link
                        href={item.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        color="content.link"
                        _hover={{ textDecoration: "underline" }}
                        maxW="220px"
                        truncate
                      >
                        {item.url}
                      </Link>
                    </Tag>
                  ) : (
                    <Tag size="sm" colorPalette="gray" variant="outline">
                      {item.url}
                    </Tag>
                  )}
                </Table.Cell>
                <Table.Cell>
                  {item.type === "POC" && (
                    <MenuRoot>
                      <MenuTrigger>
                        <IconButton
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
                          value={t("edit-module")}
                          valueText={t("edit-module")}
                          p="16px"
                          display="flex"
                          alignItems="center"
                          gap="16px"
                          _hover={{
                            bg: "content.link",
                            cursor: "pointer",
                          }}
                          className="group"
                          onClick={() => handleEdit(item)}
                        >
                          <Icon
                            _groupHover={{ color: "white" }}
                            color="interactive.control"
                            as={MdEdit}
                            h="24px"
                            w="24px"
                          />
                          <Text
                            _groupHover={{ color: "white" }}
                            color="content.primary"
                          >
                            {t("edit-module")}
                          </Text>
                        </MenuItem>
                        <MenuItem
                          value={t("delete-module")}
                          valueText={t("delete-module")}
                          p="16px"
                          display="flex"
                          alignItems="center"
                          gap="16px"
                          _hover={{
                            bg: "content.link",
                            cursor: "pointer",
                          }}
                          className="group"
                          onClick={() => handleDelete(item)}
                        >
                          <Icon
                            _groupHover={{ color: "white" }}
                            color="interactive.control"
                            as={MdDelete}
                            h="24px"
                            w="24px"
                          />
                          <Text
                            _groupHover={{ color: "white" }}
                            color="content.primary"
                          >
                            {t("delete-module")}
                          </Text>
                        </MenuItem>
                      </MenuContent>
                    </MenuRoot>
                  )}
                </Table.Cell>
              </Table.Row>
            )}
          />
        )}
      </Box>

      <CreateModuleModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onOpenChange={setIsCreateModalOpen}
        t={t}
      />

      <EditModuleModal
        isOpen={isEditModalOpen}
        onClose={() => {
          setIsEditModalOpen(false);
          setEditingModule(null);
        }}
        onOpenChange={setIsEditModalOpen}
        module={editingModule}
        t={t}
      />

      <DeleteModuleModal
        isOpen={isDeleteModalOpen}
        onClose={() => {
          setIsDeleteModalOpen(false);
          setDeletingModule(null);
        }}
        onOpenChange={setIsDeleteModalOpen}
        module={deletingModule}
        t={t}
      />
    </>
  );
};

export default ManageModulesList;
