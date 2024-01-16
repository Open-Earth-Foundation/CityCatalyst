import { RadioButton } from "@/components/radio-button";
import { nameToI18NKey, resolve } from "@/util/helpers";
import { ArrowBackIcon, CloseIcon, WarningIcon } from "@chakra-ui/icons";
import {
  Accordion,
  AccordionButton,
  AccordionIcon,
  AccordionItem,
  AccordionPanel,
  AlertDialog,
  AlertDialogBody,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogOverlay,
  Box,
  Button,
  Center,
  Drawer,
  DrawerContent,
  DrawerOverlay,
  Flex,
  FormControl,
  FormErrorMessage,
  FormLabel,
  HStack,
  Heading,
  IconButton,
  Select,
  Spinner,
  Tag,
  Text,
  Textarea,
  useDisclosure,
} from "@chakra-ui/react";
import type { TFunction } from "i18next";
import type { RefObject } from "react";
import React, { useEffect } from "react";
import { Trans } from "react-i18next/TransWithoutContext";
import { EmissionsForm } from "./EmissionsForm";
import type { SubCategory, SubSector } from "./types";

export function SubsectorDrawer({
  subsector,
  sectorName,
  sectorNumber,
  inventoryId,
  isOpen,
  onClose,
  finalFocusRef,
  t,
}: {
  subsector?: SubSector;
  sectorName?: string;
  sectorNumber?: string; // I, II, III
  inventoryId?: string;
  isOpen: boolean;
  onClose: () => void;
  finalFocusRef?: RefObject<any>;
  t: TFunction;
}) {
  console.log("subsector", subsector);

  const onTryClose = () => {
    if (isDirty) {
      onDialogOpen();
    } else {
      onClose();
    }
  };

  // reset form values when choosing another subsector
  useEffect(() => {
    if (subsectorValue) {
      // TODO store previous form values if it's unsaved?
      reset(extractFormValues(subsectorValue));
    } else {
      reset(defaultValues);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subsectorValue, subsector]);

  const subcategoryData: SubCategory[] | undefined = subsector?.subCategories;
  const scopes = subcategoryData?.map((subcategory: SubCategory) => {
    const name =
      subcategory.subcategoryName?.replace("Emissions from ", "") ||
      "Unknown Subcategory";
    const label = name.charAt(0).toUpperCase() + name.slice(1);
    return {
      label,
      value: subcategory.subcategoryId,
    };
  });

  const valueType = watch("valueType");
  const isSubmitEnabled = !!valueType;

  const {
    isOpen: isDialogOpen,
    onOpen: onDialogOpen,
    onClose: onDialogClose,
  } = useDisclosure();
  const cancelDialogRef = React.useRef<HTMLButtonElement>(null);

  return (
    <Drawer
      isOpen={isOpen}
      placement="right"
      onClose={onClose}
      onEsc={onTryClose}
      onOverlayClick={onTryClose}
      closeOnEsc={false}
      closeOnOverlayClick={false}
      size="xl"
      finalFocusRef={finalFocusRef}
    >
      <DrawerOverlay />
      <DrawerContent px={0} py={0} minH="full" className="overflow-auto">
        <Box px={16} pt={12} minH="full" className="space-y-6 flex flex-col">
          <Button
            variant="ghost"
            leftIcon={<ArrowBackIcon boxSize={6} />}
            className="self-start"
            onClick={onTryClose}
            px={6}
            py={4}
            mb={6}
          >
            {t("go-back")}
          </Button>
          {subsector && (
            <>
              {sectorName && (
                <Heading size="sm">
                  {t("sector")} - {t(nameToI18NKey(sectorName))}
                </Heading>
              )}
              <Heading fontSize="32px" fontWeight="bold" lineHeight="40px">
                {t(nameToI18NKey(subsector.subsectorName))}
              </Heading>
              <Text color="content.tertiary">
                {t(nameToI18NKey(subsector.subsectorName) + "-description")}
              </Text>
              {isSubsectorValueLoading ? (
                <Center>
                  <Spinner size="lg" />
                </Center>
              ) : subsectorValueError && !noPreviousValue ? (
                <Center>
                  <HStack mt={4}>
                    <WarningIcon boxSize={7} color="semantic.danger" />
                    <Text color="semantic.danger">
                      {t("load-failed-subsector-value")}
                    </Text>
                  </HStack>
                </Center>
              ) : (
                <>
                  <Heading size="md">{t("enter-subsector-data")}</Heading>
                  <form
                    onSubmit={handleSubmit(onSubmit)}
                    className="space-y-6 grow flex flex-col"
                  >
                    <FormControl>
                      <FormLabel>
                        {t("value-types")}{" "}
                        {/* TODO content for this Tooltip?
                        <Tooltip
                          hasArrow
                          label={t("value-types-tooltip")}
                          placement="bottom-start"
                        >
                          <InfoOutlineIcon mt={-1} color="content.tertiary" />
                        </Tooltip>
                        */}
                      </FormLabel>
                      <HStack spacing={4} {...getRootProps()}>
                        <RadioButton
                          {...getRadioProps({ value: "scope-values" })}
                        >
                          {t("scope-values")}
                        </RadioButton>
                        <RadioButton
                          {...getRadioProps({ value: "unavailable" })}
                        >
                          {t("unavailable-not-applicable")}
                        </RadioButton>
                      </HStack>
                    </FormControl>
                    {/*** One value for the sub-sector ***/}
                    {valueType === "unavailable" && (
                      <>
                        <FormControl
                          isInvalid={!!resolve("unavailableReason", errors)}
                          mb={12}
                        >
                          <FormLabel>{t("unavailable-reason")}</FormLabel>
                          <Select
                            bgColor="base.light"
                            placeholder={t("unavailable-reason-placeholder")}
                            {...register("unavailableReason", {
                              required: t("option-required"),
                            })}
                          >
                            <option value="no-occurrance">
                              {t("no-occurrance")}
                            </option>
                            <option value="not-estimated">
                              {t("not-estimated")}
                            </option>
                            <option value="confidential-information">
                              {t("confidential-information")}
                            </option>
                            <option value="presented-elsewhere">
                              {t("presented-elsewhere")}
                            </option>
                          </Select>
                          <FormErrorMessage>
                            {resolve("unavailableReason", errors)?.message}
                          </FormErrorMessage>
                        </FormControl>

                        <FormControl
                          isInvalid={
                            !!resolve("unavailableExplanation", errors)
                          }
                        >
                          <FormLabel>{t("unavailable-explanation")}</FormLabel>
                          <Textarea
                            placeholder={t(
                              "unavailable-explanation-placeholder",
                            )}
                            bgColor="base.light"
                            {...register("unavailableExplanation", {
                              required: t("unavailable-explanation-required"),
                            })}
                          />
                          <FormErrorMessage>
                            {resolve("unavailableExplanation", errors)?.message}
                          </FormErrorMessage>
                        </FormControl>
                      </>
                    )}
                    {/*** Values for each scope ***/}
                    {valueType === "scope-values" && (
                      <Accordion allowToggle className="space-y-6">
                        {scopes?.map((scope) => (
                          <AccordionItem key={scope.value} mb={0}>
                            <h2>
                              <AccordionButton>
                                <HStack w="full">
                                  <Box
                                    as="span"
                                    flex="1"
                                    textAlign="left"
                                    w="full"
                                  >
                                    <Heading
                                      size="sm"
                                      color="content.alternative"
                                    >
                                      {scope.label}
                                    </Heading>
                                    <Text color="content.tertiary">
                                      {/* TODO: Get scope text body */}
                                    </Text>
                                  </Box>
                                  {isScopeCompleted(scope.value) ? (
                                    <Tag variant="success" mx={6}>
                                      {t("completed")}
                                    </Tag>
                                  ) : (
                                    <Tag variant="warning" mx={6}>
                                      {t("incomplete")}
                                    </Tag>
                                  )}
                                  <AccordionIcon
                                    borderWidth={1}
                                    boxSize={6}
                                    borderRadius="full"
                                    borderColor="border.overlay"
                                  />
                                </HStack>
                              </AccordionButton>
                            </h2>
                            <AccordionPanel pt={4}>
                              <EmissionsForm
                                t={t}
                                subCategoryId={scope.value}
                                sectorNumber={sectorNumber!}
                              />
                            </AccordionPanel>
                          </AccordionItem>
                        ))}
                      </Accordion>
                    )}
                    <Box w="full" className="grow flex flex-col">
                      <Box className="grow" />
                      <Button
                        onClick={handleSubmit(onSubmit)}
                        isDisabled={!isSubmitEnabled}
                        isLoading={isSubmitting}
                        type="submit"
                        formNoValidate
                        w="full"
                        h={16}
                        mb={12}
                        mt={6}
                      >
                        {t("add-data")}
                      </Button>
                    </Box>
                  </form>
                </>
              )}
            </>
          )}
        </Box>
      </DrawerContent>
      <AlertDialog
        isOpen={isDialogOpen}
        onClose={onDialogClose}
        leastDestructiveRef={cancelDialogRef}
      >
        <AlertDialogOverlay>
          <AlertDialogContent minWidth={568}>
            <AlertDialogHeader
              fontSize="24"
              fontWeight="600"
              textAlign="center"
              fontFamily="heading"
              my={2}
            >
              <Flex justify="space-between">
                <Box w={10} />
                {t("unsaved-changes")}
                <IconButton
                  color="content.tertiary"
                  icon={<CloseIcon />}
                  onClick={onDialogClose}
                  aria-label="Close"
                  variant="ghost"
                />
              </Flex>
            </AlertDialogHeader>
            <hr />
            <AlertDialogBody textAlign="center" py={6} px={10}>
              <Trans i18nKey="unsaved-changes-description" t={t} />
            </AlertDialogBody>
            <hr />

            <AlertDialogFooter my={2}>
              <Flex justify="center" w="full">
                <Button
                  variant="outline"
                  ref={cancelDialogRef}
                  onClick={onDialogClose}
                  px={6}
                  width="230px"
                  height={16}
                >
                  {t("keep-editing")}
                </Button>
                <Button
                  variant="danger"
                  onClick={() => {
                    onClose();
                    onDialogClose();
                  }}
                  ml={2}
                  px={6}
                  width="230px"
                  height={16}
                >
                  {t("discard-changes")}
                </Button>
              </Flex>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialogOverlay>
      </AlertDialog>
    </Drawer>
  );
}
