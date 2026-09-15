"use client";
import {
  Box,
  CheckboxCard,
  Field,
  Icon,
  Input,
  Separator,
  Tabs,
  Text,
  Textarea,
} from "@chakra-ui/react";
import { TFunction } from "i18next";
import React, { FC, useEffect, useMemo, useState } from "react";
import { StationaryEnergyIcon } from "@/components/icons";

import { MdInfoOutline } from "react-icons/md";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dropdown, type DropdownOption } from "@/components/ui/dropdown";
import { api } from "@/services/api";
import { toaster } from "@/components/ui/toaster";
import RouteChangeDialog from "./RouteChangeDialog";
import { usePathname, useRouter } from "next/navigation";
import ProgressLoader from "@/components/ProgressLoader";
import type { SubCategoryAttributes } from "@/models/SubCategory";
import type { InventoryValueAttributes } from "@/models/InventoryValue";
import type { SubSectorAttributes } from "@/models/SubSector";
import { logger } from "@/services/logger";
import { getApiErrorMessage, isFetchBaseQueryError } from "@/util/helpers";

interface SubcategoryItem {
  subSectorId: string;
  subSectorName: string;
  subCategoryId: string;
  subCategoryName: string;
  subCategoryReferenceNumber: string;
}

type SectorReference = "I" | "II" | "III" | "IV" | "V";

interface SectorGroup {
  sectorRef: SectorReference;
  // Include the full sector data (extracted from the first item)
  sector: {
    sectorId: string;
    referenceNumber?: string;
  };
  items: SubcategoryItem[];
}

const groupScopesBySector = (
  data: Record<string, ScopeData[]>,
): SectorGroup[] => {
  return Object.entries(data).map(([sectorRef, items]) => {
    const sector = items[0]?.subSector; // assume all items in this group share the same sector
    return {
      sectorRef: sectorRef as SectorReference,
      sector: {
        sectorId: sector?.sectorId ?? "",
        referenceNumber: sector?.referenceNumber,
      },
      items: items.map((item) => ({
        subSectorId: item.subSector?.subsectorId ?? "",
        subSectorName: item.subSector?.subsectorName ?? "",
        subCategoryId: item.subCategory?.subcategoryId ?? "",
        subCategoryName: item.subCategory?.subcategoryName ?? "",
        subCategoryReferenceNumber: item.subCategory?.referenceNumber ?? "",
      })),
    };
  });
};

// convert sector reference number (roman numeral) to GPC sector name
const getGPCSectorName = (sectorRef: SectorReference, t: TFunction): string => {
  const mapping: Record<string, string> = {
    I: t("stationary-energy"),
    II: t("transport"),
    III: t("waste"),
    IV: t("industrial-processes-and-product-uses"),
    V: t("agriculture-forestry-and-other-land-use"),
  };
  return mapping[sectorRef] || sectorRef;
};

interface SectorTabsProps {
  t: TFunction;
  inventoryId: string | undefined;
}

interface QuickActionInputs {
  notationKey: string;
  explanation: string;
}

interface CardInputs {
  notationKey: string;
  explanation: string;
}

interface ScopeData {
  subCategory?: SubCategoryAttributes;
  inventoryValue?: InventoryValueAttributes;
  subSector?: SubSectorAttributes;
}

