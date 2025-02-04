import { TFunction } from "i18next";
import {
  Control,
  Controller,
  FieldErrors,
  UseFormRegister,
} from "react-hook-form";
import { Inputs } from "../../app/[lng]/onboarding/setup/page";
import { useEffect } from "react";
import {
  Box,
  createListCollection,
  Heading,
  HStack,
  Icon,
  Link,
  Text,
} from "@chakra-ui/react";
import { MdCheck, MdWarning } from "react-icons/md";
import { Trans } from "react-i18next";
import { CustomRadio, RadioGroup } from "@/components/ui/custom-radio";
import { InputGroup } from "@/components/ui/input-group";
import {
  SelectContent,
  SelectItem,
  SelectLabel,
  SelectRoot,
  SelectTrigger,
  SelectValueText,
} from "@/components/ui/select";
import { Field } from "@/components/ui/field";

export default function SetInventoryDetailsStep({
  t,
  register,
  errors,
  control,
  setValue,
  years,
}: {
  t: TFunction;
  register: UseFormRegister<Inputs>;
  errors: FieldErrors<Inputs>;
  control: Control<Inputs>;
  setValue: any;
  years: number[];
}) {
  let year;
  const inventoryGoalOptions: string[] = ["gpc_basic", "gpc_basic_plus"];
  const globalWarmingPotential: string[] = ["ar5", "ar6"];

  // Handle inventory Goal Radio Input
  // Set default inventory goal form value
  useEffect(() => {
    setValue("inventoryGoal", "gpc_basic");
    setValue("globalWarmingPotential", "ar6");
  }, [setValue]);

  const yearsCollection = createListCollection({
    items: years.map((year) => ({
      label: year.toString(),
      value: year,
    })),
  });

  return (
    <Box w="full">
      <Box
        minW={400}
        w="full"
        display="flex"
        flexDir="column"
        gap="24px"
        mb="48px"
      >
        <Heading data-testId="inventory-details-heading" size="xl">
          {t("setup-inventory-details-heading")}
        </Heading>
        <Text
          color="content.tertiary"
          fontSize="body.lg"
          fontStyle="normal"
          fontWeight="400"
          letterSpacing="wide"
          data-testId="inventory-details-description"
        >
          {t("setup-inventory-details-description")}
        </Text>
      </Box>
      {/* Inventory Year */}
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
          <Box>
            <Text
              fontFamily="heading"
              fontSize="title.md"
              fontStyle="normal"
              fontWeight="bold"
              lineHeight="24px"
              data-testId="inventory-year"
            >
              {t("inventory-year")}
            </Text>
          </Box>
          <Box>
            <Field
              invalid={!!errors.year}
              errorText={
                <Box gap="6px" m={0}>
                  <Icon as={MdWarning} boxSize={4} display="inline" />
                  <Text
                    fontSize="body.md"
                    color="content.tertiary"
                    fontStyle="normal"
                  >
                    {errors.year?.message}
                  </Text>
                </Box>
              }
            >
              <InputGroup
                endElement={
                  !!year && (
                    <Icon
                      as={MdCheck}
                      color="semantic.success"
                      boxSize={4}
                      mt={2}
                      mr={10}
                    />
                  )
                }
              >
                <SelectRoot
                  collection={yearsCollection}
                  size="lg"
                  w="400px"
                  shadow="1dp"
                  fontSize="body.lg"
                  fontStyle="normal"
                  letterSpacing="wide"
                  _placeholder={{ color: "content.tertiary" }}
                  py="16px"
                  data-testId="inventory-detils-year"
                  px={0}
                  {...register("year", {
                    required: t("inventory-year-required"),
                  })}
                >
                  <SelectLabel />
                  <SelectTrigger>
                    <SelectValueText
                      placeholder={t("inventory-year-placeholder")}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {yearsCollection.items.map(
                      (year: { label: string; value: number }, i: number) => (
                        <SelectItem item={year} key={i}>
                          {year.label}
                        </SelectItem>
                      ),
                    )}
                  </SelectContent>
                </SelectRoot>
              </InputGroup>
            </Field>
          </Box>
        </Box>
      </Box>
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
              {t("inventory-goal")}
            </Text>
            <Text
              fontSize="title.md"
              fontStyle="normal"
              lineHeight="24px"
              letterSpacing="wide"
              color="content.tertiary"
            >
              <Trans i18nKey="inventory-goal-description" t={t}>
                Want to learn more about these inventory formats?{" "}
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
                          <CustomRadio value={value} key={value}>
                            {t(value)}
                          </CustomRadio>
                        );
                      })}
                    </HStack>
                  </RadioGroup>
                </>
              )}
            />
            <Box display="flex" gap="6px" alignItems="center" py="16px">
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
                {errors.inventoryGoal && errors.inventoryGoal.message}
              </Text>
            </Box>
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
                Want to learn more about these inventory formats?{" "}
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
              name="globalWarmingPotential"
              control={control}
              rules={{
                required: t("global-warming-potential-required"),
              }}
              render={({ field }) => (
                <RadioGroup
                  value={field.value}
                  onValueChange={(e) => field.onChange(e.value)}
                >
                  <HStack gap="16px">
                    {globalWarmingPotential.map((value) => {
                      return (
                        <CustomRadio value={value} key={value}>
                          {t(value)}
                        </CustomRadio>
                      );
                    })}
                  </HStack>
                </RadioGroup>
              )}
            />
          </Box>
        </Box>
      </Box>
    </Box>
  );
}
