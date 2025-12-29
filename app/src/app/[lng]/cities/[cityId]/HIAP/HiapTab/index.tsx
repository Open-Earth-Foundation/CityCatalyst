import { CityWithProjectDataResponse, InventoryResponse } from "@/util/types";
import {
  LANGUAGES,
  ACTION_TYPES,
  HIAction,
  MitigationAction,
  AdaptationAction,
  CityResponse,
} from "@/util/types";
import { useEffect, useState, useMemo } from "react";
import { useTranslation } from "@/i18n/client";
import i18next from "i18next";
import {
  Box,
  Text,
  Badge,
  VStack,
  HStack,
  Button,
  IconButton,
  Table as ChakraTable,
  Icon,
} from "@chakra-ui/react";
import { Checkbox } from "@/components/ui/checkbox";
import { Tooltip } from "@/components/ui/tooltip";
import { RiExpandDiagonalFill } from "react-icons/ri";
import { MdExpandMore, MdExpandLess } from "react-icons/md";
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  ColumnDef,
  Row,
  RowSelectionState,
  Table as TanStackTable,
} from "@tanstack/react-table";
import { ActionDrawer } from "@/components/ActionDrawer";
import {
  useGetHiapQuery,
  useGetHiapStatusQuery,
  useUpdateHiapSelectionMutation,
} from "@/services/api";
import { logger } from "@/services/logger";
import { HighImpactActionRankingStatus } from "@/util/types";
import ClimateActionsEmptyState from "./ClimateActionsEmptyState";
import ActionPlanSection from "./ActionPlanSection";
import ProgressLoader from "@/components/ProgressLoader";
import { DownloadIcon } from "@/components/icons";
import { MdCheckBox } from "react-icons/md";
import { TitleLarge } from "@/components/package/Texts/Title";
import { BodyLarge } from "@/components/package/Texts/Body";
import { IoMdCheckboxOutline } from "react-icons/io";
import { TopPickIcon } from "@/components/icons";
import {
  MenuContent,
  MenuItem,
  MenuRoot,
  MenuTrigger,
} from "@/components/ui/menu";
import { MdArrowDropDown } from "react-icons/md";
import { ButtonMedium } from "@/components/package/Texts/Button";
import { ButtonSmall } from "@/components/package/Texts/Button";
import { toaster } from "@/components/ui/toaster";
import { trackEvent } from "@/lib/analytics";

const BarVisualization = ({
  value,
  total,
  width = "16px",
}: {
  value: number;
  total: number;
  width?: string;
}) => {
  return (
    <HStack gap={1}>
      {Array.from({ length: total }).map((_, index) => (
        <Box
          key={index}
          w={width}
          h="8px"
          bg={index < value ? "content.link" : "background.neutral"}
          borderRadius="md"
        />
      ))}
    </HStack>
  );
};

