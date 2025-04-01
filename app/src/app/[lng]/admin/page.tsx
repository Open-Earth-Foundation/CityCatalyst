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
import { useTranslation } from "@/i18n/client";
import { BsPlus } from "react-icons/bs";
import React, { useState } from "react";
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
import { MdForwardToInbox, MdMoreVert, MdOutlineGroup } from "react-icons/md";
import { useRouter } from "next/navigation";
import { OrganizationRole } from "@/util/types";
import { toaster } from "@/components/ui/toaster";

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
        {isOrgDataLoading && (
          <div className="flex items-center justify-center w-full">
            <Box className="w-full py-12 flex items-center justify-center">
              <ProgressCircleRoot value={null}>
                <ProgressCircleRing cap="round" />
              </ProgressCircleRoot>
            </Box>
          </div>
        )}
        {!isOrgDataLoading && orgData.length === 0 && (
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
                          handleReInvite(item.contactEmail, item.organizationId)
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
      <CreateOrganizationModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        t={t}
        onOpenChange={setIsModalOpen}
      />
    </Box>
  );
};

export default AdminPage;
