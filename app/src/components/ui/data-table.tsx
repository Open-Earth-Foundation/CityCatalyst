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

import { IoIosArrowBack } from "react-icons/io";
import { InputGroup } from "@/components/ui/input-group";
import { MdSearch } from "react-icons/md";

type DataTableProps<T> = {
  data: T[];
  t: Function;
  title: string;
  columns: { header: string; accessor: keyof T | null }[];
  searchable?: boolean;
  pagination?: boolean;
  itemsPerPage?: number;
  filterProperty?: keyof T;
  filterOptions?: Array<T[keyof T]>;
  renderRow: (item: T, index: number) => React.ReactNode;
};

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
}: DataTableProps<T>) {
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [filterValue, setFilterValue] = useState<string | number>("");

  const filteredData = useMemo(() => {
    if (filterValue === "all") return data;
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
                placeholder="Filter"
                value={filterValue}
                onChange={(e) => setFilterValue(e.target.value)}
              >
                <option value="all">{t("all")}</option>
                {filterOptions.map((option, idx) => (
                  <option
                    className="!capitalize"
                    key={idx}
                    value={String(option)}
                  >
                    {String(option)}
                  </option>
                ))}
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
          {paginatedData.map((item, idx) => renderRow(item, idx))}
        </Table.Body>
      </Table.Root>
    </Box>
  );
}

export default DataTable;
