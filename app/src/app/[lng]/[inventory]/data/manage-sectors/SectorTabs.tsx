"use client";
import {
  Box,
  CheckboxCard,
  createListCollection,
  Field,
  Icon,
  Input,
  Tabs,
  Text,
  Textarea,
} from "@chakra-ui/react";
import { TFunction } from "i18next";
import React, { FC, useEffect, useMemo, useState } from "react";
import { StationaryEnergyIcon } from "@/components/icons";
import { BiSelectMultiple } from "react-icons/bi";

import { MdInfoOutline } from "react-icons/md";
import { RiErrorWarningFill } from "react-icons/ri";
import { CgRemoveR } from "react-icons/cg";

import {
  SelectContent,
  SelectItem,
  SelectLabel,
  SelectRoot,
  SelectTrigger,
  SelectValueText,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { api } from "@/services/api";
import { toaster } from "@/components/ui/toaster";
import RouteChangeDialog from "./RouteChangeDialog";
import { usePathname, useRouter } from "next/navigation";
import ProgressLoader from "@/components/ProgressLoader";
import type { SubCategoryAttributes } from "@/models/SubCategory";
import type { InventoryValueAttributes } from "@/models/InventoryValue";
import type { SubSectorAttributes } from "@/models/SubSector";
import { logger } from "@/services/logger";

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
    sectorName: string;
    referenceNumber?: string;
  };
  items: SubcategoryItem[];
}

