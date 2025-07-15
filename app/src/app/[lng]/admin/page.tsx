"use client";

import {
  Box,
  Button,
  Heading,
  Icon,
  IconButton,
  Link,
  Table,
  Tabs,
  Text,
  Spinner,
} from "@chakra-ui/react";
import { useTranslation } from "@/i18n/client";
import { BsPlus } from "react-icons/bs";
import React, { FC, useState, use } from "react";
import CreateOrganizationModal from "@/app/[lng]/admin/CreateOrganizationModal";
import { api } from "@/services/api";
import DataTable from "@/components/ui/data-table";
import { Tag } from "@/components/ui/tag";
import {
  MenuContent,
  MenuItem,
  MenuRoot,
  MenuTrigger,
} from "@/components/ui/menu";
import {
  MdForwardToInbox,
  MdMoreVert,
  MdOutlineGroup,
  MdPauseCircleOutline,
  MdPlayCircleOutline,
} from "react-icons/md";
import { useRouter } from "next/navigation";
import { Toaster } from "@/components/ui/toaster";
import BulkInventoryCreationTabContent from "./bulk-inventory-actions/BulkInventoryCreationTabContent";
import BulkDownloadTabContent from "./bulk-inventory-actions/BulkDownloadTabContent";
import { OrganizationRole } from "@/util/types";
import { toaster } from "@/components/ui/toaster";
import ProgressLoader from "@/components/ProgressLoader";

interface OrgData {
  contactEmail: string;
  created: string;
  last_updated: string;
  name: string;
  organizationId: string;
  status: "accepted" | "invite sent" | "frozen";
}

