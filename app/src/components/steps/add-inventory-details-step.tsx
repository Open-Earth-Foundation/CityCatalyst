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
  FormControl,
  FormErrorMessage,
  Heading,
  HStack,
  InputGroup,
  InputRightElement,
  Link,
  Select,
  Text,
  useRadioGroup,
  UseRadioGroupProps,
} from "@chakra-ui/react";
import { CheckIcon, WarningIcon } from "@chakra-ui/icons";
import { Trans } from "react-i18next";
import { CustomRadioButtons } from "@/components/custom-radio-buttons";

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
  }, []);
  const {
    getRootProps: inventoryGoalRootProps,
    getRadioProps: getInventoryGoalRadioProps,
  } = useRadioGroup({
    name: "inventoryGoal",
    defaultValue: "gpc_basic",
    onChange: (value: string) => {
      setValue("inventoryGoal", value!);
    },
  } as UseRadioGroupProps);

  // Handle global warming potential Radio Input
  // Set default global warming potential form value
  const { getRootProps: GWPRootProps, getRadioProps: getGWPRadioProps } =
    useRadioGroup({
      name: "globalWarmingPotential",
      defaultValue: "ar6",
      onChange: (value: string) => {
        setValue("globalWarmingPotential", value!);
      },
    } as UseRadioGroupProps);

  const inventoryGoalGroup = inventoryGoalRootProps();
  const gwpGroup = GWPRootProps();

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
            <FormControl isInvalid={!!errors.year}>
              <InputGroup>
                <Select
                  placeholder={t("inventory-year-placeholder")}
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
                  {years.map((year: number, i: number) => (
                    <option value={year} key={i}>
                      {year}
                    </option>
                  ))}
                </Select>
                <InputRightElement>
                  {!!year && (
                    <CheckIcon
                      color="semantic.success"
                      boxSize={4}
                      mt={2}
                      mr={10}
                    />
                  )}
                </InputRightElement>
              </InputGroup>
              <FormErrorMessage gap="6px" m={0}>
                <WarningIcon h="16px" w="16px" />
                <Text
                  fontSize="body.md"
                  color="content.tertiary"
                  fontStyle="normal"
                >
                  {errors.year && errors.year.message}
                </Text>
              </FormErrorMessage>
            </FormControl>
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
            {/* TODO:
              only enable basic by default and disable basic+ until we have the feature
              */}
            <Controller
              name="inventoryGoal"
              control={control}
              rules={{
                required: t("inventory-goal-required"),
              }}
              render={({ field }) => (
                <>
                  <HStack {...inventoryGoalGroup} gap="16px">
                    {inventoryGoalOptions.map((value) => {
                      const radioProps = getInventoryGoalRadioProps({ value });
                      return (
                        <CustomRadioButtons
                          value={value}
                          isChecked={field.value === value}
                          key={value}
                          {...radioProps}
                        >
                          {t(value)}
                        </CustomRadioButtons>
                      );
                    })}
                  </HStack>
                </>
              )}
            />
            <FormErrorMessage
              display="flex"
              gap="6px"
              alignItems="center"
              py="16px"
            >
              <WarningIcon
                color="sentiment.negativeDefault"
                h="16px"
                w="16px"
              />
              <Text
                fontSize="body.md"
                color="content.tertiary"
                fontStyle="normal"
              >
                {errors.inventoryGoal && errors.inventoryGoal.message}
              </Text>
            </FormErrorMessage>
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
            {/* TODO:
              only enable ar6 and disable ar5 until we have the feature
              */}
            <Controller
              name="globalWarmingPotential"
              control={control}
              rules={{
                required: t("global-warming-potential-required"),
              }}
              render={({ field }) => (
                <>
                  <HStack {...gwpGroup} gap="16px">
                    {globalWarmingPotential.map((value) => {
                      const radioProps = getGWPRadioProps({ value });
                      return (
                        <CustomRadioButtons
                          value={value}
                          isChecked={field.value === value}
                          key={value}
                          {...radioProps}
                        >
                          {t(value)}
                        </CustomRadioButtons>
                      );
                    })}
                  </HStack>
                </>
              )}
            />
          </Box>
        </Box>
      </Box>
    </Box>
  );
}
