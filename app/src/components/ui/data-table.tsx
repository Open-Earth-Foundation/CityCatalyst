import React, { useMemo, useState } from "react";
import { Box, Button, Flex, Input, Table } from "@chakra-ui/react";

type DataTableProps<T> = {
  data: T[];
  title: string;
  columns: { header: string; accessor: keyof T }[];
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
    <Box>
      <Flex mb={4} gap={2}>
        {searchable && (
          <Input
            placeholder="Search..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        )}

        {/*{filterProperty && filterOptions.length > 0 && (*/}
        {/*  <Select*/}
        {/*    placeholder="Filter"*/}
        {/*    value={filterValue}*/}
        {/*    onChange={(e) => setFilterValue(e.target.value)}*/}
        {/*  >*/}
        {/*    {filterOptions.map((option, idx) => (*/}
        {/*      <option key={idx} value={String(option)}>*/}
        {/*        {String(option)}*/}
        {/*      </option>*/}
        {/*    ))}*/}
        {/*  </Select>*/}
        {/*)}*/}
      </Flex>

      <Table.Root variant="outline" overflowX="scroll" borderWidth="1px">
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
          {paginatedData.map((item, idx) => renderRow(item, idx))}
        </Table.Body>
      </Table.Root>

      {pagination && (
        <Flex mt={4} justify="space-between" align="center">
          <Button
            disabled={currentPage === 1}
            onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
          >
            Previous
          </Button>
          <Box>
            Page {currentPage} of {totalPages}
          </Box>
          <Button
            disabled={currentPage === totalPages}
            onClick={() =>
              setCurrentPage((prev) => Math.min(prev + 1, totalPages))
            }
          >
            Next
          </Button>
        </Flex>
      )}
    </Box>
  );
}

export default DataTable;
