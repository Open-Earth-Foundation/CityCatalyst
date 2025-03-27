"use client";
import {
  Box,
  Button,
  Heading,
  Icon,
  IconButton,
  Table,
  Text,
} from "@chakra-ui/react";
import {
  MdAdd,
  MdForwardToInbox,
  MdMoreVert,
  MdOutlineGroup,
} from "react-icons/md";
import React from "react";
import { useTranslation } from "@/i18n/client";
import {
  useGetOrganizationQuery,
  useGetProjectsForOrganizationQuery,
} from "@/services/api";
import {
  ProgressCircleRing,
  ProgressCircleRoot,
} from "@/components/ui/progress-circle";
import DataTable from "@/components/ui/data-table";
import { Tag } from "@/components/ui/tag";
import {
  MenuContent,
  MenuItem,
  MenuRoot,
  MenuTrigger,
} from "@/components/ui/menu";

const AdminOrganizationProjectsPage = ({
  params: { lng, id },
}: {
  params: { lng: string; id: string };
}) => {
  const [showAddProjectModal, setShowAddProjectModal] = React.useState(false);

  const { t } = useTranslation(lng, "admin");

  const { data: organization, isLoading: isOrganizationLoading } =
    useGetOrganizationQuery(id);

  const { data: projects, isLoading: isProjectDataLoading } =
    useGetProjectsForOrganizationQuery(id);

  if (isOrganizationLoading) {
    return (
      <Box className="w-full py-12 flex items-center justify-center">
        <ProgressCircleRoot value={null}>
          <ProgressCircleRing cap="round" />
        </ProgressCircleRoot>
      </Box>
    );
  }

  return (
    <Box>
      <Box display="flex" alignItems="center" justifyContent="space-between">
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
            {t("org-project-heading", { name: organization?.name })}
          </Heading>
          <Text color="content.tertiary" fontSize="body.lg">
            {t("org-project-caption", { name: organization?.name })}
          </Text>
        </Box>
        <Button onClick={() => setShowAddProjectModal(true)} h="48px" mt="auto">
          <Icon as={MdAdd} h={8} w={8} />
          {t("add-project")}
        </Button>
      </Box>
      <Box>
        {isProjectDataLoading && (
          <div className="flex items-center justify-center w-full">
            <Box className="w-full py-12 flex items-center justify-center">
              <ProgressCircleRoot value={null}>
                <ProgressCircleRing cap="round" />
              </ProgressCircleRoot>
            </Box>
          </div>
        )}
        {!isProjectDataLoading && projects?.length === 0 && (
          <Text color="content.tertiary" fontSize="body.lg">
            {t("no-data")}
          </Text>
        )}
      </Box>

      {!isProjectDataLoading && projects && projects.length > 0 && (
        <DataTable
          t={t}
          searchable={true}
          pagination={true}
          data={[...projects].reverse()}
          title={t("manage-oef-clients")}
          columns={[
            {
              header: t("project-name"),
              accessor: "name",
            },
            { header: t("cities"), accessor: "status" },
            { header: "", accessor: null },
          ]}
          renderRow={(item, idx) => (
            <Table.Row key={idx}>
              <Table.Cell>{item.name}</Table.Cell>
              <Table.Cell>{item.contactEmail}</Table.Cell>
              <Table.Cell>
                {" "}
                {item.status === "accepted" ? (
                  <Tag size="lg" rounded="full" colorPalette="green">
                    {" "}
                    {t("accepted")}
                  </Tag>
                ) : (
                  <Tag size="lg" colorPalette="yellow">
                    {t("invite-sent")}
                  </Tag>
                )}{" "}
              </Table.Cell>
              <Table.Cell>
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
                      value={t("resend-invite")}
                      valueText={t("resend-invite")}
                      p="16px"
                      display="flex"
                      alignItems="center"
                      gap="16px"
                      _hover={{
                        bg: "content.link",
                        cursor: "pointer",
                      }}
                      className="group"
                      onClick={() => {}}
                    >
                      <Icon
                        className="group-hover:text-white"
                        color="interactive.control"
                        as={MdForwardToInbox}
                        h="24px"
                        w="24px"
                      />
                      <Text
                        className="group-hover:text-white"
                        color="content.primary"
                      >
                        {t("resend-invite")}
                      </Text>
                    </MenuItem>
                    <MenuItem
                      value={t("account-details")}
                      valueText={t("account-details")}
                      p="16px"
                      display="flex"
                      alignItems="center"
                      gap="16px"
                      _hover={{
                        bg: "content.link",
                        cursor: "pointer",
                      }}
                      className="group"
                      onClick={() =>
                        router.push(
                          `/${lng}/admin/organization/${item.organizationId}/profile`,
                        )
                      }
                    >
                      <Icon
                        className="group-hover:text-white"
                        color="interactive.control"
                        as={MdOutlineGroup}
                        h="24px"
                        w="24px"
                      />
                      <Text
                        className="group-hover:text-white"
                        color="content.primary"
                      >
                        {t("account-details")}
                      </Text>
                    </MenuItem>
                  </MenuContent>
                </MenuRoot>
              </Table.Cell>
            </Table.Row>
          )}
        />
      )}
    </Box>
  );
};

export default AdminOrganizationProjectsPage;
