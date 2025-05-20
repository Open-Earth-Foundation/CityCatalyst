import React, { useMemo, useState } from "react";
import { Box, Flex, Icon, IconButton, Input, Text } from "@chakra-ui/react";
import { IoIosArrowBack } from "react-icons/io";
import { MdSearch } from "react-icons/md";
import { InputGroup } from "@/components/ui/input-group";
import {
  NativeSelectField,
  NativeSelectRoot,
} from "@/components/ui/native-select";

import DataTableCore from "./data-table-core";
import { useParams } from "next/navigation";
import { useTranslation } from "@/i18n/client";

type FilterOption<TValue> = TValue | { label: string; value: TValue };

type DataTableProps<T> = {
  data: T[];
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
  subtitle?: string | React.ReactNode;
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
  subtitle,
}: DataTableProps<T>) {
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [filterValue, setFilterValue] = useState<string | number>("");
  const { lng } = useParams();
  const { t } = useTranslation(lng as string, "data");
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

  return (
    <Box className="bg-white" p={6} rounded={2} mt={12}>
      <Text fontWeight="bold" fontSize="title.md" mb={2}>
        {title}
      </Text>
      {subtitle && (
        <Text fontSize="title.md" mb={4}>
          {subtitle}
        </Text>
      )}

      <Flex mb={4} justifyContent="space-between">
        <Flex gap={2} alignItems="center">
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
            <NativeSelectRoot>
              <NativeSelectField
                placeholder="All"
                value={filterValue}
                onChange={(e) => setFilterValue(e.target.value)}
              >
                {filterOptions.map((option, idx) => {
                  const isObj = isLabelValueOption(option);
                  const value = isObj ? option.value : option;
                  const label = isObj ? option.label : String(option);
                  return (
                    <option key={idx} value={String(value)}>
                      {label}
                    </option>
                  );
                })}
              </NativeSelectField>
            </NativeSelectRoot>
          )}
        </Flex>

        {pagination && (
          <Flex mt={4} gap={2} align="center">
            <Text fontSize="body.md" color="content.tertiary">
              {t("table-pagination", {
                start: (currentPage - 1) * itemsPerPage + 1,
                end: Math.min(filteredData.length, currentPage * itemsPerPage),
                total: filteredData.length,
              })}
            </Text>
            <IconButton
              variant="plain"
              disabled={currentPage === 1}
              onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
            >
              <Icon as={IoIosArrowBack} />
            </IconButton>
            <IconButton
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

      <DataTableCore<T>
        data={paginatedData}
        columns={columns}
        renderRow={renderRow}
        selectable={selectable}
        selectedRowKeys={selectedRowKeys}
        onSelectRow={onSelectRow}
        selectKey={selectKey}
      />
    </Box>
  );
}

export default DataTable;
