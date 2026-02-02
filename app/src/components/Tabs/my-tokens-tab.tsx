"use client";

import {
  Box,
  Button as ChakraButton,
  Icon,
  IconButton,
  Table,
  Tabs,
  Text,
  Input,
  HStack,
  VStack,
} from "@chakra-ui/react";
import React, { FC, useState } from "react";
import { MdContentCopy, MdDelete, MdAdd, MdVisibility, MdVisibilityOff } from "react-icons/md";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Field } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import DataTableCore from "@/components/ui/data-table-core";
import type { PersonalAccessToken } from "@/util/types";

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
  const [deleteToken, { isLoading: isDeleting }] = useDeletePersonalAccessTokenMutation();

  // Modal state
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isTokenDisplayModalOpen, setIsTokenDisplayModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [tokenToDelete, setTokenToDelete] = useState<PersonalAccessToken | null>(null);

  // Form state
  const [tokenName, setTokenName] = useState("");
  const [readScope, setReadScope] = useState(true);
  const [writeScope, setWriteScope] = useState(false);
  const [expiresIn, setExpiresIn] = useState<string>("90"); // days

  // Created token display
  const [createdToken, setCreatedToken] = useState<string | null>(null);
  const [showToken, setShowToken] = useState(false);

  const handleCreateToken = async () => {
    const scopes: string[] = [];
    if (readScope) scopes.push("read");
    if (writeScope) scopes.push("write");

    if (scopes.length === 0) {
      toaster.create({
        description: t("token-scope-required") || "At least one scope is required",
        type: "error",
        duration: 3000,
      });
      return;
    }

    if (!tokenName.trim()) {
      toaster.create({
        description: t("token-name-required") || "Token name is required",
        type: "error",
        duration: 3000,
      });
      return;
    }

    try {
      // Calculate expiration date
      let expiresAt: string | null = null;
      if (expiresIn && expiresIn !== "never") {
        const days = parseInt(expiresIn, 10);
        const date = new Date();
        date.setDate(date.getDate() + days);
        expiresAt = date.toISOString();
      }

      const result = await createToken({
        name: tokenName.trim(),
        scopes,
        expiresAt,
      }).unwrap();

      setCreatedToken(result.token);
      setIsCreateModalOpen(false);
      setIsTokenDisplayModalOpen(true);

      // Reset form
      setTokenName("");
      setReadScope(true);
      setWriteScope(false);
      setExpiresIn("90");

      toaster.create({
        description: t("token-created-success") || "Token created successfully",
        type: "success",
        duration: 3000,
      });
    } catch (err) {
      toaster.create({
        description: t("token-create-error") || "Failed to create token",
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
        description: t("token-deleted-success") || "Token deleted successfully",
        type: "success",
        duration: 3000,
      });
      setIsDeleteModalOpen(false);
      setTokenToDelete(null);
    } catch (err) {
      toaster.create({
        description: t("token-delete-error") || "Failed to delete token",
        type: "error",
        duration: 3000,
      });
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toaster.create({
      description: t("copied-to-clipboard") || "Copied to clipboard",
      type: "success",
      duration: 2000,
    });
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return t("never") || "Never";
    return new Date(dateString).toLocaleDateString();
  };

  const formatScopes = (scopes: string[]) => {
    return scopes.join(", ");
  };

  return (
    <>
      <Tabs.Content value="my-tokens">
        <Box display="flex" flexDirection="column" gap="48px" marginTop="32px">
          <Box display="flex" justifyContent="space-between" alignItems="center">
            <Box>
              <HeadlineSmall text={t("api-tokens") || "API Tokens"} />
              <BodyLarge
                text={
                  t("api-tokens-description") ||
                  "Manage personal access tokens for API and MCP client access"
                }
              />
            </Box>
            {/* Show button here only when no tokens exist */}
            {(!tokens || tokens.length === 0) && !isTokensLoading && (
              <Button
                onClick={() => setIsCreateModalOpen(true)}
                h="48px"
              >
                <Icon as={MdAdd} boxSize={5} mr="8px" />
                {t("create-token") || "Create Token"}
              </Button>
            )}
          </Box>

          {isTokensLoading ? (
            <ProgressLoader />
          ) : error ? (
            <Box>{t("tokens-error-loading") || "Error loading tokens"}</Box>
          ) : !tokens || tokens.length === 0 ? (
            <Box
              p="48px"
              textAlign="center"
              borderWidth="1px"
              borderStyle="dashed"
              borderColor="border.neutral"
              borderRadius="12px"
            >
              <BodyMedium
                text={
                  t("no-tokens") ||
                  "No tokens yet. Create one to get started with API access."
                }
              />
            </Box>
          ) : (
            <Box bg="white" p={6} borderRadius="8px">
              {/* Card header with title and button */}
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
                  {t("all-tokens") || "All Tokens"} ({tokens.length})
                </Text>
                <Button
                  onClick={() => setIsCreateModalOpen(true)}
                  variant="outline"
                  h="48px"
                >
                  <Icon as={MdAdd} boxSize={5} mr="8px" />
                  {t("add") || "Add"}
                </Button>
              </Box>

              {/* Token table using DataTableCore */}
              <DataTableCore<PersonalAccessToken>
                data={tokens}
                columns={[
                  { header: t("name") || "Name", accessor: "name" },
                  { header: t("token-prefix") || "Token", accessor: "tokenPrefix" },
                  { header: t("scopes") || "Scopes", accessor: "scopes" },
                  { header: t("expires") || "Expires", accessor: "expiresAt" },
                  { header: t("last-used") || "Last Used", accessor: "lastUsedAt" },
                  { header: t("created") || "Created", accessor: "created" },
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
                      <Text color="content.secondary">{formatScopes(token.scopes)}</Text>
                    </Table.Cell>
                    <Table.Cell>
                      <Text color="content.secondary">{formatDate(token.expiresAt)}</Text>
                    </Table.Cell>
                    <Table.Cell>
                      <Text color="content.secondary">{formatDate(token.lastUsedAt)}</Text>
                    </Table.Cell>
                    <Table.Cell>
                      <Text color="content.secondary">{formatDate(token.created)}</Text>
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

      {/* Create Token Modal */}
      <DialogRoot
        open={isCreateModalOpen}
        onOpenChange={(e) => setIsCreateModalOpen(e.open)}
      >
        <DialogContent minW="500px">
          <DialogHeader>
            <DialogTitle>{t("create-new-token") || "Create New Token"}</DialogTitle>
          </DialogHeader>
          <DialogCloseTrigger />
          <DialogBody>
            <VStack gap="24px" align="stretch">
              <Field label={t("token-name") || "Token Name"}>
                <Input
                  placeholder={t("token-name-placeholder") || "e.g., MCP Client Token"}
                  value={tokenName}
                  onChange={(e) => setTokenName(e.target.value)}
                />
              </Field>

              <Field label={t("scopes") || "Scopes"}>
                <VStack align="start" gap="12px">
                  <Checkbox
                    checked={readScope}
                    onCheckedChange={(e) => setReadScope(!!e.checked)}
                  >
                    <Text>
                      <Text as="span" fontWeight="medium">{t("scope-read")}</Text>
                      {" - "}
                      {t("read-scope-description") || "Access to read data (GET requests)"}
                    </Text>
                  </Checkbox>
                  <Checkbox
                    checked={writeScope}
                    onCheckedChange={(e) => setWriteScope(!!e.checked)}
                  >
                    <Text>
                      <Text as="span" fontWeight="medium">{t("scope-write")}</Text>
                      {" - "}
                      {t("write-scope-description") || "Access to modify data (POST, PUT, DELETE)"}
                    </Text>
                  </Checkbox>
                </VStack>
              </Field>

              <Field label={t("expiration") || "Expiration"}>
                <HStack gap="12px">
                  <ChakraButton
                    variant={expiresIn === "30" ? "solid" : "outline"}
                    size="sm"
                    onClick={() => setExpiresIn("30")}
                  >
                    30 {t("days") || "days"}
                  </ChakraButton>
                  <ChakraButton
                    variant={expiresIn === "90" ? "solid" : "outline"}
                    size="sm"
                    onClick={() => setExpiresIn("90")}
                  >
                    90 {t("days") || "days"}
                  </ChakraButton>
                  <ChakraButton
                    variant={expiresIn === "365" ? "solid" : "outline"}
                    size="sm"
                    onClick={() => setExpiresIn("365")}
                  >
                    1 {t("year") || "year"}
                  </ChakraButton>
                  <ChakraButton
                    variant={expiresIn === "never" ? "solid" : "outline"}
                    size="sm"
                    onClick={() => setExpiresIn("never")}
                  >
                    {t("never") || "Never"}
                  </ChakraButton>
                </HStack>
              </Field>
            </VStack>
          </DialogBody>
          <DialogFooter>
            <Button
              variant="outline"
              mr="12px"
              h="48px"
              onClick={() => setIsCreateModalOpen(false)}
            >
              {t("cancel") || "Cancel"}
            </Button>
            <Button h="48px" onClick={handleCreateToken} loading={isCreating}>
              {t("create") || "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </DialogRoot>

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
            <DialogTitle>{t("token-created") || "Token Created"}</DialogTitle>
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
                <BodyMedium
                  text={
                    t("token-copy-warning") ||
                    "Make sure to copy your token now. You won't be able to see it again!"
                  }
                />
              </Box>

              <Field label={t("your-token") || "Your Token"}>
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
                        onClick={() => createdToken && copyToClipboard(createdToken)}
                      >
                        <Icon as={MdContentCopy} />
                      </IconButton>
                    </HStack>
                  </HStack>
                </Box>
              </Field>
            </VStack>
          </DialogBody>
          <DialogFooter>
            <Button h="48px" onClick={() => setIsTokenDisplayModalOpen(false)}>
              {t("done") || "Done"}
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
            <DialogTitle>{t("delete-token") || "Delete Token"}</DialogTitle>
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
              {t("cancel") || "Cancel"}
            </Button>
            <Button h="48px" colorPalette="red" onClick={handleDeleteToken} loading={isDeleting}>
              {t("delete") || "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </DialogRoot>

      <Toaster />
    </>
  );
};

export default MyTokensTab;