const groupScopesBySector = (data: Record<string, any[]>): SectorGroup[] => {
  return Object.entries(data).map(([sectorRef, items]) => {
    const sector = items[0]?.subSector; // assume all items in this group share the same sector
    return {
      sectorRef: sectorRef as SectorReference,
      sector: {
        sectorId: sector?.sectorId,
        sectorName: sector?.sectorName,
        referenceNumber: sector?.referenceNumber,
      },
      items: items.map((item) => ({
        subSectorId: item.subSector.subsectorId,
        subSectorName: item.subSector.subsectorName,
        subCategoryId: item.subCategory.subcategoryId,
        subCategoryName: item.subCategory.subcategoryName,
        subCategoryReferenceNumber: item.subCategory.referenceNumber,
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
  const [nextRoute, setNextRoute] = useState<string | null>(null);
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
      ).flatMap(([_sectorRefno, scopes]: [string, ScopeData[]]) => {
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
        setNextRoute(pathname);
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
  const [createNotationKeys, { isLoading, isError, data, status }] =
    api.useUpdateOrCreateNotationKeysMutation();
  const handleUpdateNotationKeys = async (subCategoryId?: string) => {
    let notationKeys: {
      subCategoryId: string;
      unavailableReason: string;
      unavailableExplanation: string;
    }[] = [];
    if (subCategoryId) {
      // Update a single card
      const cardData = cardInputs[subCategoryId];
      if (!cardData) return;
      notationKeys = [
        {
          subCategoryId,
          unavailableReason: cardData.notationKey,
          unavailableExplanation: cardData.explanation,
        },
      ];
    } else {
      // Bulk update all cards that have been edited (or, if you prefer, all selected ones)
      const currentSectorSubCategoryIds = sectorData?.result[
        selectedSector
      ].map((scope: any) => scope.subCategory.subcategoryId);
      notationKeys = Object.entries(cardInputs)
        .filter(([id, _value]) => currentSectorSubCategoryIds.includes(id))
        .map(([id, value]) => ({
          subCategoryId: id,
          unavailableReason: value.notationKey,
          unavailableExplanation: value.explanation,
        }));
    }

    try {
      await createNotationKeys({
        inventoryId: inventoryId!,
        notationKeys: notationKeys,
      }).unwrap();
      // clear dirty state on success
      setIsDirty(false);
      // show success toast
      !isLoading &&
        !isError &&
        toaster.success({
          title: t("success"),
          description: t("notation-keys-updated"),
          duration: 5000,
        });
    } catch (error) {
      toaster.error({
        title: t("error"),
        description: t("error-updating-notation-keys"),
      });
      logger.error({ err: error }, "Failed to update notation keys");
    }
  };

  // Modal handlers for unsaved changes
  const confirmNavigation = () => {
    setIsDirty(false);
    if (nextRoute) {
      setPrevPathname(nextRoute);
      router.push(nextRoute);
      setNextRoute(null);
    }
    setShowDialog(false);
  };

  const resetFormData = (): void => {
    // Reset all form data to original values
    setCardInputs(originalCardInputs);
    setIsDirty(false);
    setQuickActionValues({});
    setSelectedCardsBySector({});
    setNextRoute(null);
    setShowDialog(false);

    // Force a re-render of the form by resetting the selected sector
    setSelectedSector(selectedSector);
  };

  // --- Grouping the new API structure ---
  // Our API response now contains a `result` object keyed by sector ref.
  const groupedSectors: SectorGroup[] = useMemo(() => {
    if (sectorData?.result) {
      return groupScopesBySector(sectorData.result);
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
          _selected={{
            color: "content.link",
            fontWeight: "bold",
            fontFamily: "heading",
          }}
        >
          <Text fontSize="title.md" lineClamp="2">
            {getGPCSectorName(group.sectorRef, t)}
          </Text>
        </Tabs.Trigger>
      );
    });
  };

  // notation keys collection
  const notationKeys = createListCollection({
    items: [
      {
        label: t("ne"),
        value: "not-estimated",
      },
      {
        label: t("no"),
        value: "no-occurrance",
      },
      {
        label: t("c"),
        value: "confidential-information",
      },
      {
        label: t("ie"),
        value: "included-elsewhere",
      },
    ],
  });
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
      // For each group, use the sector info from group.sector and the scopes from group.items.
      // Here we consider all items as "unfinished" (adjust filtering if needed)
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
          {/* Heading */}
          <Box mb="48px" display="flex" flexDirection="column" gap="16px">
            <Box display="flex" alignItems="center" gap="16px">
              <Icon as={StationaryEnergyIcon} color="interactive.control" />
              <Text fontSize="title.lg" fontFamily="heading" fontWeight="bold">
                {getGPCSectorName(group.sectorRef, t)}
              </Text>
            </Box>
            <Text fontSize="body.lg" fontFamily="body" color="content.tertiary">
              {t("content-description")}
            </Text>
          </Box>
          {/* Quick Action Form */}
          <Box mb="48px" display="flex" flexDirection="column" gap="32px">
            <Box display="flex" alignItems="center" gap="8px">
              <Button variant="ghost" onClick={handleSelectAll}>
                {selectedForThisSector.length === unfinishedItems.length ? (
                  <Icon as={CgRemoveR} color="content.link" boxSize={6} />
                ) : (
                  <Icon
                    as={BiSelectMultiple}
                    color="content.link"
                    boxSize={6}
                  />
                )}
                <Text
                  fontWeight="bold"
                  fontFamily="heading"
                  color="content.link"
                >
                  {selectedForThisSector.length === unfinishedItems.length
                    ? t("deselect-all")
                    : t("quick-actions")}
                </Text>
              </Button>
            </Box>
            <Box display="flex" gap="16px" alignItems="end">
              <Field.Root orientation="vertical">
                <SelectRoot
                  value={[quickValues.notationKey]}
                  onValueChange={({ value: newValue }) =>
                    setQuickActionValues((prev) => ({
                      ...prev,
                      [group.sector.sectorId]: {
                        ...prev[group.sector.sectorId],
                        notationKey: newValue.toString(),
                        explanation:
                          prev[group.sector.sectorId]?.explanation || "",
                      },
                    }))
                  }
                  variant="outline"
                  collection={notationKeys}
                >
                  <SelectLabel display="flex" alignItems="center" gap="8px">
                    <Text fontFamily="heading" color="content.secondary">
                      {t("notation-key")}
                    </Text>
                    <Icon
                      as={MdInfoOutline}
                      color="interactive.control"
                      boxSize={4}
                    />
                  </SelectLabel>
                  <SelectTrigger
                    borderWidth="1px"
                    borderColor="border.neutral"
                    borderRadius="md"
                  >
                    <SelectValueText
                      color="content.tertiary"
                      fontWeight="medium"
                      placeholder={t("notation-key-input-placeholder")}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {notationKeys.items.map((key) => (
                      <SelectItem item={key} key={key.value}>
                        {key.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </SelectRoot>
              </Field.Root>
              <Field.Root orientation="vertical">
                <Field.Label>
                  <Text fontFamily="heading" color="content.secondary">
                    {t("explanation")}
                  </Text>
                </Field.Label>
                <Input
                  placeholder={t("explanation-input-placeholder")}
                  borderWidth="1px"
                  borderColor="border.neutral"
                  borderRadius="md"
                  shadow="1dp"
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
              <Button
                variant="ghost"
                color="content.link"
                onClick={handleApplyToAll}
              >
                {t("apply-to-all")}
              </Button>
            </Box>
          </Box>
          {/* Checkbox Cards for each item */}
          {unfinishedItems.length > 0 ? (
            <>
              <Box
                display="grid"
                gridTemplateColumns="repeat(auto-fill, minmax(450px, 1fr))"
                gap="48px"
              >
                {unfinishedItems.map((item) => {
                  // Use the subCategoryId as the unique key for each card
                  const cardValue = cardInputs[item.subCategoryId] || {
                    notationKey: "",
                    explanation: "",
                  };
                  return (
                    <CheckboxCard.Root
                      width="497px"
                      key={item.subCategoryId}
                      height="344px"
                      p={0}
                      borderCollapse="border.neutral"
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
                            <Icon
                              as={RiErrorWarningFill}
                              boxSize={5}
                              color="sentiment.warningDefault"
                            />
                            <Text
                              fontSize="title.md"
                              fontFamily="heading"
                              fontWeight="bold"
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
                                <Field.Root orientation="vertical" w="full">
                                  <SelectRoot
                                    variant="outline"
                                    collection={notationKeys}
                                    w="full"
                                    value={[cardValue.notationKey]}
                                    onValueChange={({ value }) =>
                                      setCardInputs((prev) => ({
                                        ...prev,
                                        [item.subCategoryId]: {
                                          ...prev[item.subCategoryId],
                                          notationKey: value.toString(),
                                          explanation:
                                            prev[item.subCategoryId]
                                              ?.explanation || "",
                                        },
                                      }))
                                    }
                                  >
                                    <SelectLabel
                                      display="flex"
                                      alignItems="center"
                                      gap="8px"
                                    >
                                      <Text
                                        fontFamily="heading"
                                        color="content.secondary"
                                      >
                                        {t("notation-key")}
                                      </Text>
                                      <Icon
                                        as={MdInfoOutline}
                                        color="interactive.control"
                                        boxSize={4}
                                      />
                                    </SelectLabel>
                                    <SelectTrigger
                                      borderWidth="1px"
                                      borderColor="border.neutral"
                                      borderRadius="md"
                                      shadow="1dp"
                                    >
                                      <SelectValueText
                                        color="content.tertiary"
                                        fontWeight="medium"
                                        placeholder={t(
                                          "notation-key-input-placeholder",
                                        )}
                                      />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {notationKeys.items.map((key) => (
                                        <SelectItem item={key} key={key.value}>
                                          {key.label}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </SelectRoot>
                                </Field.Root>
                                <Field.Root orientation="vertical">
                                  <Field.Label>
                                    <Text
                                      fontFamily="heading"
                                      color="content.secondary"
                                    >
                                      {t("explanation")}
                                    </Text>
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
              <Box
                py="48px"
                display="flex"
                justifyContent="flex-end"
                gap="16px"
              >
                <Button
                  height="56px"
                  width="150px"
                  variant="outline"
                  onClick={handleUndoChanges}
                  disabled={!isDirty}
                >
                  {t("cancel")}
                </Button>
                <Button
                  height="56px"
                  width="150px"
                  variant="solid"
                  onClick={() => handleUpdateNotationKeys()}
                  loading={isLoading}
                  disabled={!isDirty}
                >
                  {t("update")}
                </Button>
              </Box>
            </>
          ) : (
            <Text>{t("no-unfinished-subsectors")}</Text>
          )}
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
