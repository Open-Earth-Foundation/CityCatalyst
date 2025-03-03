import React, { useMemo, useState } from "react";
import { ButtonSmall } from "@/components/Texts/Button";
import { Column, Row, useTable } from "react-table";
import { CityInviteStatus, GetUserCityInvitesResponse } from "@/util/types";
import { MdOutlineDelete, MdOutlineReplay } from "react-icons/md";
import { HiMiniChevronDown } from "react-icons/hi2";
import { Badge, IconButton, Icon } from "@chakra-ui/react";
import DeleteUserModal from "@/components/Modals/delete-user-modal";
import type { TFunction } from "i18next";
import { api } from "@/services/api";
import { UseErrorToast, UseSuccessToast } from "@/hooks/Toasts";

const ManageUsersSubTable = React.memo(function SubTable({
  invites,
  t,
}: {
  invites: GetUserCityInvitesResponse[];
  t: TFunction;
}) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedRowId, setSelectedRowId] = useState<string | null>(null);
  const [resetUserInvite, { isLoading, error }] = api.useResetInviteMutation();

  const { showSuccessToast } = UseSuccessToast({
    description: t("invite-sent"),
    title: t("invite-sent"),
  });

  const { showErrorToast } = UseErrorToast({
    description: t("invite-send-fail"),
    title: t("invite-send-fail"),
  });

  const subTableColumns: Column<GetUserCityInvitesResponse>[] = useMemo(() => {
    const handleDeleteClick = (row: Row<GetUserCityInvitesResponse>) => {
      setSelectedRowId(row.original.id);
      setIsModalOpen(true);
    };

    const handleResetClick = (row: Row<GetUserCityInvitesResponse>) => {
      setSelectedRowId(row.original.id);
      resetUserInvite({ cityInviteId: row.original.id });
      if (error) {
        showErrorToast();
      } else {
        showSuccessToast();
      }
    };

    const getTextAndBorderColor = (value: CityInviteStatus) => {
      switch (value) {
        case CityInviteStatus.ACCEPTED:
          return "sentiment.positiveDefault";
        case CityInviteStatus.PENDING:
          return "sentiment.warningDefault";
        default:
          return "interactive.control";
      }
    };

    const getBackgroundColor = (value: CityInviteStatus) => {
      switch (value) {
        case CityInviteStatus.ACCEPTED:
          return "sentiment.positiveOverlay";
        case CityInviteStatus.PENDING:
          return "sentiment.warningOverlay";
        default:
          return "background.neutral";
      }
    };
    return [
      {
        Header: () => (
          <Icon as={HiMiniChevronDown} color="background.alternativeLight" />
        ),
        id: "spacer",
        accessor: () => {},
      },
      {
        Header: () => (
          <ButtonSmall textTransform="uppercase" textAlign="left">
            City Name
          </ButtonSmall>
        ),
        accessor: (row) => row.cityInvites.name,
        width: "33.33%",
        id: "cityName",
      },
      {
        Header: () => (
          <ButtonSmall textTransform="uppercase" textAlign="left">
            Status
          </ButtonSmall>
        ),
        accessor: "status",
        width: "33.33%",
        id: "status",
        Cell: ({ value }) => (
          <Badge
            borderRadius="full"
            px="16px"
            paddingTop="4px"
            paddingBottom="4px"
            borderWidth="1px"
            borderStyle="solid"
            fontWeight="normal"
            textTransform="capitalize"
            letterSpacing="wide"
            fontSize="body.md"
            borderColor={getTextAndBorderColor(value)}
            color={getTextAndBorderColor(value)}
            backgroundColor={getBackgroundColor(value)}
          >
            {value}
          </Badge>
        ),
      },
      {
        Header: "",
        id: "spacer2",
        width: "33.33%",
      },
      {
        Header: "",
        id: "actions",
        width: "40px",
        Cell: ({ row }) =>
          row.original.status === CityInviteStatus.EXPIRED ? (
            <IconButton
              onClick={() => handleResetClick(row)}
              aria-label="edit"
              variant="ghost"
              color="content.tertiary"
            >
              <Icon
                as={MdOutlineReplay}
                color="interactive.control"
                size="lg"
              />
            </IconButton>
          ) : (
            <IconButton
              onClick={() => handleDeleteClick(row)}
              aria-label="edit"
              variant="ghost"
              color="content.tertiary"
            >
              <Icon
                as={MdOutlineDelete}
                color="sentiment.negativeDefault"
                size="lg"
              />
            </IconButton>
          ),
      },
    ];
  }, [error, resetUserInvite, showErrorToast, showSuccessToast]);

  const { getTableProps, getTableBodyProps, headerGroups, rows, prepareRow } =
    useTable({
      columns: subTableColumns,
      data: invites,
    });

  return (
    <>
      <table
        {...getTableProps()}
        style={{
          width: "100%",
          backgroundColor: "background.alternativeLight",
        }}
      >
        <thead>
          {headerGroups.map((headerGroup) => (
            <tr {...headerGroup.getHeaderGroupProps()} key={headerGroup.id}>
              {headerGroup.headers.map((column) => (
                <th
                  {...column.getHeaderProps()}
                  key={column.id}
                  style={{
                    backgroundColor: "background.alternativeLight",
                    borderTop: "1px solid border.overlay",
                    borderBottom: "1px solid border.overlay",
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
          {rows.map((subRow) => {
            prepareRow(subRow);
            return (
              <tr {...subRow.getRowProps()} key={subRow.id}>
                {subRow.cells.map((cell) => (
                  <td
                    {...cell.getCellProps()}
                    key={cell.column.id}
                    style={{
                      borderTop: "1px solid border.overlay",
                      borderBottom: "1px solid border.overlay",
                      padding: "8px",
                      textAlign:
                        cell.column.id === "actions" ? "center" : "left",
                      width: cell.column.width,
                    }}
                  >
                    {cell.render("Cell")}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
      {selectedRowId && (
        <DeleteUserModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          cityInviteId={selectedRowId}
          t={t}
        />
      )}
    </>
  );
});

export default ManageUsersSubTable;
