import { toaster } from "@/components/ui/toaster";
import { api } from "@/services/api";
import {
  Box,
  Checkbox,
  Field,
  FieldRoot,
  Fieldset,
  Heading,
  HStack,
  Icon,
  Link,
  NativeSelect,
  Tabs,
  Text,
} from "@chakra-ui/react";
import { TFunction } from "i18next";
import React, { FC, useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import CommaSeperatedInput from "./CommaSeperatedInput";
import { MdInfoOutline, MdWarning } from "react-icons/md";
import { Trans } from "react-i18next";
import CustomSelectableButton from "@/components/custom-selectable-buttons";
import { Button } from "@/components/ui/button";
import { RadioGroup } from "@/components/ui/custom-radio";
import CityAutocompleteInput from "./CityAutoCompleteInput";
import { hasFeatureFlag } from "@/util/feature-flags";
import { logger } from "@/services/logger";

interface BulkActionsTabContentProps {
  t: TFunction;
  onTabReset?: () => void;
}
type CityDetails = {
  cityName: string;
  cityLocode: string;
};
export interface BulkCreationInputs {
  projectId: string;
  cities: string[];
  years: number[];
  emails: string[];
  inventoryGoal: string;
  globalWarmingPotential: string;
  connectSources: boolean;
}

const BulkActionsTabContent: FC<BulkActionsTabContentProps> = ({
  t,
  onTabReset,
}) => {
  // React hook form to manage form state
  const {
    control,
    register,
    handleSubmit,
    formState: { errors },
    setValue,
    reset,
  } = useForm<BulkCreationInputs>();

  // Local states to hold our comma separated arrays
  const [citiesArray, setCitiesArray] = useState<string[]>([]);
  const [yearsArray, setYearsArray] = useState<number[]>([]);
  const [emailsArray, setEmailsArray] = useState<string[]>([]);

  // When a user updates one of the fields, also update the react-hook-form value:
  const handleCitiesChange = (values: string[]) => {
    setCitiesArray(values);
    setValue("cities", values);
  };

  const handleYearsChange = (values: string[]) => {
    const numericYears = values.map((year) => +year);
    setYearsArray(numericYears);
    setValue("years", numericYears);
  };

  const handleEmailsChange = (values: string[]) => {
    setEmailsArray(values);
    setValue("emails", values);
  };
  const [selectedInventoryGoalValue, setSelectedInventoryGoalValue] =
    useState("");
  const [
    selectedGlobalWarmingPotentialValue,
    setSelectedGlobalWarmingPotentialValue,
  ] = useState("");
  let year;
  const inventoryGoalOptions: string[] = ["gpc_basic", "gpc_basic_plus"];
  const globalWarmingPotential: string[] = ["AR5", "AR6"];

  // Handle inventory Goal Radio Input
  // Set default inventory goal form value
  useEffect(() => {
    setValue("inventoryGoal", "gpc_basic");
    setValue("globalWarmingPotential", "ar6");
  }, [setValue]);

  // create bulk inventories api
  const [createBulkInventories, { isLoading, isError }] =
    api.useCreateBulkInventoriesMutation();

  // fetch projects api

  const { data: projectsList, isLoading: isProjectListLoading } =
    api.useGetUserProjectsQuery({});

  const [
    connectBulkSources,
    { isLoading: isConnectSourcesLoading, data: isConnectSourcesData },
  ] = api.useConnectDataSourcesMutation();

  const onSubmit = async (data: BulkCreationInputs) => {
    await createBulkInventories({
      projectId: data.projectId,
      cityLocodes: data.cities,
      emails: data.emails,
      years: data.years,
      scope: data.inventoryGoal,
      gwp: data.globalWarmingPotential,
    });

    if (isLoading) {
      toaster.create({
        type: "loading",
        description: t("bulk-inventory-creation-loading"),
      });
    } else if (!isError) {
      toaster.create({
        type: "success",
        description: t("bulk-inventory-creation-success"),
      });

      // Reset form
      reset();
      setCitiesArray([]);
      setYearsArray([]);
      setEmailsArray([]);
      setSelectedInventoryGoalValue("");
      setSelectedGlobalWarmingPotentialValue("");

      // Reset tab if callback provided
      onTabReset?.();

      emailsArray.forEach(async (email) => {
        await connectBulkSources({
          cityLocodes: citiesArray,
          userEmail: email,
          years: yearsArray,
        });
        if (isConnectSourcesLoading) {
          toaster.create({
            type: "loading",
            description: t("bulk-inventory-creation-loading"),
          });
        } else {
          if (isConnectSourcesData?.errors.length > 0) {
            toaster.create({
              type: "error",
              description: t("bulk-inventory-connection-error"),
            });
            logger.error(isConnectSourcesData.errors);
          } else {
            toaster.create({
              type: "success",
              description: t("bulk-inventory-connection-success"),
            });
          }
        }
      });
    }
  };

  // Show toast notifications for connect sources

  const onCancel = () => {
    reset();
    setCitiesArray([]);
    setYearsArray([]);
    setEmailsArray([]);
  };
  return (
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
          {t("bulk-inventory-creation-caption")}
        </Text>
      </Box>
      <Box>
        <Fieldset.Root size="lg" maxW="full" py="36px">
          <Fieldset.Content display="flex" flexDir="column" gap="36px">
            <FieldRoot>
              {" "}
              <Field.Label
                fontFamily="heading"
                fontWeight="medium"
                fontSize="body.md"
                mb="4px"
              >
                {t("project")}
              </Field.Label>
              <NativeSelect.Root>
                <NativeSelect.Field
                  h="56px"
                  boxShadow="1dp"
                  {...register("projectId", {
                    required: "A project is required",
                  })}
                >
                  {projectsList?.map((project) => (
                    <option value={project.projectId} key={project.projectId}>
                      {project.name}
                    </option>
                  ))}
                </NativeSelect.Field>
                <NativeSelect.Indicator />
              </NativeSelect.Root>
            </FieldRoot>

            <Controller
              name="cities"
              defaultValue={[]}
              control={control}
              rules={{
                required: t("cities-input-required"),
              }}
              render={({ field, fieldState: { error } }) => (
                <CityAutocompleteInput
                  // You can pass an empty array as the initial list or map your existing form values to the City type if available
                  initialValues={[]}
                  onChange={(selectedCities) => {
                    // Update form field with only the cityLocode values
                    field.onChange(selectedCities.map((city) => city.actor_id));
                  }}
                  t={t}
                  error={error}
                />
              )}
            />

            <Controller
              name="years"
              defaultValue={[]}
              control={control}
              rules={{
                required: t("cities-input-required"),
              }}
              render={({ field, fieldState: { error } }) => (
                <CommaSeperatedInput
                  onChange={handleYearsChange}
                  field="years"
                  t={t}
                  errors={error}
                  inputType="number"
                  tipContent={
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
                  }
                />
              )}
            />
            <Controller
              name="emails"
              defaultValue={[]}
              control={control}
              rules={{
                required: t("cities-input-required"),
              }}
              render={({ field, fieldState: { error } }) => (
                <CommaSeperatedInput
                  onChange={handleEmailsChange}
                  field="emails"
                  t={t}
                  errors={error}
                  inputType="email"
                  tipContent={
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
                  }
                />
              )}
            />
            {/* Inventory Goal */}
            <Box w="full" py="36px">
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
                          onValueChange={(e) => field.onChange(e.value)}
                        >
                          <HStack gap="16px">
                            {inventoryGoalOptions.map((value) => {
                              return (
                                <CustomSelectableButton
                                  field={field}
                                  key={value}
                                  value={value}
                                  inputValue={selectedInventoryGoalValue}
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
                      color="sentiment.negativeDefault"
                    >
                      <MdWarning height="16px" width="16px" />
                      <Text fontSize="body.md" fontStyle="normal">
                        {errors.inventoryGoal.message}
                      </Text>
                    </Box>
                  )}
                </Box>
              </Box>
            </Box>
            {/* Global Warming Potential */}
            <Box w="full" py="36px">
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
                      We recommend using AR6 (latest version) for your inventory
                      calculations. If you city has previous inventories, use
                      the same version as before.{" "}
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
                      required: t("global-warming-potential-required"),
                    }}
                    render={({ field }) => (
                      <RadioGroup
                        value={field.value}
                        onValueChange={(e) => {
                          field.onChange(e);
                          setSelectedGlobalWarmingPotentialValue(e.value);
                        }}
                      >
                        <HStack gap="16px">
                          {globalWarmingPotential.map((value) => {
                            return (
                              <CustomSelectableButton
                                field={field}
                                key={value}
                                value={value}
                                inputValue={selectedGlobalWarmingPotentialValue}
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
                  {errors.globalWarmingPotential && (
                    <Box
                      display="flex"
                      gap="6px"
                      alignItems="center"
                      py="16px"
                      color="sentiment.negativeDefault"
                    >
                      <MdWarning height="16px" width="16px" />
                      <Text fontSize="body.md" fontStyle="normal">
                        {errors.globalWarmingPotential.message}
                      </Text>
                    </Box>
                  )}
                </Box>
              </Box>
            </Box>
            {/* Connect datasources checkbox */}
            <Checkbox.Root defaultChecked invalid={!!errors.connectSources}>
              <Checkbox.HiddenInput
                {...register("connectSources", {
                  required: t("connectSources-input-required"),
                })}
              />
              <Checkbox.Control />
              <Checkbox.Label
                fontSize="body.lg"
                color="content.secondary"
                letterSpacing="wide"
              >
                {t("connect-datasources-label")}
              </Checkbox.Label>
              <Box>
                {errors.connectSources && (
                  <Box
                    display="flex"
                    gap="6px"
                    alignItems="center"
                    py="16px"
                    color="sentiment.negativeDefault"
                  >
                    <MdWarning height="16px" width="16px" />
                    <Text fontSize="body.md" fontStyle="normal">
                      {errors.connectSources.message}
                    </Text>
                  </Box>
                )}
              </Box>
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
              onClick={onCancel}
            >
              {t("cancel")}
            </Button>
            <Button
              type="submit"
              alignSelf="flex-start"
              loading={isLoading || isConnectSourcesLoading}
              p="32px"
              onClick={handleSubmit(onSubmit)}
            >
              {t("create-all")}
            </Button>
          </Box>
        </Fieldset.Root>
      </Box>
    </Tabs.Content>
  );
};

export default BulkActionsTabContent;