const SectorTabs: FC<SectorTabsProps> = ({ t, inventoryId }) => {
  const router = useRouter();

  // State to track selected subsector IDs per sector (keyed by sector ID)
  const [selectedCardsBySector, setSelectedCardsBySector] = useState<
    Record<string, string[]>
  >({});
  const [originalCardInputs, setOriginalCardInputs] = useState<
    Record<string, CardInputs>
  >({});

  // Quick action input values per sector
  const [quickActionValues, setQuickActionValues] = useState<
    Record<string, QuickActionInputs>
  >({});
  // Card-specific inputs keyed by subSectorId
  const [cardInputs, setCardInputs] = useState<Record<string, CardInputs>>({});
  // State for unsaved changes detection dialog
  const [isDirty, setIsDirty] = useState(false);
  const [showDialog, setShowDialog] = useState(false);
  const pathname = usePathname();
  const [prevPathname, setPrevPathname] = useState(pathname);
  const [selectedSector, setSelectedSector] = useState<SectorReference>("I");

  const {
    data: sectorData,
    isLoading: isSectorDataLoading,
    error,
  } = api.useGetNotationKeyScopesQuery(
    { inventoryId: inventoryId! },
    { skip: !inventoryId },
  );

  useEffect(() => {
    if (!isSectorDataLoading && !error && sectorData?.result) {
      const result = Object.entries(
        sectorData.result as Record<string, ScopeData[]>,
      ).flatMap(([, scopes]: [string, ScopeData[]]) => {
        return scopes.map((scope: ScopeData) => [
          scope.subCategory?.subcategoryId,
          {
            notationKey: scope.inventoryValue?.unavailableReason,
            explanation: scope.inventoryValue?.unavailableExplanation,
          },
        ]);
      });
      const newInputs = Object.fromEntries(result);
      setOriginalCardInputs(newInputs); // Store original values
      setCardInputs((prev) => {
        const updatedInputs: Record<string, CardInputs> = { ...prev };
        Object.assign(updatedInputs, newInputs);
        return updatedInputs;
      });
    }
  }, [error, isSectorDataLoading, sectorData]);

  // Check if any inputs have changed from their original values
  useEffect(() => {
    const hasChanges = Object.entries(cardInputs).some(([id, currentValue]) => {
      const originalValue = originalCardInputs[id];
      return (
        currentValue.notationKey !== originalValue?.notationKey ||
        currentValue.explanation !== originalValue?.explanation
      );
    });
    setIsDirty(hasChanges);
  }, [cardInputs, originalCardInputs]);

  // Listen to Next.js route changes for in-app navigation
  useEffect(() => {
    if (pathname !== prevPathname) {
      if (isDirty) {
        setShowDialog(true);
        // Prevent navigation by pushing back to previous path
        router.replace(prevPathname);
      } else {
        setPrevPathname(pathname);
      }
    }
  }, [pathname, prevPathname, isDirty, router]);

  // beforeunload event for refresh/close scenarios
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault();
        setShowDialog(true);
        return "";
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isDirty]);

  // update notation keys for subsectors from api service
  const [createNotationKeys, { isLoading, isError }] =
    api.useUpdateOrCreateNotationKeysMutation();
  const handleUpdateNotationKeys = async (subCategoryId?: string) => {
    // Valid enum values for unavailableReason
    const validReasons = [
      "no-occurrance",
      "not-estimated",
      "confidential-information",
      "included-elsewhere",
    ];

    let notationKeys: {
      subCategoryId: string;
      unavailableReason: string;
      unavailableExplanation: string;
    }[] = [];
    if (subCategoryId) {
      // Update a single card
      const cardData = cardInputs[subCategoryId];
      if (!cardData) return;

      // Validate that both fields are filled
      if (
        !cardData.notationKey ||
        !validReasons.includes(cardData.notationKey) ||
        !cardData.explanation ||
        cardData.explanation.trim().length === 0
      ) {
        toaster.error({
          title: t("error"),
          description: t("error-updating-notation-keys"),
        });
        return;
      }

      notationKeys = [
        {
          subCategoryId,
          unavailableReason: cardData.notationKey,
          unavailableExplanation: cardData.explanation.trim(),
        },
      ];
    } else {
      // Bulk update all cards that have been edited
      const currentSectorSubCategoryIds =
        (sectorData?.result[selectedSector] as ScopeData[] | undefined)?.map(
          (scope) => scope.subCategory?.subcategoryId,
        ) || [];

      notationKeys = Object.entries(cardInputs)
        .filter(([id, value]) => {
          // Only include cards in the current sector
          if (!currentSectorSubCategoryIds.includes(id)) {
            return false;
          }
          // Validate that the value exists and has required fields
          if (!value || typeof value !== "object") {
            return false;
          }
          // Check that notationKey is a valid enum value
          if (
            !value.notationKey ||
            typeof value.notationKey !== "string" ||
            !validReasons.includes(value.notationKey)
          ) {
            return false;
          }
          // Check that explanation is a non-empty string
          if (
            !value.explanation ||
            typeof value.explanation !== "string" ||
            value.explanation.trim().length === 0
          ) {
            return false;
          }
          return true;
        })
        .map(([id, value]) => ({
          subCategoryId: id,
          unavailableReason: value.notationKey as string,
          unavailableExplanation: value.explanation.trim(),
        }));
    }

    // Check if we have any valid notation keys to update
    if (notationKeys.length === 0) {
      toaster.error({
        title: t("error"),
        description: t("error-updating-notation-keys"),
      });
      return;
    }

    try {
      await createNotationKeys({
        inventoryId: inventoryId!,
        notationKeys: notationKeys,
      }).unwrap();
      // clear dirty state on success
      setIsDirty(false);
      // show success toast
      if (!isLoading && !isError) {
        toaster.success({
          title: t("success"),
          description: t("notation-keys-updated"),
          duration: 5000,
        });
      }
    } catch (error: unknown) {
      // Check if error is about emissions data
      type NotationKeyErrorData = {
        message?: string;
        data?: { translationKey?: string; itemName?: string };
      };
      const errorData: NotationKeyErrorData =
        (isFetchBaseQueryError(error) &&
          (error.data as { error?: NotationKeyErrorData })?.error) ||
        {};
      const translationKey = errorData.data?.translationKey;
      const itemName = errorData.data?.itemName;
      const errorMessage = errorData.message || getApiErrorMessage(error);
      const hasEmissionsData =
        translationKey === "error-cannot-set-notation-key-emissions-data" ||
        errorMessage.includes("already has emissions data");

      if (hasEmissionsData) {
        // Show warning for emissions data conflict
        // Use translation key with interpolation if available, otherwise use error message
        const description =
          translationKey && itemName
            ? t(translationKey, { itemName })
            : errorMessage;
        toaster.create({
          title: t("warning") || "Warning",
          description,
          type: "warning",
          duration: 7000,
        });
      } else {
        // Show generic error for other failures
        toaster.error({
          title: t("error"),
          description: errorMessage || t("error-updating-notation-keys"),
        });
      }
      logger.error({ err: error }, "Failed to update notation keys");
    }
  };

  const resetFormData = (): void => {
    // Reset all form data to original values
    setCardInputs(originalCardInputs);
    setIsDirty(false);
    setQuickActionValues({});
    setSelectedCardsBySector({});
    setShowDialog(false);

    // Force a re-render of the form by resetting the selected sector
    setSelectedSector(selectedSector);
  };

  // --- Grouping the new API structure ---
  // Our API response now contains a `result` object keyed by sector ref.
  const groupedSectors: SectorGroup[] = useMemo(() => {
    if (sectorData?.result) {
      return groupScopesBySector(
        sectorData.result as Record<string, ScopeData[]>,
      );
    }
    return [];
  }, [sectorData?.result]);

  if (isSectorDataLoading) {
    return <ProgressLoader />;
  }

  const renderSectorTabList = () => {
    return groupedSectors.map((group) => {
      return (
        <Tabs.Trigger
          key={group.sectorRef}
          value={group.sectorRef}
          maxW="1/4"
          height="auto"
          alignItems="flex-end"
          pb="s"
          color="content.secondary"
          fontSize="body.lg"
          lineHeight="24"
          letterSpacing="wide"
          fontWeight="regular"
          fontFamily="body"
          textAlign="center"
          _selected={{
            color: "content.link",
            fontWeight: "bold",
            fontFamily: "heading",
          }}
        >
          <Text lineClamp="2">{getGPCSectorName(group.sectorRef, t)}</Text>
        </Tabs.Trigger>
      );
    });
  };

  // notation key dropdown options
  const notationKeyOptions: DropdownOption[] = [
    {
      label: t("notation-key-short-ne"),
      value: "not-estimated",
      description: t("reason-NE"),
    },
    {
      label: t("notation-key-short-no"),
      value: "no-occurrance",
      description: t("reason-NO"),
    },
    {
      label: t("notation-key-short-c"),
      value: "confidential-information",
      description: t("reason-C"),
    },
    {
      label: t("notation-key-short-ie"),
      value: "included-elsewhere",
      description: t("reason-IE"),
    },
  ];
  // handle undo changes
  const handleUndoChanges = () => {
    resetFormData();
    toaster.create({
      title: t("success"),
      description: t("changes-undone"),
      type: "info",
    });
  };
  // sector tab content - subsectors
  const renderSectorTabContent = () =>
    groupedSectors.map((group) => {
      // The API already excludes subsectors that have real emissions data,
      // so every item returned here is a valid notation-key candidate.
      const unfinishedItems = group.items;
      const selectedForThisSector =
        selectedCardsBySector[group.sector.sectorId] || [];
      const quickValues = quickActionValues[group.sector.sectorId] || {
        notationKey: "",
        explanation: "",
      };

      const handleToggleCard = (cardId: string) => {
        setSelectedCardsBySector((prev) => ({
          ...prev,
          [group.sector.sectorId]: prev[group.sector.sectorId]?.includes(cardId)
            ? prev[group.sector.sectorId].filter((id) => id !== cardId)
            : [...(prev[group.sector.sectorId] || []), cardId],
        }));
      };

      const handleSelectAll = () => {
        if (selectedForThisSector.length === unfinishedItems.length) {
          setSelectedCardsBySector((prev) => ({
            ...prev,
            [group.sector.sectorId]: [],
          }));
        } else {
          setSelectedCardsBySector((prev) => ({
            ...prev,
            [group.sector.sectorId]: unfinishedItems.map(
              (item) => item.subCategoryId,
            ),
          }));
        }
      };

      const handleApplyToAll = () => {
        setCardInputs((prev) => {
          const newInputs = { ...prev };
          // If there are selected cards, update only those; otherwise update all items.
          const itemsToUpdate =
            selectedForThisSector.length > 0
              ? selectedForThisSector
              : unfinishedItems.map((item) => item.subCategoryId);
          itemsToUpdate.forEach((cardId) => {
            newInputs[cardId] = {
              notationKey: quickValues.notationKey,
              explanation: quickValues.explanation,
            };
          });
          return newInputs;
        });
        toaster.create({
          title: t("success"),
          description: t("quick-action-applied"),
          type: "success",
        });
      };

      return (
        <Tabs.Content
          key={group.sectorRef}
          value={group.sectorRef}
          pt="70px"
          _open={{
            animationName: "fade-in, scale-in",
            animationDuration: "300ms",
          }}
          _closed={{
            animationName: "fade-out, scale-out",
            animationDuration: "120ms",
          }}
          inset="0"
        >
          {/* Card wrapping heading, quick actions and sub-sector cards */}
          <Box
            bg="base.light"
            borderRadius="rounded"
            boxShadow="1dp"
            p="l"
            display="flex"
            flexDirection="column"
          >
            {/* Heading */}
            <Box mb="48px" display="flex" flexDirection="column" gap="16px">
              <Box display="flex" alignItems="center" gap="16px">
                <Icon as={StationaryEnergyIcon} color="interactive.control" />
                <Text
                  fontSize="title.lg"
                  fontFamily="heading"
                  fontWeight="bold"
                >
                  {getGPCSectorName(group.sectorRef, t)}
                </Text>
              </Box>
              <Text
                fontSize="body.lg"
                fontFamily="body"
                color="content.tertiary"
              >
                {t("content-description")}
              </Text>
            </Box>
            {/* Quick Action Form */}
            <Box
              mb="48px"
              display="flex"
              flexDirection="column"
              gap="16px"
              bg="background.alternativeLight"
              borderWidth="1px"
              borderColor="border.neutral"
              borderRadius="rounded"
              p="16px"
            >
              <Box display="flex" alignItems="center" gap="8px">
                <Checkbox
                  checked={
                    unfinishedItems.length > 0 &&
                    selectedForThisSector.length === unfinishedItems.length
                  }
                  onCheckedChange={handleSelectAll}
                >
                  <Text
                    color="content.primary"
                    fontFamily="body"
                    fontSize="body.md"
                    fontWeight="medium"
                    lineHeight="20"
                  >
                    {t("select-all-subsectors")}
                  </Text>
                </Checkbox>
              </Box>
              <Separator borderColor="border.neutral" />
              <Box display="flex" gap="16px" alignItems="end">
                <Dropdown
                  maxW="340px"
                  label={t("notation-key")}
                  labelIcon={MdInfoOutline}
                  labelIconTooltip={t("notation-key-tooltip")}
                  placeholder={t("notation-key-input-placeholder")}
                  options={notationKeyOptions}
                  value={quickValues.notationKey}
                  onValueChange={(newValue) =>
                    setQuickActionValues((prev) => ({
                      ...prev,
                      [group.sector.sectorId]: {
                        ...prev[group.sector.sectorId],
                        notationKey: newValue,
                        explanation:
                          prev[group.sector.sectorId]?.explanation || "",
                      },
                    }))
                  }
                />
                <Field.Root orientation="vertical" flex="1">
                  <Field.Label>
                    <Text
                      fontFamily="heading"
                      color="content.secondary"
                      fontSize="label.lg"
                      fontWeight="medium"
                      lineHeight="20"
                      letterSpacing="wide"
                    >
                      {t("justification")}
                    </Text>
                  </Field.Label>
                  <Input
                    placeholder={t("explanation-input-placeholder")}
                    borderWidth="1px"
                    borderColor="border.neutral"
                    borderRadius="minimal"
                    bg="background.default"
                    overflow="hidden"
                    textOverflow="ellipsis"
                    color="content.tertiary"
                    fontFamily="body"
                    fontSize="body.lg"
                    fontWeight="regular"
                    lineHeight="24"
                    letterSpacing="wide"
                    value={quickValues.explanation}
                    onChange={(e) =>
                      setQuickActionValues((prev) => ({
                        ...prev,
                        [group.sector.sectorId]: {
                          ...prev[group.sector.sectorId],
                          explanation: e.target.value,
                          notationKey:
                            prev[group.sector.sectorId]?.notationKey || "",
                        },
                      }))
                    }
                  />
                  <Field.ErrorText></Field.ErrorText>
                </Field.Root>
                <Button variant="outline" onClick={handleApplyToAll}>
                  {t("apply-to-all")}
                </Button>
              </Box>
            </Box>
            {/* Checkbox Cards for each item */}
            {unfinishedItems.length > 0 ? (
              <Box
                display="grid"
                gridTemplateColumns="repeat(auto-fill, minmax(450px, 1fr))"
                gap="xxl-2"
              >
                {unfinishedItems.map((item) => {
                  // Use the subCategoryId as the unique key for each card
                  const cardValue = cardInputs[item.subCategoryId] || {
                    notationKey: "",
                    explanation: "",
                  };
                  return (
                    <CheckboxCard.Root
                      width="full"
                      key={item.subCategoryId}
                      height="344px"
                      p={0}
                      borderCollapse="border.neutral"
                      boxShadow="1dp"
                      checked={selectedForThisSector.includes(
                        item.subCategoryId,
                      )}
                      onCheckedChange={() =>
                        handleToggleCard(item.subCategoryId)
                      }
                    >
                      <CheckboxCard.HiddenInput />
                      <CheckboxCard.Control>
                        <CheckboxCard.Content>
                          <CheckboxCard.Label my="24px">
                            <Text
                              overflow="hidden"
                              textOverflow="ellipsis"
                              color="content.primary"
                              fontFamily="heading"
                              fontSize="overline"
                              fontWeight="semibold"
                              lineHeight="16"
                              letterSpacing="widest"
                              textTransform="uppercase"
                              lineClamp={2}
                            >
                              {t(item.subCategoryReferenceNumber!)}{" "}
                              {t(item.subSectorName)} –{" "}
                              {t(item.subCategoryName)}
                            </Text>
                          </CheckboxCard.Label>
                          <CheckboxCard.Description
                            w="full"
                            color="content.secondary"
                            opacity="1"
                          >
                            <Box
                              mb="48px"
                              display="flex"
                              flexDirection="column"
                              gap="32px"
                              w="full"
                            >
                              <Box
                                display="flex"
                                flexDir="column"
                                gap="16px"
                                w="full"
                              >
                                <Dropdown
                                  width="full"
                                  label={t("notation-key")}
                                  required
                                  placeholder={t(
                                    "notation-key-input-placeholder",
                                  )}
                                  options={notationKeyOptions}
                                  value={cardValue.notationKey}
                                  onValueChange={(value) =>
                                    setCardInputs((prev) => ({
                                      ...prev,
                                      [item.subCategoryId]: {
                                        ...prev[item.subCategoryId],
                                        notationKey: value,
                                        explanation:
                                          prev[item.subCategoryId]
                                            ?.explanation || "",
                                      },
                                    }))
                                  }
                                />
                                <Field.Root orientation="vertical" required>
                                  <Field.Label>
                                    <Text
                                      fontFamily="heading"
                                      color="content.secondary"
                                    >
                                      {t("justification")}
                                    </Text>
                                    <Field.RequiredIndicator />
                                  </Field.Label>
                                  <Textarea
                                    placeholder={t(
                                      "explanation-input-placeholder",
                                    )}
                                    borderWidth="1px"
                                    borderColor="border.neutral"
                                    borderRadius="md"
                                    shadow="1dp"
                                    height="96px"
                                    value={cardValue.explanation}
                                    onChange={(e) =>
                                      setCardInputs((prev) => ({
                                        ...prev,
                                        [item.subCategoryId]: {
                                          ...prev[item.subCategoryId],
                                          explanation: e.target.value,
                                          notationKey:
                                            prev[item.subCategoryId]
                                              ?.notationKey || "",
                                        },
                                      }))
                                    }
                                  />
                                  <Field.ErrorText></Field.ErrorText>
                                </Field.Root>
                              </Box>
                            </Box>
                          </CheckboxCard.Description>
                        </CheckboxCard.Content>
                        <CheckboxCard.Indicator />
                      </CheckboxCard.Control>
                    </CheckboxCard.Root>
                  );
                })}
              </Box>
            ) : (
              <Text>{t("no-unfinished-subsectors")}</Text>
            )}
            {unfinishedItems.length > 0 && (
              <Box
                pt="48px"
                display="flex"
                justifyContent="flex-end"
                gap="16px"
              >
                <Button
                  height="xxl-2"
                  width="150px"
                  variant="outline"
                  onClick={handleUndoChanges}
                  disabled={!isDirty}
                >
                  {t("cancel")}
                </Button>
                <Button
                  height="xxl-2"
                  width="150px"
                  variant="solid"
                  onClick={() => handleUpdateNotationKeys()}
                  loading={isLoading}
                  disabled={!isDirty}
                  _disabled={{
                    bg: "gray.medium",
                    _hover: { bg: "gray.medium" },
                  }}
                >
                  {t("update")}
                </Button>
              </Box>
            )}
          </Box>
        </Tabs.Content>
      );
    });

  return (
    <>
      <Tabs.Root
        lazyMount
        unmountOnExit
        defaultValue={groupedSectors[0]?.sectorRef}
        value={selectedSector}
        onValueChange={(value) =>
          setSelectedSector(value.value as SectorReference)
        }
      >
        <Tabs.List>{renderSectorTabList()}</Tabs.List>
        {renderSectorTabContent()}
      </Tabs.Root>
      <RouteChangeDialog
        t={t}
        showDialog={showDialog}
        setShowDialog={setShowDialog}
        confirmNavigation={resetFormData}
        cancelNavigation={() => setShowDialog(false)}
      />
    </>
  );
};

export default SectorTabs;
