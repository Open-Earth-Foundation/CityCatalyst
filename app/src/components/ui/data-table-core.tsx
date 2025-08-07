// DataTableCore.tsx
import React from "react";
import { Table, Text } from "@chakra-ui/react";
import { Checkbox } from "@/components/ui/checkbox";
import { CheckedChangeDetails } from "@zag-js/checkbox";
import { useTranslation } from "@/i18n/client";
import { useParams } from "next/navigation";

function DataTableCore<T>({
  data,
  columns,
  renderRow,
  selectable,
  selectedRowKeys = [],
  onSelectRow,
  selectKey,
}: {
  data: T[];
  columns: { header: string; accessor: keyof T | null }[];
  renderRow: (item: T, index: number) => React.ReactNode;
  selectable?: boolean;
  selectedRowKeys?: Array<T[keyof T]>;
  onSelectRow?: (selectedRowKeys: Array<T[keyof T]>) => void;
  selectKey?: keyof T;
}) {
  const { lng } = useParams();
  const { t } = useTranslation(lng as string, "data");
  const currentRowKeys =
    selectable && selectKey ? data.map((item) => item[selectKey]) : [];
  const allSelected =
    currentRowKeys.length > 0 &&
    currentRowKeys.every((key) => selectedRowKeys.includes(key));
  const someSelected =
    currentRowKeys.some((key) => selectedRowKeys.includes(key)) && !allSelected;

  const toggleSelectAll = (e: CheckedChangeDetails) => {
    let newSelected = [];
    if (allSelected) {
      newSelected = selectedRowKeys.filter(
        (key) => !currentRowKeys.includes(key),
      );
    } else {
      newSelected = Array.from(
        new Set([...selectedRowKeys, ...currentRowKeys]),
      );
    }
    onSelectRow?.(newSelected);
  };

  const handleSelect = (e: CheckedChangeDetails, rowKey: T[keyof T]) => {
    let newSelected = [];
    if (!e.checked) {
      newSelected = selectedRowKeys.filter((key) => key !== rowKey);
    } else {
      newSelected = [...selectedRowKeys, rowKey];
    }
    onSelectRow?.(newSelected);
  };

  return (
    <Table.Root
      px={0}
      w="full"
      variant="line"
      overflowX="hidden"
      rounded="20px"
      borderWidth="1px"
    >
      <Table.Header>
        <Table.Row>
          {selectable && (
            <Table.ColumnHeader>
              <Checkbox
                checked={someSelected ? "indeterminate" : allSelected}
                onCheckedChange={toggleSelectAll}
                onClick={(e) => e.stopPropagation()}
              />
            </Table.ColumnHeader>
          )}
          {columns.map((col) => (
            <Table.ColumnHeader
              truncate
              fontWeight="bold"
              fontFamily="heading"
              textTransform="uppercase"
              fontSize="body.sm"
              color="content.secondary"
              bg="background.neutral"
              key={String(col.accessor ?? col.header)}
            >
              {col.header}
            </Table.ColumnHeader>
          ))}
        </Table.Row>
      </Table.Header>
      <Table.Body>
        {data.length === 0 && (
          <Table.Row>
            <Table.Cell colSpan={columns.length}>
              <Text fontSize="body.md" color="content.tertiary">
                {t("no-data")}
              </Text>
            </Table.Cell>
          </Table.Row>
        )}
        {data.map((item, idx) => {
          const renderedRow = renderRow(item, idx);
          if (
            selectable &&
            selectKey &&
            React.isValidElement(renderedRow) &&
            renderedRow.type === Table.Row
          ) {
            const rowKey = item[selectKey];
            const isSelected = selectedRowKeys.includes(rowKey);
            const rowProps = renderedRow.props as {
              children: React.ReactNode | React.ReactNode[];
            };
            const cells = React.Children.toArray(rowProps.children);
            return React.cloneElement(
              renderedRow,
              { key: rowKey as string },
              <>
                <Table.Cell>
                  <Checkbox
                    checked={isSelected}
                    onCheckedChange={(e) => handleSelect(e, rowKey)}
                    onClick={(e) => e.stopPropagation()}
                  />
                </Table.Cell>
                {cells}
              </>,
            );
          }
          return renderedRow;
        })}
      </Table.Body>
    </Table.Root>
  );
}

export default DataTableCore;
