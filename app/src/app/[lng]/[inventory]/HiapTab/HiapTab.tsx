import { InventoryResponse } from "@/util/types";
import { LANGUAGES, ACTION_TYPES, HIAction, MitigationAction, AdaptationAction } from "@/util/types";
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
import { useGetHiapQuery } from "@/services/api";
import { logger } from "@/services/logger";
import { HighImpactActionRankingStatus } from "@/util/types";

export const BarVisualization = ({ value, total, width  = "16px"}: { value: number; total: number, width?: string }) => {
  return (
    <HStack gap={1}>
      {Array.from({ length: total }).map((_, index) => (
        <Box
          key={index}
          w={width}
          h="4px"
          bg={index < value ? "blue.500" : "gray.200"}
          borderRadius="sm"
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

  const { data: hiapData, isLoading, error } = useGetHiapQuery({
    inventoryId: inventory.inventoryId,
    lng: lng,
    actionType: type
  });

  const actions = hiapData?.rankedActions || [];
  const isAdaptation = type === ACTION_TYPES.Adaptation;
  
  const isPending = hiapData?.status === HighImpactActionRankingStatus.PENDING;
  
  const columns: ColumnDef<HIAction>[] = [
    {
      accessorKey: "rank",
      header: t("ranking"),
      cell: ({ row }: { row: Row<HIAction> }) => (
        <Badge colorScheme="blue">{row.original.rank}</Badge>
      ),
    },
    {
      accessorKey: "name",
      header: t("action-name"),
      cell: ({ row }: { row: Row<HIAction> }) => (
        <VStack alignItems="flex-start" gap={1}>
          <Text fontWeight="bold">{row.original.name}</Text>
          <Text fontSize="sm" color="gray.600">
            {row.original.description}
          </Text>
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
              const hazardCount = action.hazards.length;
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
              const blueBars = effectivenessMap[action.adaptationEffectiveness] || 0;
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
            cell: ({ row }: { row: Row<HIAction> }) => {
              const action = row.original as MitigationAction;
              const totalReduction = Object.values(action.GHGReductionPotential)
                .filter((value): value is string => value !== null)
                .map(value => {
                  // Parse range like "80-100" and take the average
                  if (value.includes("-")) {
                    const [min, max] = value.split("-").map(v => parseFloat(v));
                    return (min + max) / 2;
                  }
                  return parseFloat(value);
                })
                .reduce((sum, value) => sum + value, 0);
              const blueBars = Math.min(Math.ceil(totalReduction / 20), 5);
              return <BarVisualization value={blueBars} total={5} />;
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
            setSelectedAction(row.original)
            logger.info("Open drawer for action:", row.original);
          }}
        >
          <RiExpandDiagonalFill color="black" />
        </IconButton>
      ),
    },
  ];

  const table = useReactTable({
    data: actions,
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

  // Show pending message when ranking is in progress
  if (isPending) {
    return (
      <Box p={4} textAlign="center">
        <Text fontSize="lg" mb={2}>
          {t("prioritizing-actions")}
        </Text>
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
