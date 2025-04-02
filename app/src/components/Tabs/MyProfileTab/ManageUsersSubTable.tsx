import React, { useMemo, useState, useCallback, useEffect } from "react";
import { ButtonSmall } from "@/components/Texts/Button";
import { Column, Row, useTable } from "react-table";
import { InviteStatus, GetUserCityInvitesResponse } from "@/util/types";
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
  const [resetUserInvite, { isLoading, error, isSuccess, isError, reset }] =
    api.useResetInviteMutation();

  const { showSuccessToast } = UseSuccessToast({
    description: t("invite-sent"),
    title: t("invite-sent"),
  });

  const { showErrorToast } = UseErrorToast({
    description: t("invite-send-fail"),
    title: t("invite-send-fail"),
  });

  useEffect(() => {
    if (isSuccess) {
      showSuccessToast();
      reset();
    }
    if (isError) {
      showErrorToast();
      reset();
    }
  }, [isSuccess, isError, showSuccessToast, showErrorToast, reset]);

  const handleDeleteClick = useCallback(
    (row: Row<GetUserCityInvitesResponse>) => {
      setSelectedRowId(row.original.id);
      setIsModalOpen(true);
    },
    [],
  );

  const handleResetClick = useCallback(
    (row: Row<GetUserCityInvitesResponse>) => {
      setSelectedRowId(row.original.id);
      resetUserInvite({ cityInviteId: row.original.id });
    },
    [resetUserInvite],
  );

  const getTextAndBorderColor = useCallback((value: InviteStatus) => {
    switch (value) {
      case InviteStatus.ACCEPTED:
        return "sentiment.positiveDefault";
      case InviteStatus.PENDING:
        return "sentiment.warningDefault";
      default:
        return "interactive.control";
    }
  }, []);

  const getBackgroundColor = (value: InviteStatus) => {
    switch (value) {
      case InviteStatus.ACCEPTED:
        return "sentiment.positiveOverlay";
      case InviteStatus.PENDING:
        return "sentiment.warningOverlay";
      default:
        return "background.neutral";
    }
  };

  const subTableColumns: Column<GetUserCityInvitesResponse>[] = useMemo(() => {
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
            {t("city-name")}
          </ButtonSmall>
        ),
        accessor: (row) => row.cityInvites.name,
        width: "33.33%",
        id: "cityName",
      },
      {
        Header: () => (
          <ButtonSmall textTransform="uppercase" textAlign="left">
            {t("status")}
          </ButtonSmall>
        ),
        accessor: "status",
        width: "33.33%",
        id: "status",
        Cell: ({ value }) => (
          <Badge
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
          row.original.status === InviteStatus.EXPIRED ? (
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
  }, [getTextAndBorderColor, handleDeleteClick, handleResetClick, t]);

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
