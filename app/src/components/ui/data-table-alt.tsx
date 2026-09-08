"use client";

import React, { useMemo, useState } from "react";
import {
  Box,
  Flex,
  HStack,
  Icon,
  IconButton,
  Input,
  Table,
  Text,
} from "@chakra-ui/react";
import { IoIosArrowBack } from "react-icons/io";
import { MdSearch } from "react-icons/md";
import { InputGroup } from "@/components/ui/input-group";
import {
  NativeSelectField,
  NativeSelectRoot,
} from "@/components/ui/native-select";
import { useParams } from "next/navigation";
import { useTranslation } from "@/i18n/client";

type FilterOption<TValue> = TValue | { label: string; value: TValue };

type DataTableAltProps<T> = {
  data: T[];
  title?: string;
  columns: { header: string; accessor: keyof T | null; width?: string }[];
  searchable?: boolean;
  pagination?: boolean;
  itemsPerPage?: number;
  filterProperty?: keyof T;
  filterOptions?: FilterOption<T[keyof T]>[];
  renderRow: (item: T, index: number) => React.ReactNode;
  searchPlaceholder?: string;
  /** Max height for the scrollable table body */
  maxHeight?: string | number;
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

/**
 * Alternate data table layout for Account Settings.
 * Title, search, filter, and pagination sit on one toolbar row;
 * the table body scrolls independently with truncated cell content.
 */
function DataTableAlt<T extends object>({
  data,
  title,
  columns,
  searchable = false,
  pagination = false,
  itemsPerPage = 50,
  filterProperty,
  filterOptions = [],
  renderRow,
  searchPlaceholder,
  maxHeight = "480px",
}: DataTableAltProps<T>) {
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

  // Reset to first page when search/filter changes
  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    setCurrentPage(1);
  };

  const handleFilterChange = (value: string) => {
    setFilterValue(value);
    setCurrentPage(1);
  };

  return (
    <Box w="full" display="flex" flexDirection="column" gap={4}>
      <Flex
        alignItems="center"
        justifyContent="space-between"
        gap={4}
        flexWrap="wrap"
        w="full"
      >
        <HStack w="full" alignItems="end">
          <HStack
            justifyContent="space-between"
            w="full"
            flexDir="column"
            alignItems="flex-start"
            gap="24px"
          >
            {title && (
              <Text
                fontWeight="bold"
                fontSize="title.md"
                color="content.primary"
                whiteSpace="nowrap"
              >
                {title}
              </Text>
            )}
            <Flex gap={3} alignItems="center" flex="1" minW="0">
              {searchable && (
                <InputGroup
                  flex="1"
                  gap="8px"
                  maxW="420px"
                  startElement={
                    <Icon as={MdSearch} color="content.tertiary" boxSize={5} />
                  }
                >
                  <Input
                    placeholder={searchPlaceholder ?? t("search-records")}
                    value={searchQuery}
                    onChange={(e) => handleSearchChange(e.target.value)}
                    borderRadius="4px"
                    border="1px solid"
                    borderColor="border.neutral"
                    bg="background.default"
                    size="lg"
                    fontFamily="body"
                    w="365px"
                    _placeholder={{ color: "content.tertiary" }}
                    shadow="sm"
                  />
                </InputGroup>
              )}

              {filterProperty && filterOptions.length > 0 && (
                <NativeSelectRoot w="auto" size="lg">
                  <NativeSelectField
                    placeholder={t("all")}
                    value={filterValue}
                    onChange={(e) => handleFilterChange(e.target.value)}
                    borderRadius="4px"
                    borderColor="border.neutral"
                    shadow="sm"
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
          </HStack>
          {pagination && (
            <Flex
              gap={1}
              align="center"
              whiteSpace="nowrap"
              ml="auto"
              top="-5px"
              position="relative"
            >
              <Text fontSize="body.md" color="content.tertiary">
                {filteredData.length === 0
                  ? t("table-pagination", { start: 0, end: 0, total: 0 })
                  : t("table-pagination", {
                      start: (currentPage - 1) * itemsPerPage + 1,
                      end: Math.min(
                        filteredData.length,
                        currentPage * itemsPerPage,
                      ),
                      total: filteredData.length,
                    })}
              </Text>
              <IconButton
                variant="ghost"
                size="sm"
                aria-label="Previous page"
                disabled={currentPage === 1}
                color={
                  currentPage === 1
                    ? "background.overlay"
                    : "interactive.control"
                }
                onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
              >
                <Icon as={IoIosArrowBack} />
              </IconButton>
              <IconButton
                variant="ghost"
                size="sm"
                color="interactive.control"
                aria-label="Next page"
                disabled={
                  currentPage === totalPages || filteredData.length === 0
                }
                onClick={() =>
                  setCurrentPage((prev) => Math.min(prev + 1, totalPages))
                }
              >
                <Icon as={IoIosArrowBack} rotate="180deg" />
              </IconButton>
            </Flex>
          )}
        </HStack>
      </Flex>

      <Box
        w="full"
        borderRadius="8px"
        borderWidth="1px"
        borderColor="border.overlay"
        bg="background.backgroundLight"
        overflow="hidden"
      >
        <Box maxH={maxHeight} overflowY="auto" w="full">
          <Table.Root px={0} w="full" variant="outline">
            <Table.Header position="sticky" top={0} zIndex={1}>
              <Table.Row>
                {columns.map((col) => (
                  <Table.ColumnHeader
                    key={String(col.accessor ?? col.header)}
                    truncate
                    fontWeight="bold"
                    fontFamily="heading"
                    textTransform="uppercase"
                    fontSize="body.sm"
                    color="content.secondary"
                    letterSpacing="widest"
                    w={col.width}
                    maxW={col.width}
                  >
                    {col.header}
                  </Table.ColumnHeader>
                ))}
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {paginatedData.length === 0 && (
                <Table.Row>
                  <Table.Cell colSpan={columns.length}>
                    <Text fontSize="body.md" color="content.tertiary" py={4}>
                      {t("no-data")}
                    </Text>
                  </Table.Cell>
                </Table.Row>
              )}
              {paginatedData.map((item, idx) => renderRow(item, idx))}
            </Table.Body>
          </Table.Root>
        </Box>
      </Box>
    </Box>
  );
}

export default DataTableAlt;
