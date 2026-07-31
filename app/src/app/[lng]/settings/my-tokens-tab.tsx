"use client";

import {
  Box,
  Icon,
  IconButton,
  Table,
  Tabs,
  Text,
  HStack,
  VStack,
} from "@chakra-ui/react";
import React, { FC, useState } from "react";
import {
  MdContentCopy,
  MdDelete,
  MdAdd,
  MdVisibility,
  MdVisibilityOff,
  MdApartment,
} from "react-icons/md";
import { Toaster, toaster } from "@/components/ui/toaster";
import { useTranslation } from "@/i18n/client";
import { HeadlineSmall } from "@/components/package/Texts/Headline";
import { BodyLarge, BodyMedium } from "@/components/package/Texts/Body";
import ProgressLoader from "@/components/ProgressLoader";
import {
  useGetPersonalAccessTokensQuery,
  useCreatePersonalAccessTokenMutation,
  useDeletePersonalAccessTokenMutation,
} from "@/services/api";
import {
  DialogRoot,
  DialogContent,
  DialogHeader,
  DialogBody,
  DialogFooter,
  DialogCloseTrigger,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import DataTableCore from "@/components/ui/data-table-core";
import type { PersonalAccessToken } from "@/util/types";
import CreateTokenForm from "./CreateTokenForm";

interface MyTokensTabProps {
  lng: string;
}

const MyTokensTab: FC<MyTokensTabProps> = ({ lng }) => {
  const { t } = useTranslation(lng, "settings");

  const {
    data: tokens,
    isLoading: isTokensLoading,
    error,
  } = useGetPersonalAccessTokensQuery();

  const [createToken, { isLoading: isCreating }] =
    useCreatePersonalAccessTokenMutation();
  const [deleteToken, { isLoading: isDeleting }] =
    useDeletePersonalAccessTokenMutation();

  const [isCreateFormOpen, setIsCreateFormOpen] = useState(false);
  const [isTokenDisplayModalOpen, setIsTokenDisplayModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [tokenToDelete, setTokenToDelete] =
    useState<PersonalAccessToken | null>(null);

  const [tokenName, setTokenName] = useState("");
  const [expiresIn, setExpiresIn] = useState<string>("90");

  const [createdToken, setCreatedToken] = useState<string | null>(null);
  const [showToken, setShowToken] = useState(false);

  const resetCreateForm = () => {
    setTokenName("");
    setExpiresIn("90");
    setIsCreateFormOpen(false);
  };

  const handleCreateToken = async () => {
    if (!tokenName.trim()) {
      toaster.create({
        description: t("token-name-required"),
        type: "error",
        duration: 3000,
      });
      return;
    }

    try {
      let expiresAt: string | null = null;
      if (expiresIn && expiresIn !== "never") {
        const days = parseInt(expiresIn, 10);
        const date = new Date();
        date.setDate(date.getDate() + days);
        expiresAt = date.toISOString();
      }

      const result = await createToken({
        name: tokenName.trim(),
        scopes: ["read"],
        expiresAt,
      }).unwrap();

      setCreatedToken(result.token);
      resetCreateForm();
      setIsTokenDisplayModalOpen(true);

      toaster.create({
        description: t("token-created-success"),
        type: "success",
        duration: 3000,
      });
    } catch {
      toaster.create({
        description: t("token-create-error"),
        type: "error",
        duration: 3000,
      });
    }
  };

  const handleDeleteToken = async () => {
    if (!tokenToDelete) return;

    try {
      await deleteToken(tokenToDelete.id).unwrap();
      toaster.create({
        description: t("token-deleted-success"),
        type: "success",
        duration: 3000,
      });
      setIsDeleteModalOpen(false);
      setTokenToDelete(null);
    } catch {
      toaster.create({
        description: t("token-delete-error"),
        type: "error",
        duration: 3000,
      });
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toaster.create({
      description: t("copied-to-clipboard"),
      type: "success",
      duration: 2000,
    });
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return t("never");
    return new Date(dateString).toLocaleDateString();
  };

  const formatScopes = (scopes: string[]) => scopes.join(", ");

  const hasTokens = !!tokens && tokens.length > 0;
  const showCreateButton = !isTokensLoading && !isCreateFormOpen;

  return (
    <>
      <Tabs.Content value="my-tokens">
        <Box display="flex" flexDirection="column" gap="48px" marginTop="32px">
          <Box
            display="flex"
            justifyContent="space-between"
            alignItems="center"
          >
            <Box>
              <HeadlineSmall text={t("api-tokens")} />
              <BodyLarge text={t("api-tokens-description")} />
            </Box>
            {showCreateButton && !hasTokens && (
              <Button onClick={() => setIsCreateFormOpen(true)} h="48px">
                <Icon as={MdAdd} boxSize={5} mr="8px" />
                {t("create-token")}
              </Button>
            )}
          </Box>

          {isTokensLoading ? (
            <ProgressLoader />
          ) : error ? (
            <Box>{t("tokens-error-loading")}</Box>
          ) : isCreateFormOpen ? (
            <CreateTokenForm
              t={t}
              tokenName={tokenName}
              onTokenNameChange={setTokenName}
              expiresIn={expiresIn}
              onExpiresInChange={setExpiresIn}
              onCancel={resetCreateForm}
              onSubmit={handleCreateToken}
              isSubmitting={isCreating}
            />
          ) : !hasTokens ? (
            <Box
              p="48px"
              textAlign="center"
              borderWidth="1px"
              borderStyle="dashed"
              borderColor="border.neutral"
              borderRadius="12px"
            >
              <Icon
                as={MdApartment}
                boxSize={20}
                color="background.neutral"
                mb="8px"
              />
              <Text
                fontWeight="bold"
                fontSize="title.md"
                color="content.secondary"
              >
                {t("no-tokens")}
              </Text>
              <Text
                fontSize="body.md"
                letterSpacing="wide"
                fontFamily="body"
                color="interactive.control"
              >
                {t("no-tokens-description")}
              </Text>
            </Box>
          ) : (
            <Box bg="white" p={6} borderRadius="8px">
              <Box
                display="flex"
                justifyContent="space-between"
                alignItems="center"
                mb="16px"
              >
                <Text
                  fontWeight="bold"
                  fontSize="title.md"
                  color="content.secondary"
                >
                  {t("all-tokens")} ({tokens.length})
                </Text>
                {showCreateButton && (
                  <Button
                    onClick={() => setIsCreateFormOpen(true)}
                    variant="outline"
                    h="48px"
                  >
                    <Icon as={MdAdd} boxSize={5} mr="8px" />
                    {t("add")}
                  </Button>
                )}
              </Box>

              <DataTableCore<PersonalAccessToken>
                data={tokens}
                columns={[
                  { header: t("token-name"), accessor: "name" },
                  { header: t("token-prefix"), accessor: "tokenPrefix" },
                  { header: t("scopes"), accessor: "scopes" },
                  { header: t("expires"), accessor: "expiresAt" },
                  { header: t("last-used"), accessor: "lastUsedAt" },
                  { header: t("created"), accessor: "created" },
                  { header: "", accessor: null },
                ]}
                renderRow={(token: PersonalAccessToken, idx: number) => (
                  <Table.Row key={token.id || idx}>
                    <Table.Cell>
                      <Text fontWeight="medium">{token.name}</Text>
                    </Table.Cell>
                    <Table.Cell>
                      <Text fontFamily="mono" color="content.secondary">
                        {token.tokenPrefix}...
                      </Text>
                    </Table.Cell>
                    <Table.Cell>
                      <Text color="content.secondary">
                        {formatScopes(token.scopes)}
                      </Text>
                    </Table.Cell>
                    <Table.Cell>
                      <Text color="content.secondary">
                        {formatDate(token.expiresAt)}
                      </Text>
                    </Table.Cell>
                    <Table.Cell>
                      <Text color="content.secondary">
                        {formatDate(token.lastUsedAt)}
                      </Text>
                    </Table.Cell>
                    <Table.Cell>
                      <Text color="content.secondary">
                        {formatDate(token.created)}
                      </Text>
                    </Table.Cell>
                    <Table.Cell>
                      <IconButton
                        aria-label="Delete token"
                        variant="ghost"
                        color="sentiment.negativeDefault"
                        onClick={() => {
                          setTokenToDelete(token);
                          setIsDeleteModalOpen(true);
                        }}
                      >
                        <Icon as={MdDelete} boxSize={5} />
                      </IconButton>
                    </Table.Cell>
                  </Table.Row>
                )}
              />
            </Box>
          )}
        </Box>
      </Tabs.Content>

      {/* Token Display Modal (shown after creation) */}
      <DialogRoot
        open={isTokenDisplayModalOpen}
        onOpenChange={(e) => {
          if (!e.open) {
            setCreatedToken(null);
            setShowToken(false);
          }
          setIsTokenDisplayModalOpen(e.open);
        }}
      >
        <DialogContent minW="550px">
          <DialogHeader>
            <DialogTitle>{t("token-created")}</DialogTitle>
          </DialogHeader>
          <DialogCloseTrigger />
          <DialogBody>
            <VStack gap="16px" align="stretch">
              <Box
                p="16px"
                bg="sentiment.warningLight"
                borderRadius="8px"
                borderWidth="1px"
                borderColor="sentiment.warningDefault"
              >
                <BodyMedium text={t("token-copy-warning")} />
              </Box>

              <Field label={t("your-token")}>
                <Box
                  p="16px"
                  bg="background.neutral"
                  borderRadius="8px"
                  fontFamily="mono"
                  fontSize="body.sm"
                  wordBreak="break-all"
                  w="full"
                >
                  <HStack justify="space-between" align="center" w="full">
                    <Text flex="1">
                      {showToken ? createdToken : "•".repeat(40)}
                    </Text>
                    <HStack flexShrink={0}>
                      <IconButton
                        aria-label="Toggle visibility"
                        variant="ghost"
                        size="sm"
                        onClick={() => setShowToken(!showToken)}
                      >
                        <Icon as={showToken ? MdVisibilityOff : MdVisibility} />
                      </IconButton>
                      <IconButton
                        aria-label="Copy token"
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          createdToken && copyToClipboard(createdToken)
                        }
                      >
                        <Icon as={MdContentCopy} />
                      </IconButton>
                    </HStack>
                  </HStack>
                </Box>
              </Field>

              <Field label={t("mcp-usage-example")}>
                <Box
                  p="16px"
                  bg="background.neutral"
                  borderRadius="8px"
                  fontFamily="mono"
                  fontSize="body.xs"
                  whiteSpace="pre-wrap"
                  w="full"
                  position="relative"
                >
                  <IconButton
                    aria-label="Copy config"
                    variant="ghost"
                    size="sm"
                    position="absolute"
                    top="8px"
                    right="8px"
                    onClick={() =>
                      copyToClipboard(`{
  "mcpServers": {
    "citycatalyst": {
      "command": "npx",
      "args": [
        "-y",
        "mcp-remote",
        "${typeof window !== "undefined" ? window.location.origin : ""}/api/v1/mcp",
        "--header",
        "Authorization: Bearer ${createdToken}"
      ]
    }
  }
}`)
                    }
                  >
                    <Icon as={MdContentCopy} />
                  </IconButton>
                  <Text color="content.secondary">
                    {`{
  "mcpServers": {
    "citycatalyst": {
      "command": "npx",
      "args": [
        "-y",
        "mcp-remote",
        "${typeof window !== "undefined" ? window.location.origin : ""}/api/v1/mcp",
        "--header",
        "Authorization: Bearer <your-token>"
      ]
    }
  }
}`}
                  </Text>
                </Box>
              </Field>
            </VStack>
          </DialogBody>
          <DialogFooter>
            <Button h="48px" onClick={() => setIsTokenDisplayModalOpen(false)}>
              {t("done")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </DialogRoot>

      {/* Delete Confirmation Modal */}
      <DialogRoot
        open={isDeleteModalOpen}
        onOpenChange={(e) => setIsDeleteModalOpen(e.open)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("delete-token")}</DialogTitle>
          </DialogHeader>
          <DialogCloseTrigger />
          <DialogBody>
            <Text>
              {t("delete-token-confirmation") ||
                `Are you sure you want to delete the token "${tokenToDelete?.name}"? This action cannot be undone and any applications using this token will lose access.`}
            </Text>
          </DialogBody>
          <DialogFooter>
            <Button
              variant="outline"
              mr="12px"
              h="48px"
              onClick={() => setIsDeleteModalOpen(false)}
            >
              {t("cancel")}
            </Button>
            <Button
              h="48px"
              colorPalette="red"
              onClick={handleDeleteToken}
              loading={isDeleting}
            >
              {t("delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </DialogRoot>

      <Toaster />
    </>
  );
};

export default MyTokensTab;
