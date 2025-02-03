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
import { MdOutlineMode } from "react-icons/md";
import { ChevronDownIcon, ChevronRightIcon } from "@chakra-ui/icons";
import { IconButton, useTheme } from "@chakra-ui/react";
import ManageUsersSubTable from "./ManageUsersSubTable";
import type { TFunction } from "i18next";
import UpdateUserModal from "@/components/Modals/update-user-modal";

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
  const theme = useTheme();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedUser, setSelectedUser] =
    useState<GetUserCityInvitesResponseUserData | null>(null);
  const handleEditClick = (
    cell: Row<{
      name: string;
      email: string;
      invites: GetUserCityInvitesResponse[];
    }>,
  ) => {
    const user = cell.original.invites[0].user;
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
              <ChevronDownIcon color={theme.colors.interactive.control} />
            ) : (
              <ChevronRightIcon color={theme.colors.interactive.control} />
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
            icon={
              <MdOutlineMode
                color={theme.colors.interactive.control}
                size={"18px"}
              />
            }
            aria-label="edit"
            variant="ghost"
            color="content.tertiary"
          />
        ),
      },
    ],
    [theme],
  );

  const renderRowSubComponent = React.useCallback(
    ({ row }: { row: ExtendedRow<GroupedInvites> }) => (
      <ManageUsersSubTable invites={row.original.invites} theme={theme} t={t} />
    ),
    [theme],
  );

  const { getTableProps, getTableBodyProps, headerGroups, rows, prepareRow } =
    useTable({ columns, data }, useExpanded) as TableInstance<GroupedInvites>;

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
