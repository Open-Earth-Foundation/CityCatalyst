import DataTableCore from "@/components/ui/data-table-core";
import { Icon, IconButton, Table, Text } from "@chakra-ui/react";
import { Tag } from "@/components/ui/tag";
import { TagMapping } from "@/app/[lng]/organization/[id]/account-settings/project";
import { OrganizationRole, ProjectWithCities } from "@/util/types";
import {
  MenuContent,
  MenuItem,
  MenuRoot,
  MenuTrigger,
} from "@/components/ui/menu";
import { MdMoreVert } from "react-icons/md";
import { RiDeleteBin6Line } from "react-icons/ri";
import React from "react";
import RemoveUserModal from "@/app/[lng]/admin/organization/[id]/team/RemoveUserModal";

const CollaboratorsTable = ({ userList, t }) => {
  const TagMapping = {
    [OrganizationRole.ORG_ADMIN]: {
      color: "green",
      text: t("owner"),
    },
    [OrganizationRole.ADMIN]: {
      color: "blue",
      text: t("admin"),
    },
    [OrganizationRole.COLLABORATOR]: {
      color: "yellow",
      text: t("collaborator"),
    },
  };

  return (
    <>
      <DataTableCore
        data={userList ?? []}
        columns={[
          { header: t("email"), accessor: "email" },
          { header: t("role"), accessor: "role" },
          { header: "", accessor: null },
          { header: "", accessor: null },
        ]}
        renderRow={(item, idx) => (
          <Table.Row key={idx}>
            <Table.Cell>{item.email}</Table.Cell>
            <Table.Cell title={item.role}>
              <Tag
                size="lg"
                colorPalette={TagMapping[item.role as OrganizationRole].color}
              >
                {TagMapping[item.role as OrganizationRole].text}
              </Tag>
            </Table.Cell>
            <Table.Cell className="w-10">
              <MenuRoot>
                <MenuTrigger>
                  <IconButton
                    data-testid="activity-more-icon"
                    aria-label="more-icon"
                    variant="ghost"
                    color="content.tertiary"
                  >
                    <Icon as={MdMoreVert} size="lg" />
                  </IconButton>
                </MenuTrigger>
                <MenuContent w="auto" borderRadius="8px" shadow="2dp" px="0">
                  <MenuItem
                    value={t("remove-user")}
                    valueText={t("remove-user")}
                    p="16px"
                    display="flex"
                    alignItems="center"
                    gap="16px"
                    _hover={{ bg: "content.link", cursor: "pointer" }}
                    className="group"
                    onClick={() => {}}
                  >
                    <Icon
                      className="group-hover:text-white"
                      color="sentiment.negativeDefault"
                      as={RiDeleteBin6Line}
                      h="24px"
                      w="24px"
                    />
                    <Text
                      className="group-hover:text-white"
                      color="content.primary"
                    >
                      {t("remove-user")}
                    </Text>
                  </MenuItem>
                </MenuContent>
              </MenuRoot>
            </Table.Cell>
          </Table.Row>
        )}
      />
      <RemoveUserModal
        t={t}
        isOpen={isDeleteModalOpen}
        onClose={() => {
          setIsDeleteModalOpen(false);
          setUserToRemove(null);
        }}
        onOpenChange={setIsDeleteModalOpen}
        projectData={projectsData as ProjectWithCities[]}
        selectedProject={selectedProject.length > 0 ? selectedProject[0] : null}
        selectedCity={selectedCity}
        user={userToRemove}
        organization={organization}
      />
    </>
  );
};
