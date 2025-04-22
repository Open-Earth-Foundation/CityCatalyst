import { InventoryResponse } from "@/util/types";
import {
  Action,
  AdaptationAction,
  MitigationAction,
} from "@/app/[lng]/[inventory]/CapTab/types";
import { LANGUAGES, ACTION_TYPES } from "@/util/types";
import { useEffect, useState } from "react";
import { useTranslation } from "@/i18n/client";
import i18next from "i18next";
import { Box, Text, Badge, VStack, HStack, Button, IconButton } from "@chakra-ui/react";
import { Tooltip } from "@/components/ui/tooltip";
import { RiExpandDiagonalFill } from "react-icons/ri";
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  ColumnDef,
  Row,
} from "@tanstack/react-table";
import { ActionDrawer } from "./ActionDrawer";
import { useGetCapQuery } from "@/services/api";

export const BarVisualization = ({ value, total }: { value: number; total: number }) => {
  return (
    <HStack gap={1}>
      {Array.from({ length: total }).map((_, index) => (
        <Box
          key={index}
          w="16px"
          h="4px"
          bg={index < value ? "blue.500" : "gray.200"}
          borderRadius="sm"
        />
      ))}
    </HStack>
  );
};

export function CapActionTab({
  type,
  inventory,
}: {
  type: ACTION_TYPES;
  inventory: InventoryResponse;
}) {
  const lng = i18next.language as LANGUAGES;
  const { t } = useTranslation(lng, "cap");
  const [selectedAction, setSelectedAction] = useState<Action | null>(null);

  const { data: actions, isLoading, error } = useGetCapQuery({
    inventoryId: inventory.inventoryId,
    lng: lng,
    actionType: type
  });

  const isAdaptation = type === ACTION_TYPES.Adaptation;

  const columns: ColumnDef<Action>[] = [
    {
      accessorKey: "actionPriority",
      header: t("ranking"),
      cell: ({ row }: { row: Row<Action> }) => (
        <Badge colorScheme="blue">{row.original.actionPriority}</Badge>
      ),
    },
    {
      accessorKey: "actionName",
      header: t("action-name"),
      cell: ({ row }: { row: Row<Action> }) => (
        <VStack alignItems="flex-start" gap={1}>
          <Text fontWeight="bold">{row.original.actionName}</Text>
          <Text fontSize="sm" color="gray.600">
            {row.original.action.Description}
          </Text>
        </VStack>
      ),
    },
    ...(isAdaptation
      ? [
          {
            id: "hazards-covered",
            header: t("hazards-covered"),
            cell: ({ row }: { row: Row<Action> }) => {
              const action = row.original as AdaptationAction;
              return (
                <Badge colorScheme="orange">
                  {action.action.Hazard.length} {t("hazards")}
                </Badge>
              );
            },
          },
          {
            id: "adaptation-effectiveness",
            header: t("effectiveness"),
            cell: ({ row }: { row: Row<Action> }) => {
              const action = row.original as AdaptationAction;
              const effectivenessMap: Record<string, number> = {
                low: 1,
                medium: 2,
                high: 3,
              };
              const blueBars = effectivenessMap[action.action.AdaptationEffectiveness] || 0;
              return <BarVisualization value={blueBars} total={3} />;
            },
          },
        ]
      : [
          {
            id: "sector",
            header: t("sector-label"),
            cell: ({ row }: { row: Row<Action> }) => {
              const action = row.original as MitigationAction;
              return (
                <HStack gap={1} flexWrap="wrap">
                  {action.action.Sector.map((sector) => (
                    <Badge key={sector} colorScheme="blue">
                      {t(`sector.${sector}`)}
                    </Badge>
                  ))}
                </HStack>
              );
            },
          },
          {
            id: "reduction-potential",
            header: t("ghg-reduction"),
            cell: ({ row }: { row: Row<Action> }) => {
              const action = row.original as MitigationAction;
              const totalReduction = Object.values(action.action.GHGReductionPotential)
                .filter((value): value is string => value !== null)
                .map(value => parseFloat(value))
                .reduce((sum, value) => sum + value, 0);
              const blueBars = Math.min(Math.ceil(totalReduction / 20), 5);
              return <BarVisualization value={blueBars} total={5} />;
            },
          },
        ]),
    {
      id: "actions",
      header: "",
      cell: ({ row }: { row: Row<Action> }) => (
        <IconButton
          aria-label="View details"
          variant="ghost"
          size="sm"
          onClick={() => {
            setSelectedAction(row.original)
            console.log("Open drawer for action:", row.original);
          }}
        >
          <RiExpandDiagonalFill color="black" />
        </IconButton>
      ),
    },
  ];

  const table = useReactTable({
    data: Array.isArray(actions) ? actions : [],
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

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

  if (!actions || actions.length === 0) {
    return <Box p={4}>{t("no-actions-found")}</Box>;
  }

  return (
    <Box overflowX="auto">
      {selectedAction && (
        <ActionDrawer
          action={selectedAction}
          isOpen={!!selectedAction}
          onClose={() => setSelectedAction(null)}
          t={t}
        />
      )}
      <table style={{ width: "100%" }}>
        <thead>
          {table.getHeaderGroups().map((headerGroup) => (
            <tr key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <th
                  key={header.id}
                  style={{
                    padding: "8px",
                    textAlign: "left",
                    borderBottom: "1px solid #e2e8f0",
                  }}
                >
                  {flexRender(header.column.columnDef.header, header.getContext())}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map((row) => (
            <tr key={row.id}>
              {row.getVisibleCells().map((cell) => (
                <td
                  key={cell.id}
                  style={{
                    padding: "8px",
                    borderBottom: "1px solid #e2e8f0",
                  }}
                >
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </Box>
  );
}
