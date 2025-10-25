import { CityWithProjectDataResponse, InventoryResponse } from "@/util/types";
import {
  LANGUAGES,
  ACTION_TYPES,
  HIAction,
  MitigationAction,
  AdaptationAction,
  CityResponse,
} from "@/util/types";
import { useEffect, useState } from "react";
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
  const [selectedActions, setSelectedActions] = useState<HIAction[]>([]);
  const [isSelectionMode, setIsSelectionMode] = useState(false);

  // HIAP Query State
  const [userTriggeredHiap, setUserTriggeredHiap] = useState(false);
  const [ignoreExisting, setIgnoreExisting] = useState(false);

  // API Queries
  // Status check query - runs on page load to detect existing jobs
  const {
    data: statusData,
    isLoading: isStatusLoading,
    error: statusError,
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
  const actions = currentData?.rankedActions || [];
  const isAdaptation = type === ACTION_TYPES.Adaptation;
  const isPending = currentData?.status === HighImpactActionRankingStatus.PENDING;
  const hasActions = actions && actions.length > 0;

  // Combined loading state
  const isCombinedLoading = isStatusLoading || isLoading;
  // Use error from triggered query if available, otherwise from status query
  const currentError = error || statusError;

  // Event Handlers
  const handleHiapGeneration = () => {
    if (error) {
      // Retry with ignoreExisting flag
      setIgnoreExisting(true);
      refetch();
    } else {
      // Initial trigger
      setUserTriggeredHiap(true);
    }
  };

  // Initialize selection state from database
  useEffect(() => {
    if (actions.length > 0) {
      const initialSelection: RowSelectionState = {};
      const initialSelectedActions: HIAction[] = [];

      actions.forEach((action) => {
        if (action.isSelected) {
          initialSelection[action.id] = true;
          initialSelectedActions.push(action);
        }
      });

      setRowSelection(initialSelection);
      setSelectedActions(initialSelectedActions);
    }
  }, [actions]);

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

    try {
      const selectedActionIds = Object.keys(newRowSelection).filter(
        (id) => newRowSelection[id],
      );
      await updateHiapSelection({
        inventoryId: inventory.inventoryId,
        selectedActionIds,
      }).unwrap();

      setRowSelection(newRowSelection);
      // toast
      toaster.create({
        title: t("selection-updated"),
        type: "success",
      });
      logger.info(selectedActionIds, "Updated selection");
    } catch (error) {
      logger.error(error, "Failed to update selection");
    }
  };

  const columns: ColumnDef<HIAction>[] = [
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
        <HStack alignItems="center" gap={1} maxW={"367px"} position="relative">
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
              const totalReduction = Object.values(action.GHGReductionPotential)
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
  ];

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

  // Update selected actions when row selection changes
  useEffect(() => {
    const selectedRows = table.getSelectedRowModel().rows;
    const newSelectedActions = selectedRows.map((row) => row.original);
    setSelectedActions(newSelectedActions);
  }, [rowSelection, table]);

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
  if (!hasActions || currentError) {
    return (
      <ClimateActionsEmptyState
        t={t}
        inventory={inventory}
        hasActions={hasActions}
        actionType={type}
        isActionsPending={isPending}
        onRefetch={handleHiapGeneration}
        error={currentError}
      />
    );
  }
  return (
    <Box overflowX="auto" w="full" maxW="1090px" mx="auto">
      {selectedAction && (
        <ActionDrawer
          action={selectedAction}
          isOpen={!!selectedAction}
          onClose={() => setSelectedAction(null)}
          t={t}
        />
      )}
      {/* Top action widgets / mitigation */}
      <ActionPlanSection
        t={t}
        rankedActions={actions || []}
        cityLocode={cityData.locode}
        cityId={cityData.cityId}
        cityData={cityData}
        inventoryId={inventory.inventoryId}
      />
      <Box display="flex" flexDirection="column" gap="18px" py="24px">
        <Box display="flex" justifyContent="space-between" alignItems="center">
          <TitleLarge
            color="content.secondary"
            fontWeight="bold"
            fontFamily="heading"
          >
            {t("ranked-and-unranked-actions")}
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
    </Box>
  );
}
