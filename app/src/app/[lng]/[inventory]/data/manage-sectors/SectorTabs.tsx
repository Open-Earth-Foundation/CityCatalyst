"use client";
import { InventoryProgressResponse } from "@/util/types";
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
import { SerializedError } from "@reduxjs/toolkit";
import { FetchBaseQueryError } from "@reduxjs/toolkit/query";
import { TFunction } from "i18next";
import React, { FC, useEffect, useState } from "react";
import { SubSectorWithRelations } from "../[step]/types";
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

interface SectorTabsProps {
  t: TFunction;
  inventoryData: InventoryProgressResponse | undefined;
  isInventoryDataLoading: boolean;
  inventoryDataError: FetchBaseQueryError | SerializedError | undefined;
}

interface QuickActionInputs {
  notationKey: string;
  explanation: string;
}

interface CardInputs {
  notationKey: string;
  explanation: string;
}

const SectorTabs: FC<SectorTabsProps> = ({
  inventoryData,
  inventoryDataError,
  isInventoryDataLoading,
  t,
}) => {
  const router = useRouter();

  const [unfinishedSubsectorsData, setUnfinishedSubsectorsData] = useState<
    SubSectorWithRelations[] | undefined
  >([]);
  // State to track selected subsector IDs per sector (keyed by sector ID)
  const [selectedCardsBySector, setSelectedCardsBySector] = useState<
    Record<string, string[]>
  >({}); // State to track selected subsector IDs per sector (keyed by sector ID)

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

  useEffect(() => {
    // Adjust the dirty check as needed (e.g., also include quickActionValues)
    setIsDirty(Object.keys(cardInputs).length > 0);
  }, [cardInputs]);

  // Listen to Next.js route changes for in-app navigation
  useEffect(() => {
    if (pathname !== prevPathname) {
      if (isDirty) {
        setNextRoute(pathname);
        setShowDialog(true);
        // Revert to previous path.
        router.push(prevPathname);
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
        e.returnValue = "";
        setShowDialog(true);
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isDirty]);

  // update notation keys for subsectors from api service
  const [createNotationKeys, { isLoading, isError, data, status }] =
    api.useUpdateOrCreateNotationKeysMutation();
  const handleUpdateNotationKeys = async (subsectorId?: string) => {
    let notationKeysArray;
    if (subsectorId) {
      // Update a single card
      const cardData = cardInputs[subsectorId];
      if (!cardData) return;
      notationKeysArray = [
        {
          subSectorId: subsectorId,
          unavailableReason: cardData.notationKey,
          unavailableExplanation: cardData.explanation,
        },
      ];
    } else {
      // Bulk update all cards that have been edited (or, if you prefer, all selected ones)
      notationKeysArray = Object.entries(cardInputs).map(([id, value]) => ({
        subSectorId: id,
        unavailableReason: value.notationKey,
        unavailableExplanation: value.explanation,
      }));
    }

    // payload according to the schema
    const payload = { notationKeys: notationKeysArray };

    try {
      await createNotationKeys({
        inventoryId: inventoryData?.inventory.inventoryId!,
        ...payload,
      }).unwrap();
      // clear dirty state on success
      setCardInputs({});
      setIsDirty(false);
      status === "fulfilled" &&
        toaster.success({
          title: t("success"),
          description: t("notation-keys-updated"),
        });
    } catch (error) {
      console.error("Failed to update notation keys", error);
    }
  };

  if (isError) {
    console.error("Failed to update notation keys", isError);
  }

  // Modal handlers for unsaved changes
  const confirmNavigation = () => {
    setIsDirty(false);
    if (nextRoute) {
      setPrevPathname(nextRoute);
      router.push(nextRoute);
    }
    setShowDialog(false);
  };

  const cancelNavigation = () => {
    setNextRoute(null);
    setShowDialog(false);
  };

  useEffect(() => {
    if (!isInventoryDataLoading) {
      const unfinishedSubSectors = inventoryData?.sectorProgress.flatMap(
        (sector) =>
          sector.subSectors.filter((subsector) => !subsector.completed),
      );

      setUnfinishedSubsectorsData(unfinishedSubSectors);
    }
  }, [inventoryData, isInventoryDataLoading, inventoryDataError]);
  if (isInventoryDataLoading) {
    return <ProgressLoader />;
  }

  const renderSectorTabList = () => {
    return inventoryData?.sectorProgress.map(({ sector }) => {
      return (
        <Tabs.Trigger
          key={sector.sectorId}
          value={`tab-${sector.sectorId}`}
          maxW="1/4"
          _selected={{
            color: "content.link",
            fontWeight: "bold",
            fontFamily: "heading",
          }}
        >
          <Text fontSize="title.md" lineClamp="2">
            {sector.sectorName}
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
        label: t("pe"),
        value: "presented-elsewhere",
      },
    ],
  });

  const renderSectorTabContent = () =>
    inventoryData?.sectorProgress.map(({ sector, subSectors }) => {
      // Filter to get only unfinished subsectors
      const unfinishedSubsectors = subSectors.filter(
        (subsector) => !subsector.completed,
      );

      const selectedForThisSector =
        selectedCardsBySector[sector.sectorId] || [];

      // Get quick action values for this sector, defaulting to empty strings
      const quickValues = quickActionValues[sector.sectorId] || {
        notationKey: "",
        explanation: "",
      };

      const handleToggleCard = (subSectorId: string) => {
        setSelectedCardsBySector((prev) => ({
          ...prev,
          [sector.sectorId]: prev[sector.sectorId]?.includes(subSectorId)
            ? prev[sector.sectorId].filter((id) => id !== subSectorId)
            : [...(prev[sector.sectorId] || []), subSectorId],
        }));
      };

      // Toggle select all for the current sector
      const handleSelectAll = () => {
        if (selectedForThisSector.length === unfinishedSubsectors.length) {
          // All are selected so unselect all
          setSelectedCardsBySector((prev) => ({
            ...prev,
            [sector.sectorId]: [],
          }));
        } else {
          // Select all unfinished subsectors
          setSelectedCardsBySector((prev) => ({
            ...prev,
            [sector.sectorId]: unfinishedSubsectors.map((s) => s.subsectorId),
          }));
        }
      };
      // Apply quick action values to each selected card
      const handleApplyToAll = () => {
        setCardInputs((prev) => {
          const newInputs = { ...prev };
          selectedForThisSector.forEach((subSectorId) => {
            newInputs[subSectorId] = {
              notationKey: quickValues.notationKey,
              explanation: quickValues.explanation,
            };
          });
          return newInputs;
        });
        toaster.create({
          title: t("success"),
          description: t("quick-action-applied"),
          type: "info",
        });
      };
      return (
        <Tabs.Content
          key={sector.sectorId}
          value={`tab-${sector.sectorId}`}
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
                {sector.sectorName}
              </Text>
            </Box>
            <Text fontSize="body.lg" fontFamily="body" color="content.tertiary">
              {t("content-description")}
            </Text>
          </Box>
          {/* Quick Action form */}
          <Box mb="48px" display="flex" flexDirection="column" gap="32px">
            <Box display="flex" alignItems="center" gap="8px">
              {/* Select All button */}
              <Button variant="ghost" onClick={handleSelectAll}>
                {selectedForThisSector.length ===
                unfinishedSubsectors.length ? (
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
                  {selectedForThisSector.length === unfinishedSubsectors.length
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
                      [sector.sectorId]: {
                        ...prev[sector.sectorId],
                        notationKey: newValue.toString(),
                        explanation: prev[sector.sectorId]?.explanation || "",
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
                      [sector.sectorId]: {
                        ...prev[sector.sectorId],
                        explanation: e.target.value,
                        notationKey: prev[sector.sectorId]?.notationKey || "",
                      },
                    }))
                  }
                />
                {/* TODO add error feedback */}
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

          {/* unfinished subsectors cards */}
          {unfinishedSubsectors.length > 0 ? (
            <>
              <Box
                display="grid"
                gridTemplateColumns="repeat(auto-fill, minmax(450px, 1fr))"
                gap="48px"
              >
                {unfinishedSubsectors.map((subsector) => {
                  const cardValue = cardInputs[subsector.subsectorId] || {
                    notationKey: "",
                    explanation: "",
                  };
                  return (
                    <CheckboxCard.Root
                      width="497px"
                      key={subsector.subsectorId}
                      height="344px"
                      p={0}
                      borderCollapse="border.neutral"
                      checked={selectedForThisSector.includes(
                        subsector.subsectorId,
                      )}
                      onCheckedChange={() =>
                        handleToggleCard(subsector.subsectorId)
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
                            >
                              {" "}
                              {t(subsector.referenceNumber!)} {""}
                              {t(subsector.subsectorName!)}
                            </Text>
                          </CheckboxCard.Label>
                          <CheckboxCard.Description w="full">
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
                                <Field.Root orientation="vertical" w="ull">
                                  <SelectRoot
                                    variant="outline"
                                    collection={notationKeys}
                                    w="full"
                                    value={[cardValue.notationKey]}
                                    onValueChange={(e) =>
                                      setCardInputs((prev) => ({
                                        ...prev,
                                        [subsector.subsectorId]: {
                                          ...prev[subsector.subsectorId],
                                          notationKey: e.value.toString(),
                                          explanation:
                                            prev[subsector.subsectorId]
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
                                        [subsector.subsectorId]: {
                                          ...prev[subsector.subsectorId],
                                          explanation: e.target.value,
                                          notationKey:
                                            prev[subsector.subsectorId]
                                              ?.notationKey || "",
                                        },
                                      }))
                                    }
                                  />
                                  {/* TODO add error feedback */}
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
                <Button height="56px" width="150px" variant="outline">
                  {t("cancel")}
                </Button>
                <Button
                  height="56px"
                  width="150px"
                  variant="solid"
                  onClick={() => handleUpdateNotationKeys()}
                  loading={isLoading}
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
        defaultValue={`tab-${inventoryData?.sectorProgress[0].sector.sectorId}`}
      >
        <Tabs.List>{renderSectorTabList()}</Tabs.List>
        {renderSectorTabContent()}
      </Tabs.Root>
      <RouteChangeDialog
        t={t}
        showDialog={showDialog}
        setShowDialog={setShowDialog}
        confirmNavigation={confirmNavigation}
        cancelNavigation={cancelNavigation}
      />
    </>
  );
};

export default SectorTabs;
