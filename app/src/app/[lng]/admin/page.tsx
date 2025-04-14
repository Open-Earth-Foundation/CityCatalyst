"use client";

import {
  Box,
  Button,
  Checkbox,
  Field,
  Fieldset,
  Heading,
  HStack,
  Icon,
  IconButton,
  Input,
  Link,
  Table,
  Tabs,
  Text,
} from "@chakra-ui/react";
import { useTranslation } from "@/i18n/client";
import { BsPlus } from "react-icons/bs";
import React, { FC, useEffect, useState } from "react";
import CreateOrganizationModal from "@/app/[lng]/admin/CreateOrganizationModal";
import { api } from "@/services/api";
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
import {
  MdForwardToInbox,
  MdInfoOutline,
  MdMoreVert,
  MdOutlineGroup,
  MdWarning,
} from "react-icons/md";
import { useRouter } from "next/navigation";
import { Trans } from "react-i18next";
import { Controller, useForm } from "react-hook-form";
import { RadioGroup } from "@/components/ui/radio";
import CustomSelectableButton from "@/components/custom-selectable-buttons";
import CommaSeperatedInput from "./bulk-inventory-actions/CommaSeperatedInput";
import { Toaster } from "@/components/ui/toaster";
import BulkActionsTabContent from "./bulk-inventory-actions/BulkActionsTabContent";
import { OrganizationRole } from "@/util/types";
import { toaster } from "@/components/ui/toaster";
import ProgressLoader from "@/components/ProgressLoader";

interface OrgData {
  contactEmail: string;
  created: string;
  last_updated: string;
  name: string;
  organizationId: string;
  status: "accepted" | "invite sent";
}

const AdminPage = ({ params: { lng } }: { params: { lng: string } }) => {
  const { t } = useTranslation(lng, "admin");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const router = useRouter();

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

  const handleReInvite = async (email: string, organizationId: string) => {
    toaster.create({
      title: t("sending-invite"),
      type: "info",
    });
    const inviteResponse = await createOrganizationInvite({
      organizationId,
      inviteeEmail: email,
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
      <Link href="/" _hover={{ textDecoration: "none" }}>
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
            <TabTrigger title="projects" />
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
                  t={t}
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
                      <Table.Cell>
                        {" "}
                        {item.status === "accepted" ? (
                          <Tag size="lg" colorPalette="green">
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
            >
              <Tabs.List bg="bg.muted" border="none" rounded="l3" p="1">
                <BulkActionsTabTrigger title="bulk-inventory-creation" />
                <BulkActionsTabTrigger title="bulk-data-connection" disabled />
                <BulkActionsTabTrigger title="bulk-user-creation" disabled />
                <BulkActionsTabTrigger
                  title="bulk-inventory-removing"
                  disabled
                />
                <Tabs.Indicator rounded="l2" />
              </Tabs.List>
              <BulkActionsTabContent t={t} />

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
