import React, { useMemo, useState } from "react";
import { ButtonSmall } from "@/components/Texts/Button";
import {
  CellProps,
  Column,
  Row,
  TableInstance,
  useExpanded,
  useTable,
} from "react-table";
import {
  GetUserCityInvitesResponse,
  GetUserCityInvitesResponseUserData,
} from "@/util/types";
import { MdChevronLeft, MdChevronRight, MdOutlineMode } from "react-icons/md";
import {
  HiMiniChevronDown,
  HiMiniChevronRight,
  HiMiniChevronLeft,
} from "react-icons/hi2";
import { Button, IconButton, Icon } from "@chakra-ui/react";
import ManageUsersSubTable from "./ManageUsersSubTable";
import type { TFunction } from "i18next";
import UpdateUserModal from "@/components/Modals/update-user-modal";
import { Toaster } from "@chakra-ui/react";

interface GroupedInvites {
  name: string;
  email: string;
  invites: GetUserCityInvitesResponse[];
}

interface ExtendedRow<D extends object> extends Row<D> {
  isExpanded: boolean;
  getToggleRowExpandedProps: () => any;
}

const ManageUsersTable = ({
  cityInvites,
  t,
}: {
  cityInvites: GetUserCityInvitesResponse[];
  t: TFunction;
}) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedUser, setSelectedUser] =
    useState<GetUserCityInvitesResponseUserData | null>(null);
  const [currentPage, setCurrentPage] = useState(0);
  const itemsPerPage = 10;

  const handleEditClick = (
    row: Row<{
      name: string;
      email: string;
      invites: GetUserCityInvitesResponse[];
    }>,
  ) => {
    const user = row.original.invites[0].user;
    if (user) {
      setSelectedUser(user);
      setIsModalOpen(true);
    }
  };
  const data = useMemo(() => {
    const grouped = cityInvites.reduce(
      (acc, invite) => {
        const { email, id } = invite;
        if (!acc[email]) {
          acc[email] = {
            id,
            name: invite.user?.name || email,
            email,
            invites: [],
          };
        }
        acc[email].invites.push(invite);
        return acc;
      },
      {} as Record<
        string,
        {
          id: string;
          name: string;
          email: string;
          invites: GetUserCityInvitesResponse[];
        }
      >,
    );

    return Object.values(grouped);
  }, [cityInvites]);

  const paginatedData = useMemo(() => {
    const startIndex = currentPage * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    return data.slice(startIndex, endIndex);
  }, [data, currentPage, itemsPerPage]);

  const columns: Column<{
    name: string;
    email: string;
    invites: GetUserCityInvitesResponse[];
  }>[] = useMemo(
    () => [
      {
        Header: "",
        id: "expander",
        width: "40px",
        Cell: ({
          row,
        }: CellProps<{
          name: string;
          email: string;
          invites: GetUserCityInvitesResponse[];
        }>) => (
          <span
            {...(
              row as ExtendedRow<GroupedInvites>
            ).getToggleRowExpandedProps()}
          >
            {(row as ExtendedRow<GroupedInvites>).isExpanded ? (
              <Icon as={HiMiniChevronDown} color="interactive.control" />
            ) : (
              <Icon as={HiMiniChevronRight} color="interactive.control" />
            )}
          </span>
        ),
      },
      {
        Header: () => (
          <ButtonSmall textTransform="uppercase" textAlign="left">
            {t("name")}
          </ButtonSmall>
        ),
        accessor: "name",
        width: "33.33%",
        id: "name",
      },
      {
        Header: () => (
          <ButtonSmall textTransform="uppercase" textAlign="left">
            {t("Email")}
          </ButtonSmall>
        ),
        accessor: "email",
        width: "33.33%",
        id: "email",
      },
      {
        id: "cityCount",
        Header: () => (
          <ButtonSmall textTransform="uppercase" textAlign="left">
            {t("number-of-cities")}
          </ButtonSmall>
        ),
        accessor: (row) => row.invites.length,
        width: "33.33%",
      },
      {
        Header: "",
        id: "edit",
        width: "40px",
        Cell: ({ row }) => (
          <IconButton
            onClick={() => handleEditClick(row)}
            aria-label="edit"
            variant="ghost"
            color="content.tertiary"
          >
            <Icon as={MdOutlineMode} color="interactive.control" size="lg" />
          </IconButton>
        ),
      },
    ],
    [t],
  );

  const renderRowSubComponent = React.useCallback(
    ({ row }: { row: ExtendedRow<GroupedInvites> }) => (
      <ManageUsersSubTable invites={row.original.invites} t={t} />
    ),
    [t],
  );

  const { getTableProps, getTableBodyProps, headerGroups, rows, prepareRow } =
    useTable(
      { columns, data: paginatedData },
      useExpanded,
    ) as TableInstance<GroupedInvites>;

  return (
    <>
      <table {...getTableProps()} style={{ width: "100%" }}>
        <thead>
          {headerGroups.map((headerGroup) => (
            <tr {...headerGroup.getHeaderGroupProps()} key={headerGroup.id}>
              {headerGroup.headers.map((column) => (
                <th
                  {...column.getHeaderProps()}
                  key={column.id}
                  style={{
                    padding: "8px",
                    textAlign: "left",
                    width: column.width,
                  }}
                >
                  {column.render("Header")}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody {...getTableBodyProps()}>
          {rows.map((row) => {
            prepareRow(row);
            return (
              <React.Fragment key={row.id}>
                <tr {...row.getRowProps()}>
                  {row.cells.map((cell) => (
                    <td
                      {...cell.getCellProps()}
                      key={cell.column.id}
                      style={{
                        padding: "8px",
                        textAlign: ["edit", "expander"].includes(cell.column.id)
                          ? "center"
                          : "left",
                        width: cell.column.width,
                      }}
                    >
                      {cell.render("Cell")}
                    </td>
                  ))}
                </tr>
                {(row as ExtendedRow<GroupedInvites>).isExpanded ? (
                  <tr>
                    <td colSpan={columns.length}>
                      {renderRowSubComponent({
                        row: row as ExtendedRow<GroupedInvites>,
                      })}
                    </td>
                  </tr>
                ) : null}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginTop: "16px",
        }}
      >
        <Button
          variant="ghost"
          h="24px"
          w="24px"
          onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 0))}
          disabled={currentPage === 0}
        >
          <Icon
            as={MdChevronLeft}
            h="24px"
            w="24px"
            color="background.overlay"
          />
        </Button>
        <span>
          {currentPage + 1}/{Math.ceil(data.length / itemsPerPage)}
        </span>
        <Button
          variant="ghost"
          h="24px"
          w="24px"
          onClick={() =>
            setCurrentPage((prev) =>
              (prev + 1) * itemsPerPage < data.length ? prev + 1 : prev,
            )
          }
          disabled={(currentPage + 1) * itemsPerPage >= data.length}
        >
          <Icon
            as={MdChevronRight}
            h="24px"
            w="24px"
            color="background.overlay"
          />
        </Button>
      </div>
      {selectedUser && (
        <UpdateUserModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          userData={selectedUser}
          t={t}
        />
      )}
    </>
  );
};

export default ManageUsersTable;