export function HiapTab({
  type,
  inventory,
  cityData,
  onTriggerHiap,
}: {
  type: ACTION_TYPES;
  inventory: InventoryResponse | null;
  cityData: CityWithProjectDataResponse;
  onTriggerHiap?: () => void;
}) {
  const lng = i18next.language as LANGUAGES;
  const { t } = useTranslation(lng, "hiap");

  // UI State
  const [selectedAction, setSelectedAction] = useState<HIAction | null>(null);
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [unrankedRowSelection, setUnrankedRowSelection] =
    useState<RowSelectionState>({});
  const [selectedActions, setSelectedActions] = useState<HIAction[]>([]);
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [showUnrankedActions, setShowUnrankedActions] = useState(true);

  // HIAP Query State
  const [userTriggeredHiap, setUserTriggeredHiap] = useState(false);
  const [ignoreExisting, setIgnoreExisting] = useState(false);
  const [localIsPending, setLocalIsPending] = useState(false);

  // API Queries
  // Status check query - runs on page load to detect existing jobs
  const {
    data: statusData,
    isLoading: isStatusLoading,
    error: statusError,
    refetch: refetchStatus,
  } = useGetHiapStatusQuery(
    {
      inventoryId: inventory?.inventoryId || "",
      lng: lng,
      actionType: type,
    },
    { skip: !inventory?.inventoryId },
  );

  // Main HIAP query - only runs when user triggers it
  const {
    data: hiapData,
    isLoading,
    error,
    refetch,
  } = useGetHiapQuery(
    {
      inventoryId: inventory?.inventoryId || "",
      lng: lng,
      actionType: type,
      ignoreExisting: ignoreExisting,
    },
    { skip: !inventory?.inventoryId || !userTriggeredHiap },
  );

  const [updateHiapSelection, { isLoading: isUpdatingSelection }] =
    useUpdateHiapSelectionMutation();

  // Derived State
  // Use hiapData if available (from user-triggered query), otherwise use statusData (from page load)
  const currentData = hiapData || statusData;

  // Memoize actions to prevent unnecessary re-renders
  const rankedActions = useMemo(
    () => currentData?.rankedActions || [],
    [currentData?.rankedActions],
  );
  const unrankedActions = useMemo(
    () => currentData?.unrankedActions || [],
    [currentData?.unrankedActions],
  );
  const actions = rankedActions; // Keep only ranked actions for the main table
  const isAdaptation = type === ACTION_TYPES.Adaptation;
  const isPending =
    currentData?.status === HighImpactActionRankingStatus.PENDING || localIsPending;
  const isFailure =
    currentData?.status === HighImpactActionRankingStatus.FAILURE;
  const hasActions = actions && actions.length > 0;

  // Combined loading state
  const isCombinedLoading = isStatusLoading || isLoading;
  // Use error from triggered query if available, otherwise from status query
  const currentError = error || statusError;

  // Event Handlers
  const handleHiapGeneration = async () => {
    setLocalIsPending(true);
    
    try {
      // Track HIAP plan generation
      trackEvent("hiap_plan_generated", {
        action_type: type,
        city_id: cityData?.cityId,
        city_name: cityData?.name || cityData?.locode,
        inventory_id: inventory?.inventoryId,
        is_retry: !!error,
        existing_actions_count: actions?.length || 0,
      });

      // Show immediate feedback to user
      toaster.create({
        title: t("generating-climate-actions"),
        description: t("generating-climate-actions-description"),
        type: "info",
        duration: 5000,
      });

      if (error) {
        // Retry with ignoreExisting flag
        setIgnoreExisting(true);
        await refetch();
      } else {
        // Initial trigger - always ignore existing for empty state generation
        setIgnoreExisting(true);
        setUserTriggeredHiap(true);
      }
      
      // After triggering HIAP generation, refetch status multiple times to ensure we catch the pending state
      setTimeout(() => refetchStatus(), 500);
      setTimeout(() => refetchStatus(), 2000);
      
    } catch (error) {
      // Clear pending on error
      setLocalIsPending(false);
      toaster.create({
        title: t("error-generating-actions-title"),
        description: t("error-generating-actions-description"),
        type: "error",
      });
      logger.error(error, "Failed to generate HIAP actions");
    }
    
    // Safety net: clear local pending after timeout
    setTimeout(() => setLocalIsPending(false), 30000);
  };

  // Initialize selection state from database
  useEffect(() => {
    const initialRankedSelection: RowSelectionState = {};
    const initialUnrankedSelection: RowSelectionState = {};
    const initialSelectedActions: HIAction[] = [];

    // Handle ranked actions
    actions.forEach((action) => {
      if (action.isSelected) {
        initialRankedSelection[action.id] = true;
        initialSelectedActions.push(action);
      }
    });

    // Handle unranked actions (they start as unselected)
    unrankedActions.forEach((action) => {
      if (action.isSelected) {
        initialUnrankedSelection[`unranked-${action.id}`] = true;
        initialSelectedActions.push(action);
      }
    });

    setRowSelection(initialRankedSelection);
    setUnrankedRowSelection(initialUnrankedSelection);
    setSelectedActions(initialSelectedActions);
  }, [actions, unrankedActions]);

  const handleRowSelectionChange = async (
    updaterOrValue:
      | RowSelectionState
      | ((old: RowSelectionState) => RowSelectionState),
  ) => {
    if (!inventory) return;

    const newRowSelection =
      typeof updaterOrValue === "function"
        ? updaterOrValue(rowSelection)
        : updaterOrValue;

    // Show loading toast
    const loadingToastId = toaster.create({
      title: t("updating-selection"),
      type: "loading",
      duration: Infinity, // Keep until manually dismissed
    });

    try {
      // For ranked actions, we need to send the database record ID (UUID)
      const rankedSelectedIds = Object.keys(newRowSelection)
        .filter((id) => newRowSelection[id])
        .map((rowId) => {
          const action = actions.find((a) => a.id === rowId);
          return action?.id; // This is the database record ID (UUID)
        })
        .filter((id): id is string => Boolean(id));

      // For unranked actions, we send the action ID (not database record ID)
      const unrankedSelectedIds = Object.keys(unrankedRowSelection)
        .filter((id) => unrankedRowSelection[id])
        .map((rowId) => {
          const actionId = rowId.replace("unranked-", "");
          const action = unrankedActions.find((a) => a.actionId === actionId);
          return action?.actionId; // This is the action ID from Global API
        })
        .filter((id): id is string => Boolean(id));

      const allSelectedIds = [...rankedSelectedIds, ...unrankedSelectedIds];

      // Track custom action selection (user didn't use default expert suggestions)
      trackEvent("hiap_expert_suggestions_overridden", {
        action_type: type,
        city_id: cityData?.cityId,
        inventory_id: inventory.inventoryId,
        selected_actions_count: allSelectedIds.length,
      });

      await updateHiapSelection({
        inventoryId: inventory.inventoryId,
        selectedActionIds: allSelectedIds,
      }).unwrap();

      setRowSelection(newRowSelection);

      // Dismiss loading toast and show success toast
      toaster.remove(loadingToastId);
      toaster.create({
        title: t("selection-updated"),
        type: "success",
      });
      logger.info(allSelectedIds, "Updated selection");
    } catch (error) {
      // Dismiss loading toast and show error toast
      toaster.remove(loadingToastId);
      toaster.create({
        title: t("selection-update-failed"),
        type: "error",
      });
      logger.error(error, "Failed to update selection");
    }
  };

  const handleUnrankedRowSelectionChange = async (
    updaterOrValue:
      | RowSelectionState
      | ((old: RowSelectionState) => RowSelectionState),
  ) => {
    if (!inventory) return;

    const newUnrankedRowSelection =
      typeof updaterOrValue === "function"
        ? updaterOrValue(unrankedRowSelection)
        : updaterOrValue;

    // Show loading toast
    const loadingToastId = toaster.create({
      title: t("updating-selection"),
      type: "loading",
      duration: Infinity, // Keep until manually dismissed
    });

    try {
      // For ranked actions, we need to send the database record ID (UUID)
      const rankedSelectedIds = Object.keys(rowSelection)
        .filter((id) => rowSelection[id])
        .map((rowId) => {
          const action = actions.find((a) => a.id === rowId);
          return action?.id; // This is the database record ID (UUID)
        })
        .filter((id): id is string => Boolean(id));

      // For unranked actions, we send the action ID (not database record ID)
      const unrankedSelectedIds = Object.keys(newUnrankedRowSelection)
        .filter((id) => newUnrankedRowSelection[id])
        .map((rowId) => {
          const actionId = rowId.replace("unranked-", "");
          const action = unrankedActions.find((a) => a.actionId === actionId);
          return action?.actionId; // This is the action ID from Global API
        })
        .filter((id): id is string => Boolean(id));

      const allSelectedIds = [...rankedSelectedIds, ...unrankedSelectedIds];

      // Track custom action selection (user didn't use default expert suggestions)
      trackEvent("hiap_expert_suggestions_overridden", {
        action_type: type,
        city_id: cityData?.cityId,
        inventory_id: inventory.inventoryId,
        selected_actions_count: allSelectedIds.length,
      });

      await updateHiapSelection({
        inventoryId: inventory.inventoryId,
        selectedActionIds: allSelectedIds,
      }).unwrap();

      setUnrankedRowSelection(newUnrankedRowSelection);

      // Dismiss loading toast and show success toast
      toaster.remove(loadingToastId);
      toaster.create({
        title: t("selection-updated"),
        type: "success",
      });
      logger.info(allSelectedIds, "Updated unranked selection");
    } catch (error) {
      // Dismiss loading toast and show error toast
      toaster.remove(loadingToastId);
      toaster.create({
        title: t("selection-update-failed"),
        type: "error",
      });
      logger.error(error, "Failed to update unranked selection");
    }
  };

  const columns: ColumnDef<HIAction>[] = useMemo(
    () => [
      ...(isSelectionMode
        ? [
            {
              id: "select",
              header: ({ table }: { table: TanStackTable<HIAction> }) => (
                <Checkbox
                  checked={table.getIsAllRowsSelected()}
                  onChange={table.getToggleAllRowsSelectedHandler()}
                />
              ),
              cell: ({ row }: { row: Row<HIAction> }) => (
                <Checkbox
                  checked={row.getIsSelected()}
                  disabled={!row.getCanSelect()}
                  onChange={row.getToggleSelectedHandler()}
                />
              ),
              enableSorting: false,
              enableHiding: false,
            },
          ]
        : []),
      {
        accessorKey: "rank",
        header: t("rank"),
        cell: ({ row }: { row: Row<HIAction> }) => (
          <Text color="content.secondary">{"#" + row.original.rank}</Text>
        ),
      },
      {
        accessorKey: "name",
        header: t("action"),
        cell: ({ row }: { row: Row<HIAction> }) => (
          <HStack
            alignItems="center"
            gap={1}
            maxW={"367px"}
            position="relative"
          >
            <Box>
              {row.original.isSelected && (
                <Icon as={TopPickIcon} color="content.link" boxSize={6} />
              )}
            </Box>

            <Text color="content.secondary">{row.original.name}</Text>
          </HStack>
        ),
      },
      ...(isAdaptation
        ? [
            {
              id: "hazards-covered",
              header: t("hazards-covered"),
              cell: ({ row }: { row: Row<HIAction> }) => {
                const action = row.original as AdaptationAction;
                const hazardCount = action.hazards?.length || 0;
                return (
                  <Badge colorScheme="orange">
                    {hazardCount} {t("hazards")}
                  </Badge>
                );
              },
            },
            {
              id: "adaptation-effectiveness",
              header: t("effectiveness"),
              cell: ({ row }: { row: Row<HIAction> }) => {
                const action = row.original as AdaptationAction;
                const effectivenessMap: Record<string, number> = {
                  low: 1,
                  medium: 2,
                  high: 3,
                };
                const blueBars =
                  effectivenessMap[action.adaptationEffectiveness] || 0;
                return <BarVisualization value={blueBars} total={3} />;
              },
            },
          ]
        : [
            {
              id: "sector",
              header: t("sector-label"),
              cell: ({ row }: { row: Row<HIAction> }) => {
                const action = row.original as MitigationAction;
                return (
                  <HStack gap={1} flexWrap="wrap">
                    {action.sectors.map((sector) => (
                      <Text key={sector} color="content.secondary">
                        {t(`sector.${sector}`)}
                      </Text>
                    ))}
                  </HStack>
                );
              },
            },
            {
              id: "reduction-potential",
              header: t("ghg-reduction"),
              cell: ({ row }: { row: Row<HIAction> }) => {
                const action = row.original as MitigationAction;
                const totalReduction = Object.values(
                  action.GHGReductionPotential,
                )
                  .filter((value): value is string => value !== null)
                  .map((value) => {
                    // Parse range like "80-100" and take the average
                    if (value.includes("-")) {
                      const [min, max] = value
                        .split("-")
                        .map((v) => parseFloat(v));
                      return (min + max) / 2;
                    }
                    return parseFloat(value);
                  })
                  .reduce((sum, value) => sum + value, 0);
                const blueBars = Math.min(Math.ceil(totalReduction / 20), 5);
                return (
                  <BarVisualization value={blueBars} total={5} width="60px" />
                );
              },
            },
          ]),
      {
        id: "actions",
        header: "",
        cell: ({ row }: { row: Row<HIAction> }) => (
          <IconButton
            aria-label="View details"
            variant="ghost"
            size="sm"
            onClick={() => {
              setSelectedAction(row.original);
              logger.info(row.original, "Open drawer for action");
            }}
          >
            <Icon as={RiExpandDiagonalFill} color="interactive.control" />
          </IconButton>
        ),
      },
    ],
    [isSelectionMode, t],
  );

  // Columns for unranked actions table
  const unrankedColumns: ColumnDef<HIAction>[] = useMemo(
    () => {
      // Selection column (only shown in selection mode)
      const selectionColumn = {
        id: "select",
        header: ({ table }: { table: TanStackTable<HIAction> }) => (
          <Checkbox
            checked={table.getIsAllRowsSelected()}
            onChange={table.getToggleAllRowsSelectedHandler()}
          />
        ),
        cell: ({ row }: { row: Row<HIAction> }) => (
          <Checkbox
            checked={row.getIsSelected()}
            disabled={!row.getCanSelect()}
            onChange={row.getToggleSelectedHandler()}
          />
        ),
        enableSorting: false,
        enableHiding: false,
      };

      // Type-specific columns for adaptation
      const adaptationColumns = [
        {
          id: "hazards-covered",
          header: t("hazards-covered"),
          cell: ({ row }: { row: Row<HIAction> }) => {
            const action = row.original as AdaptationAction;
            const hazardCount = action.hazards?.length || 0;
            return (
              <Badge colorScheme="orange">
                {hazardCount} {t("hazards")}
              </Badge>
            );
          },
        },
        {
          id: "adaptation-effectiveness",
          header: t("effectiveness"),
          cell: ({ row }: { row: Row<HIAction> }) => {
            const action = row.original as AdaptationAction;
            const effectivenessMap: Record<string, number> = {
              low: 1,
              medium: 2,
              high: 3,
            };
            const blueBars =
              effectivenessMap[action.adaptationEffectiveness] || 0;
            return <BarVisualization value={blueBars} total={3} />;
          },
        },
      ];

      // Type-specific columns for mitigation
      const mitigationColumns = [
        {
          id: "sector",
          header: t("sector-label"),
          cell: ({ row }: { row: Row<HIAction> }) => {
            const action = row.original as MitigationAction;
            return (
              <HStack gap={1} flexWrap="wrap">
                {action.sectors.map((sector) => (
                  <Text key={sector} color="content.secondary">
                    {t(`sector.${sector}`)}
                  </Text>
                ))}
              </HStack>
            );
          },
        },
        {
          id: "reduction-potential",
          header: t("ghg-reduction"),
          cell: ({ row }: { row: Row<HIAction> }) => {
            const action = row.original as MitigationAction;
            const totalReduction = Object.values(
              action.GHGReductionPotential,
            )
              .filter((value): value is string => value !== null)
              .map((value) => {
                // Parse range like "80-100" and take the average
                if (value.includes("-")) {
                  const [min, max] = value
                    .split("-")
                    .map((v) => parseFloat(v));
                  return (min + max) / 2;
                }
                return parseFloat(value);
              })
              .reduce((sum, value) => sum + value, 0);
            const blueBars = Math.min(Math.ceil(totalReduction / 20), 5);
            return (
              <BarVisualization value={blueBars} total={5} width="60px" />
            );
          },
        },
      ];

      // Common name column
      const nameColumn = {
        accessorKey: "name",
        header: t("action"),
        cell: ({ row }: { row: Row<HIAction> }) => (
          <HStack
            alignItems="center"
            gap={1}
            maxW={"367px"}
            position="relative"
          >
            <Box>
              {row.original.isSelected && (
                <Icon as={TopPickIcon} color="content.link" boxSize={6} />
              )}
            </Box>
            <Text color="content.secondary">{row.original.name}</Text>
          </HStack>
        ),
      };

      // Actions column
      const actionsColumn = {
        id: "actions",
        header: "",
        cell: ({ row }: { row: Row<HIAction> }) => (
          <IconButton
            aria-label="View details"
            variant="ghost"
            size="sm"
            onClick={() => {
              setSelectedAction(row.original);
              logger.info(row.original, "Open drawer for unranked action");
            }}
          >
            <Icon as={RiExpandDiagonalFill} color="interactive.control" />
          </IconButton>
        ),
      };

      // Determine which selection columns to include
      const selectionColumns = isSelectionMode ? [selectionColumn] : [];
      
      // Determine which type-specific columns to include
      const typeSpecificColumns = isAdaptation ? adaptationColumns : mitigationColumns;

      // Assemble all columns in order
      return [
        ...selectionColumns,
        nameColumn,
        ...typeSpecificColumns,
        actionsColumn,
      ];
    },
    [isSelectionMode, isAdaptation, t],
  );

  const table = useReactTable({
    data: actions,
    columns,
    getCoreRowModel: getCoreRowModel(),
    state: {
      rowSelection,
    },
    onRowSelectionChange: handleRowSelectionChange,
    enableRowSelection: true,
    getRowId: (row) => row.id, // Use the action ID as row ID
  });

  // Create a separate table instance for unranked actions
  const unrankedTable = useReactTable({
    data: unrankedActions,
    columns: unrankedColumns,
    getCoreRowModel: getCoreRowModel(),
    state: {
      rowSelection: unrankedRowSelection,
    },
    onRowSelectionChange: handleUnrankedRowSelectionChange,
    enableRowSelection: true,
    getRowId: (row) => `unranked-${row.id}`, // Prefix to avoid ID conflicts
  });

  // Update selected actions when row selection changes
  useEffect(() => {
    const selectedRankedActions = actions.filter(
      (action) => rowSelection[action.id],
    );
    const selectedUnrankedActions = unrankedActions.filter(
      (action) => unrankedRowSelection[`unranked-${action.id}`],
    );
    const newSelectedActions = [
      ...selectedRankedActions,
      ...selectedUnrankedActions,
    ];
    setSelectedActions(newSelectedActions);
  }, [rowSelection, unrankedRowSelection, actions, unrankedActions]);

  // When main HIAP query completes, refetch status to ensure UI is in sync
  useEffect(() => {
    if (hiapData && userTriggeredHiap) {
      // Refetch status to ensure the UI shows the latest state
      refetchStatus();
    }
  }, [hiapData, userTriggeredHiap, refetchStatus]);

  // Clear local pending when we get any definitive response
  useEffect(() => {
    if (currentData?.status || currentError) {
      setLocalIsPending(false);
    }
  }, [currentData?.status, currentError]);

  // If no inventory, show empty state (after all hooks)
  if (!inventory) {
    return (
      <ClimateActionsEmptyState
        t={t}
        inventory={null}
        hasActions={false}
        actionType={type}
        onRefetch={handleHiapGeneration}
        isActionsPending={false}
        error={currentError}
      />
    );
  }

  const handleClearSelection = async () => {
    try {
      await updateHiapSelection({
        inventoryId: inventory.inventoryId,
        selectedActionIds: [],
      }).unwrap();

      setRowSelection({});
      setSelectedActions([]);
      logger.info("Cleared all action selections");
    } catch (error) {
      logger.error(error, "Failed to clear selection");
    }
  };

  const toggleSelectionMode = () => {
    setIsSelectionMode(!isSelectionMode);
  };

  const handleDownloadPDF = async () => {
    const toExport = selectedActions.length > 0 ? selectedActions : actions;
    if (!toExport || toExport.length === 0) return;

    const [{ pdf }, { default: PrintableActionPlanPDF }] = await Promise.all([
      import("@react-pdf/renderer"),
      import("@/components/HIAP/PrintableActionPlanPDF"),
    ]);

    const blob = await pdf(
      <PrintableActionPlanPDF
        actions={toExport}
        t={t}
        cityName={cityData?.name || cityData?.locode}
      />,
    ).toBlob();

    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    const typePart =
      type === ACTION_TYPES.Adaptation ? "Adaptation" : "Mitigation";
    link.download = `${(cityData?.name || cityData?.locode || "actions").replace(/\s+/g, "_")}_${typePart}_actions.pdf`;
    link.click();

    // Track HIAP report download
    trackEvent("hiap_report_downloaded", {
      format: "pdf",
      action_type: type,
      city_id: cityData?.cityId,
      city_name: cityData?.name || cityData?.locode,
      inventory_id: inventory?.inventoryId,
      actions_count: toExport.length,
      selected_actions_only: selectedActions.length > 0,
    });

    URL.revokeObjectURL(link.href);
  };

  const handleDownloadCSV = () => {
    const toExport = selectedActions.length > 0 ? selectedActions : actions;
    if (!toExport || toExport.length === 0) return;

    (async () => {
      const { downloadActionPlanCsv } = await import("@/util/csv");
      downloadActionPlanCsv({
        actions: toExport,
        t,
        type,
        cityName: cityData?.name || cityData?.locode,
      });

      // Track HIAP report download
      trackEvent("hiap_report_downloaded", {
        format: "csv",
        action_type: type,
        city_id: cityData?.cityId,
        city_name: cityData?.name || cityData?.locode,
        inventory_id: inventory?.inventoryId,
        actions_count: toExport.length,
        selected_actions_only: selectedActions.length > 0,
      });
    })();
  };

  if (isCombinedLoading) {
    return (
      <Box
        display="flex"
        flexDirection="column"
        alignItems="center"
        justifyContent="center"
        py="48px"
        h="400px"
      >
        <ProgressLoader />
        <Text
          fontSize="body.lg"
          color="content.secondary"
          fontWeight="normal"
          mt="24px"
        >
          {t("loading")}
        </Text>
      </Box>
    );
  }

  // Show empty state for no actions, errors, or PENDING status
  if (!hasActions || currentError || isFailure) {
    return (
      <ClimateActionsEmptyState
        t={t}
        inventory={inventory}
        hasActions={hasActions}
        actionType={type}
        isActionsPending={isPending}
        onRefetch={handleHiapGeneration}
        error={currentError || isFailure}
      />
    );
  }
  return (
    <Box overflowX="hidden" w="full" maxW="1090px" mx="auto">
      {selectedAction && (
        <ActionDrawer
          action={selectedAction}
          isOpen={!!selectedAction}
          onClose={() => setSelectedAction(null)}
          t={t}
          lng={lng}
        />
      )}
      {/* Top action widgets / mitigation */}
      <ActionPlanSection
        t={t}
        rankedActions={actions || []}
        unrankedActions={unrankedActions || []}
        cityLocode={cityData.locode}
        cityId={cityData.cityId}
        cityData={cityData}
        inventoryId={inventory.inventoryId}
        lng={lng}
      />
      <Box display="flex" flexDirection="column" gap="18px" py="24px">
        <Box display="flex" justifyContent="space-between" alignItems="center">
          <TitleLarge
            color="content.secondary"
            fontWeight="bold"
            fontFamily="heading"
          >
            {t("ranked-actions")}
          </TitleLarge>
          <Box display="flex" gap="16px">
            <Button
              variant="ghost"
              color="interactive.control"
              p="4px"
              onClick={toggleSelectionMode}
              disabled={isUpdatingSelection}
              bg={isSelectionMode ? "background.muted" : "transparent"}
            >
              <Icon as={isSelectionMode ? MdCheckBox : IoMdCheckboxOutline} />
              <Text>
                {isSelectionMode
                  ? selectedActions.length > 0
                    ? `${selectedActions.length} ${t("actions-selected")}`
                    : t("pick-actions")
                  : t("pick-actions")}
              </Text>
            </Button>
            <MenuRoot>
              <MenuTrigger asChild>
                <Button variant="ghost" color="interactive.control" p="4px">
                  <Icon as={DownloadIcon} />
                  <Text>{t("download-action-plan")}</Text>
                  <Icon as={MdArrowDropDown} color="interactive.control" />
                </Button>
              </MenuTrigger>
              <MenuContent minW="180px" zIndex={2000}>
                <MenuItem onClick={handleDownloadPDF} value="pdf">
                  <ButtonMedium color="interactive.control">
                    {t("export-as-pdf")}
                  </ButtonMedium>
                </MenuItem>
                <MenuItem onClick={handleDownloadCSV} value="csv">
                  <ButtonMedium color="interactive.control">
                    {t("export-as-csv")}
                  </ButtonMedium>
                </MenuItem>
              </MenuContent>
            </MenuRoot>
          </Box>
        </Box>
        <BodyLarge
          color="content.tertiary"
          fontWeight="normal"
          fontFamily="body"
        >
          {t("ranked-and-unranked-actions-description")}
        </BodyLarge>
      </Box>
      <ChakraTable.Root w="full" borderRadius="md" borderWidth="1px">
        <ChakraTable.Header bg="header.overlay">
          {table.getHeaderGroups().map((headerGroup) => (
            <ChakraTable.Row key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <ChakraTable.ColumnHeader
                  key={header.id}
                  textAlign="left"
                  fontWeight="bold"
                  fontFamily="heading"
                  textTransform="uppercase"
                  fontSize="body.sm"
                  color="content.secondary"
                  bg="background.neutral"
                >
                  {flexRender(
                    header.column.columnDef.header,
                    header.getContext(),
                  )}
                </ChakraTable.ColumnHeader>
              ))}
            </ChakraTable.Row>
          ))}
        </ChakraTable.Header>
        <ChakraTable.Body>
          {table.getRowModel().rows.map((row) => (
            <ChakraTable.Row key={row.id}>
              {row.getVisibleCells().map((cell) => (
                <ChakraTable.Cell
                  key={cell.id}
                  borderBottom="1px solid #e2e8f0"
                  p={4}
                >
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </ChakraTable.Cell>
              ))}
            </ChakraTable.Row>
          ))}
        </ChakraTable.Body>
      </ChakraTable.Root>

      {/* Unranked Actions Collapsible Section */}
      {unrankedActions.length > 0 && (
        <Box mt={20} overflowX="hidden">
          <Box
            display="flex"
            justifyContent="space-between"
            width="100%"
            alignItems="center"
            gap="8px"
          >
            <TitleLarge
              color="content.secondary"
              fontWeight="bold"
              fontFamily="heading"
            >
              {t("unranked-actions")}
            </TitleLarge>
            <Button
              variant="ghost"
              onClick={() => setShowUnrankedActions(!showUnrankedActions)}
              p="16px"
              borderRadius="8px"
              borderColor="border.neutral"
              bg="transparent"
            >
              <Icon
                as={showUnrankedActions ? MdExpandLess : MdExpandMore}
                color="interactive.control"
                boxSize="24px"
              />
            </Button>
          </Box>

          {showUnrankedActions && (
            <Box mt="16px" overflowX="hidden">
              <BodyLarge color="content.tertiary" mb="16px">
                {t("other-available-actions-description")}
              </BodyLarge>
              <ChakraTable.Root w="full" borderRadius="md" borderWidth="1px">
                <ChakraTable.Header bg="header.overlay">
                  {unrankedTable.getHeaderGroups().map((headerGroup) => (
                    <ChakraTable.Row key={headerGroup.id}>
                      {headerGroup.headers.map((header) => (
                        <ChakraTable.ColumnHeader
                          key={header.id}
                          textAlign="left"
                          fontWeight="bold"
                          fontFamily="heading"
                          textTransform="uppercase"
                          fontSize="body.sm"
                          color="content.secondary"
                          bg="background.neutral"
                        >
                          {flexRender(
                            header.column.columnDef.header,
                            header.getContext(),
                          )}
                        </ChakraTable.ColumnHeader>
                      ))}
                    </ChakraTable.Row>
                  ))}
                </ChakraTable.Header>
                <ChakraTable.Body>
                  {unrankedTable.getRowModel().rows.map((row) => (
                    <ChakraTable.Row key={row.id}>
                      {row.getVisibleCells().map((cell) => (
                        <ChakraTable.Cell
                          key={cell.id}
                          borderBottom="1px solid #e2e8f0"
                          p={4}
                        >
                          {flexRender(
                            cell.column.columnDef.cell,
                            cell.getContext(),
                          )}
                        </ChakraTable.Cell>
                      ))}
                    </ChakraTable.Row>
                  ))}
                </ChakraTable.Body>
              </ChakraTable.Root>
            </Box>
          )}
        </Box>
      )}
    </Box>
  );
}
