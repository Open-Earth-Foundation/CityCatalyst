import React, { useMemo, useState } from "react";
import {
  Box,
  Flex,
  Icon,
  IconButton,
  Input,
  Table,
  Text,
} from "@chakra-ui/react";
import {
  NativeSelectField,
  NativeSelectRoot,
} from "@/components/ui/native-select";
// import { Checkbox } from "@/components/ui/checkbox";
import { IoIosArrowBack } from "react-icons/io";
import { InputGroup } from "@/components/ui/input-group";
import { MdSearch } from "react-icons/md";
import { Checkbox } from "@/components/ui/checkbox";
import { CheckedChangeDetails } from "@zag-js/checkbox";

type FilterOption<TValue> = TValue | { label: string; value: TValue };

type DataTableProps<T> = {
  data: T[];
  t: Function;
  title: string;
  columns: { header: string; accessor: keyof T | null }[];
  searchable?: boolean;
  pagination?: boolean;
  itemsPerPage?: number;
  filterProperty?: keyof T;
  filterOptions?: FilterOption<T[keyof T]>[];
  renderRow: (item: T, index: number) => React.ReactNode;
  selectable?: boolean;
  selectedRowKeys?: Array<T[keyof T]>;
  onSelectRow?: (selectedRowKeys: Array<T[keyof T]>) => void;
  selectKey?: keyof T;
};

function isLabelValueOption<TValue>(
  option: FilterOption<TValue>,
): option is { label: string; value: TValue } {
  return (
    typeof option === "object" &&
    option !== null &&
    "label" in option &&
    "value" in option
  );
}