const AdminPage = (props: { params: Promise<{ lng: string }> }) => {
  const { lng } = use(props.params);
  const { t } = useTranslation(lng, "admin");

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [bulkActionsTab, setBulkActionsTab] = useState(
    "bulk-inventory-creation",
  );
  const router = useRouter();

  const renderStatusTag = (status: string) => {
    if (status === "frozen") {
      return (
        <Tag size="lg" colorPalette="blue">
          {t("frozen")}
        </Tag>
      );
    }

    if (status === "accepted") {
      return (
        <Tag size="lg" colorPalette="green">
          {t("accepted")}
        </Tag>
      );
    }

    return (
      <Tag size="lg" colorPalette="yellow">
        {t("invite-sent")}
      </Tag>
    );
  };

  const { data: organizationData, isLoading: isOrgDataLoading } =
    api.useGetOrganizationsQuery({});
  const orgData = organizationData as OrgData[];
  const TabTrigger: FC<{ title: string }> = ({ title }) => {
    return (
      <Tabs.Trigger
        value={title}
        _selected={{
          fontFamily: "heading",
          fontWeight: "600",
          color: "content.link",
          shadow: "none !important",
        }}
      >
        {t(title)}
      </Tabs.Trigger>
    );
  };
  const [createOrganizationInvite, { isLoading: isInviteLoading }] =
    api.useCreateOrganizationInviteMutation();

  const [updateOrganizationActiveStatus, { isLoading: isUpdatingStatus }] =
    api.useUpdateOrganizationActiveStatusMutation();

  const handleReInvite = async (email: string, organizationId: string) => {
    toaster.create({
      title: t("sending-invite"),
      type: "info",
    });
    const inviteResponse = await createOrganizationInvite({
      organizationId,
      inviteeEmails: [email],
      role: OrganizationRole.ORG_ADMIN,
    });
    if (inviteResponse.data) {
      toaster.dismiss();
      toaster.create({
        title: t("invite-sent-success"),
        type: "success",
        duration: 3000,
      });
    } else {
      toaster.dismiss();
      toaster.create({
        title: t("invite-sent-error"),
        type: "error",
        duration: 3000,
      });
    }
  };

  const handleChangeOrganizationStatus = async (
    activeStatus: boolean,
    organizationId: string,
  ) => {
    const updateStatusResponse = updateOrganizationActiveStatus({
      activeStatus,
      organizationId,
    });

    toaster.promise(updateStatusResponse, {
      success: {
        title: t("organization-status-updated"),
      },
      error: {
        title: t("error-occurred"),
      },
      loading: { title: t("updating-status") },
    });
  };

  const BulkActionsTabTrigger: FC<{ title: string; disabled?: boolean }> = ({
    title,
    disabled,
  }) => {
    return (
      <Tabs.Trigger
        disabled={disabled}
        value={title}
        _selected={{
          fontFamily: "heading",
          fontWeight: "600",
          color: "content.link",
          shadow: "none !important",
          border: "1px solid !important",
          bg: "background.neutral",
          borderRadius: "8px",
        }}
        css={{
          padding: "24px !important",
          mb: "12px",
          textAlign: "left",
          textWrap: "nowrap",
          fontFamily: "heading",
        }}
      >
        {t(title)}
      </Tabs.Trigger>
    );
  };
  return (
    <Box className="pt-16 pb-16  w-[1090px] mx-auto px-4">
      <Link href={`/${lng}`} _hover={{ textDecoration: "none" }}>
        <Box
          display="flex"
          alignItems="center"
          gap="8px"
          color="content.tertiary"
        >
          <Text
            textTransform="uppercase"
            fontFamily="heading"
            fontSize="body.lg"
            fontWeight="normal"
          >
            {t("go-back")}
          </Text>
        </Box>
      </Link>
      <Heading
        fontSize="headline.lg"
        fontWeight="semibold"
        color="content.primary"
        mb={12}
        mt={2}
        className="w-full"
      >
        {t("admin-heading")}
      </Heading>
      {/* Admin Tabs */}
      <Box>
        <Tabs.Root defaultValue="organizations" variant="line">
          <Tabs.List bg="bg.muted" border="none" rounded="l3" p="1">
            <TabTrigger title="organizations" />
            <TabTrigger title="bulk-actions" />
            <Tabs.Indicator rounded="l2" />
          </Tabs.List>
          <Tabs.Content value="organizations">
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
                  {t("oef-organizations")}
                </Heading>
                <Text color="content.tertiary" fontSize="body.lg">
                  {t("admin-caption")}
                </Text>
              </Box>
              <Button
                onClick={() => setIsModalOpen(true)}
                variant="ghost"
                h="48px"
                bg="interactive.secondary"
                color="base.light"
                mt="auto"
              >
                <Icon as={BsPlus} h={8} w={8} />
                {t("add-organization")}
              </Button>
            </Box>
            <Box>
              {isOrgDataLoading && <ProgressLoader />}
              {!isOrgDataLoading && orgData?.length === 0 && (
                <Text color="content.tertiary" fontSize="body.lg">
                  {t("no-data")}
                </Text>
              )}

              {!isOrgDataLoading && orgData && orgData?.length > 0 && (
                <DataTable
                  searchable={true}
                  pagination={true}
                  filterProperty={"status"}
                  filterOptions={["accepted", "invite sent"]}
                  data={[...orgData].reverse()}
                  title={t("manage-oef-clients")}
                  columns={[
                    { header: t("organization"), accessor: "name" },
                    {
                      header: t("email"),
                      accessor: "contactEmail",
                    },
                    { header: t("status"), accessor: "status" },
                    { header: "", accessor: null },
                  ]}
                  renderRow={(item, idx) => (
                    <Table.Row key={idx}>
                      <Table.Cell>{item.name}</Table.Cell>
                      <Table.Cell>{item.contactEmail}</Table.Cell>
                      <Table.Cell> {renderStatusTag(item.status)}</Table.Cell>
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
                          <MenuContent
                            w="auto"
                            borderRadius="8px"
                            shadow="2dp"
                            px="0"
                          >
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
                              onClick={() =>
                                handleReInvite(
                                  item.contactEmail,
                                  item.organizationId,
                                )
                              }
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
                            {item.status === "frozen" ? (
                              <MenuItem
                                value={t("unfreeze-account")}
                                valueText={t("unfreeze-account")}
                                p="16px"
                                display="flex"
                                alignItems="center"
                                gap="16px"
                                _hover={{
                                  bg: "content.link",
                                  cursor: "pointer",
                                }}
                                className="group"
                                onClick={() => {
                                  handleChangeOrganizationStatus(
                                    true,
                                    item.organizationId,
                                  );
                                }}
                              >
                                <Icon
                                  className="group-hover:text-white"
                                  color="interactive.control"
                                  as={MdPlayCircleOutline}
                                  h="24px"
                                  w="24px"
                                />
                                <Text
                                  className="group-hover:text-white"
                                  color="content.primary"
                                >
                                  {t("unfreeze-account")}
                                </Text>
                              </MenuItem>
                            ) : (
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
                                onClick={() => {
                                  handleChangeOrganizationStatus(
                                    false,
                                    item.organizationId,
                                  );
                                }}
                              >
                                <Icon
                                  className="group-hover:text-white"
                                  color="interactive.control"
                                  as={MdPauseCircleOutline}
                                  h="24px"
                                  w="24px"
                                />
                                <Text
                                  className="group-hover:text-white"
                                  color="content.primary"
                                >
                                  {t("freeze-account")}
                                </Text>
                              </MenuItem>
                            )}
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
          </Tabs.Content>
          <Tabs.Content value="projects">
            {/* Manage your projects */}
          </Tabs.Content>
          <Tabs.Content value="bulk-actions">
            <Box display="flex" flexDirection="column" gap="8px">
              <Heading
                fontSize="headline.sm"
                mb={2}
                fontWeight="semibold"
                lineHeight="32px"
                fontStyle="normal"
                textTransform="initial"
                color="content.secondary"
              >
                {t("bulk-actions")}
              </Heading>
              <Text color="content.tertiary" fontSize="body.lg">
                {t("bulk-actions-caption")}
              </Text>
            </Box>
            {/* Bulk actions tabs */}
            <Tabs.Root
              defaultValue="bulk-inventory-creation"
              orientation="vertical"
              mt="48px"
              variant="subtle"
              value={bulkActionsTab}
              onValueChange={(details) => setBulkActionsTab(details.value)}
            >
              <Tabs.List bg="bg.muted" border="none" rounded="l3" p="1">
                <BulkActionsTabTrigger title="bulk-inventory-creation" />
                <BulkActionsTabTrigger title="bulk-data-download" />
                <BulkActionsTabTrigger title="bulk-data-connection" disabled />
                <BulkActionsTabTrigger title="bulk-user-creation" disabled />
                <BulkActionsTabTrigger
                  title="bulk-inventory-removing"
                  disabled
                />
                <Tabs.Indicator rounded="l2" />
              </Tabs.List>
              <BulkInventoryCreationTabContent
                t={t}
                onTabReset={() => setBulkActionsTab("bulk-inventory-creation")}
              />
              <BulkDownloadTabContent t={t} />

              {/* TODO add more actions */}
              <Tabs.Content value="bulk-data-connection">
                {/* Export data */}
              </Tabs.Content>
              <Tabs.Content value="bulk-user-creation">
                {/* Bulk actions */}
              </Tabs.Content>
              <Tabs.Content value="bulk-inventory-removing">
                {/* Bulk actions */}
              </Tabs.Content>
            </Tabs.Root>
          </Tabs.Content>
        </Tabs.Root>
      </Box>

      <CreateOrganizationModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        t={t}
        onOpenChange={setIsModalOpen}
      />
      <Toaster />
    </Box>
  );
};

export default AdminPage;
