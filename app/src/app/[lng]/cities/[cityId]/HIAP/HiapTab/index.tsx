import { InventoryResponse } from "@/util/types";
import {
  LANGUAGES,
  ACTION_TYPES,
  HIAction,
  MitigationAction,
  AdaptationAction,
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
  Table,
  Icon,
} from "@chakra-ui/react";
import { Checkbox } from "@/components/ui/checkbox";
import {
  MenuRoot,
  MenuTrigger,
  MenuContent,
  MenuItem,
} from "@/components/ui/menu";
import { Tooltip } from "@/components/ui/tooltip";
import { RiExpandDiagonalFill } from "react-icons/ri";
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  ColumnDef,
  Row,
  RowSelectionState,
} from "@tanstack/react-table";
import { ActionDrawer } from "@/components/ActionDrawer";
import { useGetHiapQuery } from "@/services/api";
import { logger } from "@/services/logger";
import { HighImpactActionRankingStatus } from "@/util/types";
import ClimateActionsEmptyState from "./ClimateActionsEmptyState";
import ActionPlanSection from "./ActionPlanSection";
import { DownloadIcon } from "@/components/icons";
import { FaCaretDown } from "react-icons/fa";
import { MdCheckBox } from "react-icons/md";
import { TitleLarge } from "@/components/Texts/Title";
import { BodyLarge } from "@/components/Texts/Body";
import { IoMdCheckboxOutline } from "react-icons/io";

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
}: {
  type: ACTION_TYPES;
  inventory: InventoryResponse;
}) {
  const lng = i18next.language as LANGUAGES;
  const { t } = useTranslation(lng, "hiap");
  const [selectedAction, setSelectedAction] = useState<HIAction | null>(null);
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [selectedActions, setSelectedActions] = useState<HIAction[]>([]);

  const {
    data: hiapData,
    isLoading,
    error,
    refetch,
  } = useGetHiapQuery({
    inventoryId: inventory.inventoryId,
    lng: lng,
    actionType: type,
  });

  const actions = hiapData?.rankedActions || [];
  const isAdaptation = type === ACTION_TYPES.Adaptation;

  const isPending = hiapData?.status === HighImpactActionRankingStatus.PENDING;

  const columns: ColumnDef<HIAction>[] = [
    {
      id: "select",
      header: ({ table }) => (
        <Checkbox
          checked={table.getIsAllRowsSelected()}
          // indeterminate={table.getIsSomeRowsSelected()}
          onChange={table.getToggleAllRowsSelectedHandler()}
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          checked={row.getIsSelected()}
          disabled={!row.getCanSelect()}
          onChange={row.getToggleSelectedHandler()}
        />
      ),
      enableSorting: false,
      enableHiding: false,
    },
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
        <VStack alignItems="flex-start" gap={1} maxW={"367px"}>
          <Text color="content.secondary">{row.original.name}</Text>
        </VStack>
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
            logger.info("Open drawer for action:", row.original);
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
    onRowSelectionChange: setRowSelection,
    enableRowSelection: true,
    getRowId: (row) => row.id, // Use the action ID as row ID
  });

  // Update selected actions when row selection changes
  useEffect(() => {
    const selectedRows = table.getSelectedRowModel().rows;
    const newSelectedActions = selectedRows.map((row) => row.original);
    setSelectedActions(newSelectedActions);
  }, [rowSelection, table]);

  const handleClearSelection = () => {
    setRowSelection({});
    setSelectedActions([]);
  };

  const handleSelectAll = () => {
    const allRowIds = actions.reduce((acc, action) => {
      acc[action.id] = true;
      return acc;
    }, {} as RowSelectionState);
    setRowSelection(allRowIds);
  };

  if (isLoading) {
    return <Box p={4}>{t("loading")}</Box>;
  }

  if (error) {
    return (
      <Box p={4} color="red.500">
        {t("error-loading-data")}
      </Box>
    );
  }

  // Empty state - check if we have actions
  const hasActions = actions && actions.length > 0;

  if (!hasActions) {
    return (
      <ClimateActionsEmptyState
        t={t}
        inventory={inventory}
        hasActions={hasActions}
        actionType={type}
        isActionsPending={isPending}
        onRefetch={() => {
          // TODO: Implement refetch logic
          refetch();
        }}
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
      <ActionPlanSection t={t} rankedActions={actions || []} />
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
            <MenuRoot>
              <MenuTrigger asChild>
                <Button variant="ghost" color="interactive.control" p="4px">
                  <Icon
                    as={
                      selectedActions.length > 0
                        ? MdCheckBox
                        : IoMdCheckboxOutline
                    }
                  />
                  <Text>
                    {selectedActions.length > 0
                      ? `${t("pick-actions")} (${selectedActions.length})`
                      : t("pick-actions")}
                  </Text>
                  <Icon as={FaCaretDown} color="interactive.control" />
                </Button>
              </MenuTrigger>
              <MenuContent>
                <MenuItem
                  value="select-all"
                  onClick={handleSelectAll}
                  disabled={actions.length === 0}
                >
                  {t("select-all")}
                </MenuItem>
                <MenuItem
                  value="clear-selection"
                  onClick={handleClearSelection}
                  disabled={selectedActions.length === 0}
                >
                  {t("clear-selection")}
                </MenuItem>
                {selectedActions.length > 0 && (
                  <MenuItem
                    value="use-selected"
                    onClick={() => {
                      logger.info("Selected actions:", selectedActions);
                      // TODO: Handle selected actions (e.g., add to action plan)
                    }}
                  >
                    Use {selectedActions.length} {t("actions-selected")}
                  </MenuItem>
                )}
              </MenuContent>
            </MenuRoot>
            <Button variant="ghost" color="interactive.control" p="4px">
              <Icon as={DownloadIcon} />
              <Text>{t("download-action-plan")}</Text>
              <Icon as={FaCaretDown} color="interactive.control" />
            </Button>
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
      <Table.Root w="full" borderRadius="md" borderWidth="1px">
        <Table.Header bg="header.overlay">
          {table.getHeaderGroups().map((headerGroup) => (
            <Table.Row key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <Table.ColumnHeader
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
                </Table.ColumnHeader>
              ))}
            </Table.Row>
          ))}
        </Table.Header>
        <Table.Body>
          {table.getRowModel().rows.map((row) => (
            <Table.Row key={row.id}>
              {row.getVisibleCells().map((cell) => (
                <Table.Cell
                  key={cell.id}
                  borderBottom="1px solid #e2e8f0"
                  p={4}
                >
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </Table.Cell>
              ))}
            </Table.Row>
          ))}
        </Table.Body>
      </Table.Root>
    </Box>
  );
}