function DataTable<T extends Record<string, any>>({
  data,
  title,
  t,
  columns,
  searchable = false,
  pagination = false,
  itemsPerPage = 10,
  filterProperty,
  filterOptions = [],
  renderRow,
  selectable,
  selectedRowKeys = [],
  onSelectRow,
  selectKey,
}: DataTableProps<T>) {
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [filterValue, setFilterValue] = useState<string | number>("");

  const filteredData = useMemo(() => {
    return data.filter((item) => {
      const matchesSearch = searchable
        ? Object.values(item).some((val) =>
            String(val).toLowerCase().includes(searchQuery.toLowerCase()),
          )
        : true;

      const matchesFilter =
        filterProperty && filterValue
          ? item[filterProperty] === filterValue
          : true;

      return matchesSearch && matchesFilter;
    });
  }, [data, searchQuery, filterValue, filterProperty, searchable]);

  const paginatedData = useMemo(() => {
    if (!pagination) return filteredData;
    const start = (currentPage - 1) * itemsPerPage;
    return filteredData.slice(start, start + itemsPerPage);
  }, [filteredData, pagination, currentPage, itemsPerPage]);

  const totalPages =
    filteredData.length > 0 ? Math.ceil(filteredData.length / itemsPerPage) : 1;

  const currentRowKeys =
    selectable && selectKey ? paginatedData.map((item) => item[selectKey]) : [];
  const allSelected =
    currentRowKeys.length > 0 &&
    currentRowKeys.every((key) => selectedRowKeys.includes(key));
  const someSelected =
    currentRowKeys.some((key) => selectedRowKeys.includes(key)) && !allSelected;

  const toggleSelectAll = (e: CheckedChangeDetails) => {
    let newSelected: Array<T[keyof T]> = [];
    if (allSelected) {
      // Deselect all rows on this page:
      newSelected = selectedRowKeys.filter(
        (key) => !currentRowKeys.includes(key),
      );
    } else {
      // Select all rows on this page (avoiding duplicates):
      newSelected = Array.from(
        new Set([...selectedRowKeys, ...currentRowKeys]),
      );
    }
    onSelectRow?.(newSelected);
  };

  const handleSelect = (e: CheckedChangeDetails, rowKey: T[keyof T]) => {
    let newSelected: Array<T[keyof T]> = [];
    if (!e.checked) {
      newSelected = selectedRowKeys.filter((key) => key !== rowKey);
    } else {
      newSelected = [...selectedRowKeys, rowKey];
    }
    onSelectRow?.(newSelected);
  };

  return (
    <Box className="bg-white" p={6} rounded={2} mt={12}>
      <Text fontWeight="bold" fontSize="title.md" mb={6}>
        {title}
      </Text>
      <Flex mb={4} justifyContent="space-between">
        <Flex mb={4} gap={2}>
          {searchable && (
            <InputGroup
              startElement={
                <Icon as={MdSearch} color="interactive.control" boxSize={6} />
              }
            >
              <Input
                minWidth="350px"
                placeholder={t("search-records")}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </InputGroup>
          )}

          {filterProperty && filterOptions.length > 0 && (
            <NativeSelectRoot
              shadow="1dp"
              borderRadius="4px"
              border="inpu/tBox"
              fontSize="body.lg"
              h="full"
              w="full"
              _focus={{
                borderWidth: "1px",
                borderColor: "content.link",
                shadow: "none",
              }}
            >
              <NativeSelectField
                placeholder={t("all")}
                value={filterValue}
                onChange={(e) => setFilterValue(e.target.value)}
              >
                {filterOptions.map((option, idx) => {
                  const isObj = isLabelValueOption(option);
                  const value = isObj ? option.value : option;
                  const label = isObj ? option.label : String(option);
                  return (
                    <option
                      className="!capitalize"
                      key={idx}
                      value={String(value)}
                    >
                      {label}
                    </option>
                  );
                })}
              </NativeSelectField>
            </NativeSelectRoot>
          )}
        </Flex>
        {pagination && (
          <Flex mt={4} gap={2} justify="space-between" align="center">
            <Text fontSize="body.md" color="content.tertiary">
              {(currentPage - 1) * itemsPerPage + 1} -{" "}
              {Math.min(filteredData.length, currentPage * itemsPerPage)}{" "}
              {t("of")} {filteredData.length}
            </Text>
            <IconButton
              color="interactive.control"
              variant="plain"
              disabled={currentPage === 1}
              onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
            >
              <Icon as={IoIosArrowBack} />
            </IconButton>
            <IconButton
              color="interactive.control"
              variant="plain"
              disabled={currentPage === totalPages}
              onClick={() =>
                setCurrentPage((prev) => Math.min(prev + 1, totalPages))
              }
            >
              <Icon as={IoIosArrowBack} rotate="180deg" />
            </IconButton>
          </Flex>
        )}
      </Flex>

      <Table.Root
        px={0}
        variant="line"
        overflowX="hidden"
        rounded="20px"
        borderWidth="1px"
      >
        <Table.Header bg="background.backgroundLight">
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
                key={String(col.accessor)}
              >
                {col.header}
              </Table.ColumnHeader>
            ))}
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {filteredData.length === 0 && (
            <Table.Row>
              <Table.Cell colSpan={columns.length}>
                <Text fontSize="body.md" color="content.tertiary">
                  {t("no-data")}
                </Text>
              </Table.Cell>
            </Table.Row>
          )}
          {paginatedData.map((item, idx) => {
            const renderedRow = renderRow(item, idx);
            // If selectable is enabled and renderRow returns a <Table.Row>,
            // clone it to prepend a cell with a checkbox.
            if (
              selectable &&
              selectKey &&
              React.isValidElement(renderedRow) &&
              renderedRow.type === Table.Row
            ) {
              const rowKey = item[selectKey];
              const isSelected =
                selectable && selectKey
                  ? selectedRowKeys.includes(rowKey)
                  : false;
              const cells = React.Children.toArray(renderedRow.props.children);
              return React.cloneElement(
                renderedRow,
                { key: rowKey },
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
    </Box>
  );
}

export default DataTable;
