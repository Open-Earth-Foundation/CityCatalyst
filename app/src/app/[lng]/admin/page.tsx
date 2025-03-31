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

interface OrgData {
  contactEmail: string;
  created: string;
  last_updated: string;
  name: string;
  organizationId: string;
  status: "accepted" | "invite sent";
}
type CityDetails = {
  cityName: string;
  cityLocode: string;
};
interface BulkCreationInputs {
  cities: CityDetails[];
  year: string[];
  emails: string[];
  inventoryGoal: string;
  globalWarmingPotential: string;
  connectSources: boolean;
}

const AdminPage = ({ params: { lng } }: { params: { lng: string } }) => {
  const { t } = useTranslation(lng, "admin");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const router = useRouter();

  const { data: organizationData, isLoading: isOrgDataLoading } =
    api.useGetOrganizationsQuery({});

  // React hook form to manage form state
  const {
    control,
    register,
    handleSubmit,
    formState: { errors },
    setValue,
  } = useForm<BulkCreationInputs>();

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

  const BulkActionsTabTrigger: FC<{ title: string }> = ({ title }) => {
    return (
      <Tabs.Trigger
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
  const [selectedInventoryGoalValue, setSelectedInventoryGoalValue] =
    useState("");
  const [
    selectedGlobalWarmingPotentialValue,
    setSelectedGlobalWarmingPotentialValue,
  ] = useState("");
  let year;
  const inventoryGoalOptions: string[] = ["gpc_basic", "gpc_basic_plus"];
  const globalWarmingPotential: string[] = ["ar5", "ar6"];

  // Handle inventory Goal Radio Input
  // Set default inventory goal form value
  useEffect(() => {
    setValue("inventoryGoal", "gpc_basic");
    setValue("globalWarmingPotential", "ar6");
  }, [setValue]);

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

              {!isOrgDataLoading && orgData && orgData.length > 0 && (
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
          </Tabs.Content>
          <Tabs.Content value="projects">Manage your projects</Tabs.Content>
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
                <BulkActionsTabTrigger title="bulk-data-connection" />
                <BulkActionsTabTrigger title="bulk-user-creation" />
                <BulkActionsTabTrigger title="bulk-inventory-removing" />
                <Tabs.Indicator rounded="l2" />
              </Tabs.List>
              <Tabs.Content value="bulk-inventory-creation" px="60px" py="24px">
                <Box>
                  <Heading
                    fontSize="title.md"
                    mb={2}
                    fontWeight="semibold"
                    lineHeight="32px"
                    fontStyle="normal"
                    textTransform="initial"
                    color="content.secondary"
                  >
                    {t("bulk-inventory-creation")}
                  </Heading>
                  <Text color="content.tertiary" fontSize="body.lg">
                    {t("bulk-inventory-creation-caption")}{" "}
                  </Text>
                </Box>
                <Box>
                  <Fieldset.Root size="lg" maxW="full" py="36px">
                    <Fieldset.Content>
                      <Field.Root>
                        <Field.Label fontFamily="heading">
                          {t("city-input-label")}
                        </Field.Label>
                        <Input
                          h="56px"
                          boxShadow="1dp"
                          {...register("cities", {
                            required: t("city-input-required"),
                          })}
                        />
                        <Box
                          display={"flex"}
                          gap="8px"
                          alignItems="center"
                          fontSize="body.sm"
                          color="content.tertiary"
                          fontWeight="400"
                        >
                          <Icon
                            as={MdInfoOutline}
                            color="content.link"
                            boxSize={4}
                          />
                          <Text>{t("know-your-city-tip")}</Text>
                          <Link
                            href="https://unece.org/trade/cefact/unlocode-code-list-country-and-territory"
                            textDecor="underline"
                          >
                            {t("un-locode-link")}
                          </Link>
                        </Box>
                      </Field.Root>

                      <Field.Root>
                        <Field.Label fontFamily="heading">
                          {t("year-input-label")}
                        </Field.Label>
                        <Input name="name" h="56px" boxShadow="1dp" />
                        <Box
                          display={"flex"}
                          gap="8px"
                          alignItems="center"
                          fontSize="body.sm"
                          color="content.tertiary"
                          fontWeight="400"
                        >
                          <Icon
                            as={MdInfoOutline}
                            color="content.link"
                            boxSize={4}
                          />
                          <Text>{t("years-input-tip")}</Text>
                        </Box>
                      </Field.Root>

                      <Field.Root>
                        <Field.Label fontFamily="heading">
                          {t("email-input-label")}
                        </Field.Label>
                        <Input name="name" h="56px" boxShadow="1dp" />
                        <Box
                          display={"flex"}
                          gap="8px"
                          alignItems="center"
                          fontSize="body.sm"
                          color="content.tertiary"
                          fontWeight="400"
                        >
                          <Icon
                            as={MdInfoOutline}
                            color="content.link"
                            boxSize={4}
                          />
                          <Text>{t("emails-input-tip")}</Text>
                        </Box>
                      </Field.Root>
                      {/* Inventory Goal */}
                      <Box
                        w="full"
                        py="36px"
                        borderBottomWidth="2px"
                        borderColor="border.overlay"
                      >
                        <Box
                          display="flex"
                          w="full"
                          alignItems="center"
                          justifyContent="space-between"
                        >
                          <Box display="flex" flexDir="column" gap="16px">
                            <Text
                              fontFamily="heading"
                              fontSize="title.md"
                              fontStyle="normal"
                              fontWeight="bold"
                              lineHeight="24px"
                            >
                              {t("reporting-level-heading")}
                            </Text>
                            <Text
                              fontSize="title.md"
                              fontStyle="normal"
                              lineHeight="24px"
                              letterSpacing="wide"
                              color="content.tertiary"
                            >
                              <Trans i18nKey="inventory-goal-description" t={t}>
                                Want to learn more about these inventory levels?{" "}
                                <Link
                                  href="/"
                                  fontFamily="heading"
                                  fontWeight="bold"
                                  color="content.link"
                                  textDecorationLine="underline"
                                >
                                  Learn more
                                </Link>{" "}
                                about the GPC Framework.
                              </Trans>
                            </Text>
                          </Box>
                          <Box>
                            <Controller
                              name="inventoryGoal"
                              control={control}
                              rules={{
                                required: t("inventory-goal-required"),
                              }}
                              render={({ field }) => (
                                <>
                                  <RadioGroup
                                    value={field.value}
                                    onValueChange={(e) =>
                                      field.onChange(e.value)
                                    }
                                  >
                                    <HStack gap="16px">
                                      {inventoryGoalOptions.map((value) => {
                                        return (
                                          <CustomSelectableButton
                                            field={field}
                                            key={value}
                                            value={value}
                                            inputValue={
                                              selectedInventoryGoalValue
                                            }
                                            inputValueFunction={
                                              setSelectedInventoryGoalValue
                                            }
                                            t={t}
                                          />
                                        );
                                      })}
                                    </HStack>
                                  </RadioGroup>
                                </>
                              )}
                            />
                            {errors.inventoryGoal && (
                              <Box
                                display="flex"
                                gap="6px"
                                alignItems="center"
                                py="16px"
                              >
                                <MdWarning
                                  color="sentiment.negativeDefault"
                                  height="16px"
                                  width="16px"
                                />
                                <Text
                                  fontSize="body.md"
                                  color="content.tertiary"
                                  fontStyle="normal"
                                >
                                  {errors.inventoryGoal.message}
                                </Text>
                              </Box>
                            )}
                          </Box>
                        </Box>
                      </Box>
                      {/* Global Warming Potential */}
                      <Box
                        w="full"
                        py="36px"
                        borderBottomWidth="2px"
                        borderColor="border.overlay"
                      >
                        <Box
                          display="flex"
                          w="full"
                          alignItems="center"
                          justifyContent="space-between"
                        >
                          <Box display="flex" flexDir="column" gap="16px">
                            <Text
                              fontFamily="heading"
                              fontSize="title.md"
                              fontStyle="normal"
                              fontWeight="bold"
                              lineHeight="24px"
                            >
                              {t("gwp-heading")}
                            </Text>
                            <Text
                              fontSize="title.md"
                              fontStyle="normal"
                              lineHeight="24px"
                              letterSpacing="wide"
                              color="content.tertiary"
                            >
                              <Trans i18nKey="gwp-description" t={t}>
                                We recommend using AR6 (latest version) for your
                                inventory calculations. If you city has previous
                                inventories, use the same version as before.{" "}
                                <Link
                                  href="/"
                                  fontFamily="heading"
                                  fontWeight="bold"
                                  color="content.link"
                                  textDecorationLine="underline"
                                >
                                  Learn more
                                </Link>{" "}
                                about GWP.
                              </Trans>
                            </Text>
                          </Box>
                          <Box>
                            <Controller
                              name="globalWarmingPotential"
                              control={control}
                              rules={{
                                required: t(
                                  "global-warming-potential-required",
                                ),
                              }}
                              render={({ field }) => (
                                <RadioGroup
                                  value={field.value}
                                  onValueChange={(e) => {
                                    field.onChange(e);
                                    setSelectedGlobalWarmingPotentialValue(
                                      e.value,
                                    );
                                  }}
                                >
                                  <HStack gap="16px">
                                    {globalWarmingPotential.map((value) => {
                                      return (
                                        <CustomSelectableButton
                                          field={field}
                                          key={value}
                                          value={value}
                                          inputValue={
                                            selectedGlobalWarmingPotentialValue
                                          }
                                          inputValueFunction={
                                            setSelectedGlobalWarmingPotentialValue
                                          }
                                          t={t}
                                        />
                                      );
                                    })}
                                  </HStack>
                                </RadioGroup>
                              )}
                            />
                          </Box>
                        </Box>
                      </Box>
                      {/* Connect datasources checkbox */}
                      <Checkbox.Root defaultChecked>
                        <Checkbox.HiddenInput />
                        <Checkbox.Control />
                        <Checkbox.Label
                          fontSize="body.lg"
                          color="content.secondary"
                          letterSpacing="wide"
                        >
                          {t("connect-datasources-label")}
                        </Checkbox.Label>
                      </Checkbox.Root>
                    </Fieldset.Content>

                    <Box
                      display="flex"
                      alignItems="center"
                      mt="48px"
                      w="full"
                      gap="24px"
                      justifyContent="right"
                    >
                      <Button
                        type="submit"
                        alignSelf="flex-start"
                        variant="outline"
                        p="32px"
                      >
                        {t("cancel")}
                      </Button>
                      <Button type="submit" alignSelf="flex-start" p="32px">
                        {t("create-all")}
                      </Button>
                    </Box>
                  </Fieldset.Root>
                </Box>
              </Tabs.Content>
              <Tabs.Content value="bulk-data-connection">
                Export data
              </Tabs.Content>
              <Tabs.Content value="bulk-user-creation">
                Bulk actions
              </Tabs.Content>
              <Tabs.Content value="bulk-inventory-removing">
                Bulk actions
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
    </Box>
  );
};

export default AdminPage;
