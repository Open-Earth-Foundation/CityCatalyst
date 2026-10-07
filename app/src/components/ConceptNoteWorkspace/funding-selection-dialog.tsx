"use client";

import { useRef, useState } from "react";
import {
  Box,
  Flex,
  Heading,
  HStack,
  Icon,
  Input,
  Skeleton,
  Text,
  VStack,
} from "@chakra-ui/react";
import {
  LuCheck,
  LuFileText,
  LuLandmark,
  LuPlus,
  LuSearch,
} from "react-icons/lu";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DialogBody,
  DialogCloseTrigger,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogRoot,
  DialogTitle,
} from "@/components/ui/dialog";
import { toaster } from "@/components/ui/toaster";
import { useTranslation } from "@/i18n/client";
import { api } from "@/services/api";
import { isFetchBaseQueryError } from "@/util/helpers";
import type {
  ConceptNoteApplicationContext,
  ConceptNoteFunderCreateResponse,
  ConceptNoteFundingOpportunity,
  ConceptNoteFunder,
} from "@/util/types";
import {
  AddFunderFooter,
  AddFunderPane,
  useAddFunder,
} from "./add-funder-flow";
import { funderApiErrorCode } from "./funder-form";
import {
  ApplicationTemplatePreview,
  FunderProfile,
  FundingOpportunityDetails,
} from "./funding-details";
import {
  OwnTemplatePane,
  savedOwnTemplate,
  useOwnTemplate,
  type OwnTemplateChoice,
} from "./own-template-flow";
import {
  FUNDER_IMPORT_PHASE_LABEL,
  type FunderImportFlow,
} from "./use-funder-import";

interface FundingSelectionDialogProps {
  applicationContext: ConceptNoteApplicationContext;
  hasDraft: boolean;
  busy: boolean;
  lng: string;
  runId: string;
  onClose: () => void;
  onSaved?: () => void;
  /** Enables adding a funder from a document; by hand works without it. */
  funderImport?: FunderImportFlow;
  /** Enables reading the note's own template from a document. */
  templateImport?: FunderImportFlow;
}

const selectionButtonProps = {
  borderRadius: "rounded",
  textTransform: "none",
  letterSpacing: "normal",
  _hover: { bg: "background.overlay", opacity: 1 },
  justifyContent: "start",
  textAlign: "start",
  h: "auto",
  p: 3,
  whiteSpace: "normal",
} as const;

/** Search funder locations and programme details, excluding IDs and template JSON. */
function matchesFundingSearch(
  funder: ConceptNoteFunder,
  query: string,
): boolean {
  const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const text = [
    funder.name,
    funder.country,
    funder.region,
    ...funder.opportunities.flatMap((opportunity) => [
      opportunity.name,
      opportunity.region_scope,
      opportunity.sector,
      opportunity.summary,
    ]),
  ]
    .filter(Boolean)
    .join(" ")
    .toLocaleLowerCase();
  return terms.every((term) => text.includes(term));
}

export function FundingSelectionDialog({
  applicationContext,
  hasDraft,
  busy,
  lng,
  runId,
  onClose,
  onSaved,
  funderImport,
  templateImport,
}: FundingSelectionDialogProps) {
  const { t } = useTranslation(lng, "concept-notes");
  const searchRef = useRef<HTMLInputElement>(null);
  const [initialContext] = useState(applicationContext);
  const [query, setQuery] = useState("");
  const [funderId, setFunderId] = useState(
    applicationContext.funder?.id ?? null,
  );
  const [opportunityId, setOpportunityId] = useState(
    applicationContext.opportunity?.id ?? null,
  );
  // The note's own template replaces the funder and programme when chosen.
  const [initialOwn] = useState(() => savedOwnTemplate(applicationContext));
  const [ownTemplate, setOwnTemplate] = useState(initialOwn);
  const [usingOwn, setUsingOwn] = useState(initialOwn !== null);
  const [acknowledged, setAcknowledged] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Shown in the footer, not as a toast, so it never covers the save button.
  const [notice, setNotice] = useState<string | null>(null);
  const {
    data,
    isLoading,
    isError,
    error: catalogueError,
    refetch,
  } = api.useGetConceptNoteFundingCatalogueQuery(runId, {
    refetchOnMountOrArgChange: true,
  });
  const [saveSelection, saveState] =
    api.useUpdateConceptNoteFundingSelectionMutation();
  const funders = data?.funders ?? [];
  const visibleFunders = funders.filter((funder) =>
    matchesFundingSearch(funder, query),
  );
  const funder = funders.find((item) => item.id === funderId);
  const opportunity = funder?.opportunities.find(
    (item) => item.id === opportunityId,
  );
  const changed = usingOwn
    ? !initialOwn || Boolean(ownTemplate?.request)
    : Boolean(initialOwn) ||
      funderId !== (initialContext.funder?.id ?? null) ||
      opportunityId !== (initialContext.opportunity?.id ?? null);
  const selectedTemplate = usingOwn
    ? ownTemplate?.preview
    : opportunity?.template;
  // Only a first save with a drafting template moves the user on to drafting.
  const savesIntoDrafting =
    !hasDraft && Boolean(selectedTemplate?.chapter_schema.length);
  const forbidden =
    isFetchBaseQueryError(catalogueError) &&
    [401, 403, 404].includes(Number(catalogueError.status));
  // Adding an unlisted funder replaces the details pane and footer.
  const add = useAddFunder({ runId, flow: funderImport, onAdded: selectAdded });
  const own = useOwnTemplate({
    flow: templateImport,
    onUse: chooseOwnTemplate,
  });
  // The rail shows no funder while adding one or using an own template.
  const selectedFunderId = add.mode || own.mode || usingOwn ? null : funderId;
  const addedFrom = funder?.opportunities.find(
    (item) => item.added_from,
  )?.added_from;

  async function selectAdded(
    created: ConceptNoteFunderCreateResponse,
  ): Promise<void> {
    await refetch();
    setQuery("");
    setFunderId(created.funder_id);
    setOpportunityId(created.funding_opportunity_id);
    setUsingOwn(false);
    setAcknowledged(false);
    setError(null);
    setNotice(t("funder-added"));
  }

  function chooseOwnTemplate(choice: OwnTemplateChoice): void {
    setOwnTemplate(choice);
    setUsingOwn(true);
    setAcknowledged(false);
    setError(null);
    setNotice(t("template-chosen"));
  }

  /** Show a template read in progress, the chosen template, or start one. */
  function openOwnTemplate(): void {
    add.close();
    setNotice(null);
    if (ownTemplate && (templateImport?.phase ?? "idle") === "idle") {
      own.close();
      setUsingOwn(true);
      setAcknowledged(false);
    } else {
      own.open();
    }
  }

  function chooseFunder(id: string): void {
    setNotice(null);
    add.close();
    own.close();
    if (usingOwn) {
      setUsingOwn(false);
      setAcknowledged(false);
    }
    if (id === funderId) return;
    const opportunities =
      funders.find((item) => item.id === id)?.opportunities ?? [];
    setFunderId(id);
    // A sole programme is preselected; the user can still deselect it.
    setOpportunityId(
      opportunities.length === 1 ? (opportunities[0]?.id ?? null) : null,
    );
    setAcknowledged(false);
    setError(null);
  }

  function programmeMeta(item: ConceptNoteFundingOpportunity): string {
    const amount = (value: string | null) => {
      const numeric = Number(value);
      return value && Number.isFinite(numeric)
        ? new Intl.NumberFormat(lng, { maximumFractionDigits: 0 }).format(
            numeric,
          )
        : (value ?? "");
    };
    const award =
      item.min_award !== null || item.max_award !== null
        ? `${amount(item.min_award)} – ${amount(item.max_award)} ${item.currency ?? ""}`.trim()
        : null;
    return [award, item.status?.replace(/_/g, " ")].filter(Boolean).join(" · ");
  }

  async function save(): Promise<void> {
    setError(null);
    try {
      await saveSelection({
        runId,
        selection: {
          funder_id: usingOwn ? null : funderId,
          selected_funding_opportunity_id: usingOwn ? null : opportunityId,
          expected_funder_id: initialContext.funder?.id ?? null,
          expected_funding_opportunity_id:
            initialContext.opportunity?.id ?? null,
          custom_template: usingOwn ? (ownTemplate?.request ?? null) : null,
          expected_custom_template_id: initialOwn?.preview.id ?? null,
          acknowledge_draft_review: acknowledged,
        },
      }).unwrap();
      toaster.create({ title: t("funding-saved"), type: "success" });
      onClose();
      if (savesIntoDrafting) onSaved?.();
    } catch (cause) {
      const status = isFetchBaseQueryError(cause) ? cause.status : null;
      const code = funderApiErrorCode(cause);
      setError(
        t(
          code === "funding_template_incompatible"
            ? "funding-template-incompatible"
            : code === "funder_import_changed"
              ? "template-error-import-changed"
              : status === 409
                ? "funding-save-conflict"
                : status === 403
                  ? "funding-permission-error"
                  : status === 422
                    ? "funding-selection-unavailable"
                    : "funding-save-error",
        ),
      );
    }
  }

  return (
    <DialogRoot
      open
      size="xl"
      initialFocusEl={() => searchRef.current}
      onOpenChange={({ open }) => !open && !saveState.isLoading && onClose()}
      closeOnEscape={!saveState.isLoading}
      closeOnInteractOutside={!saveState.isLoading}
    >
      <DialogContent
        maxW="1100px"
        w="calc(100vw - 32px)"
        maxH="calc(100dvh - 48px)"
        display="flex"
        flexDirection="column"
        bg="base.light"
        borderRadius="rounded"
        overflow="hidden"
      >
        <DialogHeader
          display="block"
          flexShrink={0}
          pe={12}
          borderBottom="1px solid"
          borderColor="border.neutral"
        >
          <DialogTitle fontFamily="heading" fontSize="title.lg">
            {t("funding-dialog-title")}
          </DialogTitle>
          <DialogDescription
            mt={1}
            fontSize="body.sm"
            color="content.secondary"
          >
            {t("funding-dialog-description")}
          </DialogDescription>
        </DialogHeader>
        <DialogCloseTrigger
          aria-label={t("close")}
          disabled={saveState.isLoading}
        />
        <DialogBody p={0} minH={0} overflowY="auto">
          {isLoading ? (
            <VStack
              p={6}
              align="stretch"
              role="status"
              aria-label={t("funding-loading")}
            >
              <Text>{t("funding-loading")}</Text>
              <Skeleton h="60px" />
              <Skeleton h="60px" />
              <Skeleton h="160px" />
            </VStack>
          ) : isError ? (
            <VStack p={8} align="start">
              <Text role="alert">
                {t(
                  forbidden ? "funding-permission-error" : "funding-load-error",
                )}
              </Text>
              {!forbidden && (
                <Button variant="outline" onClick={() => void refetch()}>
                  {t("try-again")}
                </Button>
              )}
            </VStack>
          ) : (
            <Flex
              direction={{ base: "column", md: "row" }}
              minH="440px"
              h={{ md: "min(62dvh, 620px)" }}
            >
              <VStack
                align="stretch"
                gap={0}
                w={{ base: "full", md: "34%" }}
                flexShrink={0}
                minH={0}
                borderInlineEnd={{ md: "1px solid" }}
                borderColor="border.neutral"
                bg="background.alternativeLight"
              >
                <Box p={4}>
                  <Text asChild fontSize="label.sm" fontWeight="semibold">
                    <label htmlFor="funding-search">
                      {t("funding-search-label")}
                    </label>
                  </Text>
                  <HStack mt={2} position="relative">
                    <Icon
                      as={LuSearch}
                      position="absolute"
                      insetStart={3}
                      color="content.tertiary"
                    />
                    <Input
                      id="funding-search"
                      ref={searchRef}
                      autoFocus
                      ps={9}
                      bg="base.light"
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                      placeholder={t("funding-search-placeholder")}
                    />
                  </HStack>
                  <Text
                    mt={2}
                    role="status"
                    aria-live="polite"
                    fontSize="label.sm"
                    color="content.tertiary"
                  >
                    {t("funding-results", {
                      shown: visibleFunders.length,
                      total: funders.length,
                    })}
                  </Text>
                </Box>
                <VStack
                  as="nav"
                  aria-label={t("funding-list-label")}
                  align="stretch"
                  gap={0}
                  flex={1}
                  minH={0}
                  overflowY="auto"
                  maxH={{ base: "240px", md: "none" }}
                  px={2}
                  pb={3}
                >
                  {visibleFunders.map((item) => (
                    <Button
                      {...selectionButtonProps}
                      key={item.id}
                      variant="ghost"
                      minH="76px"
                      gap={3}
                      aria-pressed={item.id === selectedFunderId}
                      disabled={saveState.isLoading}
                      bg="transparent"
                      borderInlineStart="3px solid"
                      borderColor="transparent"
                      _pressed={{
                        bg: "base.light",
                        borderColor: "content.link",
                      }}
                      onClick={() => chooseFunder(item.id)}
                    >
                      <Icon
                        as={item.id === selectedFunderId ? LuCheck : LuLandmark}
                        flexShrink={0}
                        color="content.link"
                      />
                      <Box flex={1} minW={0}>
                        <Text
                          fontWeight="semibold"
                          fontSize="body.sm"
                          color="content.primary"
                        >
                          {item.name}
                        </Text>
                        <HStack mt={1} gap={2} flexWrap="wrap">
                          {item.funder_type && (
                            <Text
                              as="span"
                              fontSize="10px"
                              lineHeight="16px"
                              px={1.5}
                              borderRadius="full"
                              border="1px solid"
                              borderColor="border.neutral"
                              color="content.secondary"
                              whiteSpace="nowrap"
                            >
                              {item.funder_type}
                            </Text>
                          )}
                          <Text fontSize="label.sm" color="content.tertiary">
                            {[item.country, item.region]
                              .filter(Boolean)
                              .join(" · ")}
                          </Text>
                        </HStack>
                        <Text
                          mt={1}
                          fontSize="label.sm"
                          color="content.tertiary"
                        >
                          {t("funding-programme-count", {
                            count: item.opportunities.length,
                          })}
                        </Text>
                      </Box>
                    </Button>
                  ))}
                  {!visibleFunders.length && (
                    <Text p={4} color="content.secondary" fontSize="body.sm">
                      {t(
                        funders.length
                          ? "funding-no-results"
                          : "funding-catalogue-empty",
                      )}
                    </Text>
                  )}
                </VStack>
                <VStack
                  align="stretch"
                  gap={2}
                  p={3}
                  borderTop="1px solid"
                  borderColor="border.neutral"
                >
                  <Button
                    {...selectionButtonProps}
                    variant="outline"
                    w="full"
                    gap={3}
                    border="1px dashed"
                    borderColor={add.mode ? "content.link" : "border.neutral"}
                    bg="base.light"
                    aria-pressed={Boolean(add.mode)}
                    disabled={saveState.isLoading}
                    onClick={() => {
                      own.close();
                      add.open();
                    }}
                  >
                    <Icon as={LuPlus} flexShrink={0} color="content.link" />
                    <Box>
                      <Text fontSize="body.sm" fontWeight="semibold">
                        {t("funder-add-entry")}
                      </Text>
                      <Text
                        mt={0.5}
                        fontSize="label.sm"
                        fontWeight="normal"
                        color="content.tertiary"
                      >
                        {t(
                          FUNDER_IMPORT_PHASE_LABEL[
                            funderImport?.phase ?? "idle"
                          ],
                        )}
                      </Text>
                    </Box>
                  </Button>
                  <Button
                    {...selectionButtonProps}
                    variant="outline"
                    w="full"
                    gap={3}
                    border="1px dashed"
                    borderColor={
                      own.mode || (usingOwn && !add.mode)
                        ? "content.link"
                        : "border.neutral"
                    }
                    bg="base.light"
                    aria-pressed={Boolean(own.mode) || (usingOwn && !add.mode)}
                    disabled={saveState.isLoading}
                    onClick={openOwnTemplate}
                  >
                    <Icon as={LuFileText} flexShrink={0} color="content.link" />
                    <Box minW={0}>
                      <Text fontSize="body.sm" fontWeight="semibold">
                        {t("template-own-entry")}
                      </Text>
                      <Text
                        mt={0.5}
                        fontSize="label.sm"
                        fontWeight="normal"
                        color="content.tertiary"
                        truncate
                      >
                        {templateImport && templateImport.phase !== "idle"
                          ? t(FUNDER_IMPORT_PHASE_LABEL[templateImport.phase])
                          : (ownTemplate?.preview.name ??
                            t("template-own-entry-help"))}
                      </Text>
                    </Box>
                  </Button>
                </VStack>
              </VStack>
              <VStack
                align="stretch"
                flex={1}
                minW={0}
                gap={6}
                p={{ base: 4, md: 6 }}
                overflowY={{ md: "auto" }}
                aria-label={t("funding-details-label")}
              >
                {add.mode ? (
                  <AddFunderPane add={add} flow={funderImport} lng={lng} />
                ) : own.mode ? (
                  <OwnTemplatePane own={own} flow={templateImport} lng={lng} />
                ) : usingOwn && ownTemplate ? (
                  <VStack
                    align="stretch"
                    gap={4}
                    data-testid="own-template-details"
                  >
                    <Box>
                      <Heading as="h3" fontSize="title.md">
                        {t("template-own-title")}
                      </Heading>
                      <Text mt={1} fontSize="label.sm" color="content.tertiary">
                        {ownTemplate.source.kind === "document"
                          ? t("template-from-file", {
                              filename: ownTemplate.source.filename,
                            })
                          : t("template-by-hand")}
                      </Text>
                      <Text mt={2} fontSize="body.sm" color="content.secondary">
                        {t("template-own-help")}
                      </Text>
                    </Box>
                    <HStack gap={2} flexWrap="wrap">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => own.change(ownTemplate.preview)}
                      >
                        {t("template-edit")}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        color="content.link"
                        onClick={own.open}
                      >
                        {t("template-replace")}
                      </Button>
                    </HStack>
                    <Box
                      borderTop="1px solid"
                      borderColor="border.neutral"
                      pt={4}
                    >
                      <ApplicationTemplatePreview
                        template={ownTemplate.preview}
                        lng={lng}
                      />
                    </Box>
                  </VStack>
                ) : !funder ? (
                  <VStack align="start" justify="center" flex={1} gap={3}>
                    <Icon as={LuLandmark} boxSize={8} color="content.link" />
                    <Heading as="h3" fontSize="title.md">
                      {t("funding-preview-prompt")}
                    </Heading>
                    <Text color="content.secondary" fontSize="body.sm">
                      {t("funding-preview-help")}
                    </Text>
                  </VStack>
                ) : (
                  <>
                    <FunderProfile
                      funder={funder}
                      addedFrom={addedFrom ?? null}
                      lng={lng}
                    />
                    <Box
                      borderTop="1px solid"
                      borderColor="border.neutral"
                      pt={5}
                    >
                      <Heading as="h3" fontSize="body.md" mb={3}>
                        {t("funding-programme-label")}
                      </Heading>
                      {funder.opportunities.length === 0 ? (
                        <Text fontSize="body.sm" color="content.tertiary">
                          {t("funding-no-programmes")}
                        </Text>
                      ) : (
                        <VStack align="stretch" gap={2}>
                          {funder.opportunities.map((item) => (
                            <Button
                              {...selectionButtonProps}
                              key={item.id}
                              variant="outline"
                              aria-pressed={item.id === opportunityId}
                              borderColor={
                                item.id === opportunityId
                                  ? "content.link"
                                  : "border.neutral"
                              }
                              disabled={saveState.isLoading}
                              onClick={() => {
                                setOpportunityId(
                                  item.id === opportunityId ? null : item.id,
                                );
                                setAcknowledged(false);
                              }}
                            >
                              {item.id === opportunityId && (
                                <Icon
                                  as={LuCheck}
                                  color="content.link"
                                  flexShrink={0}
                                />
                              )}
                              <Box>
                                <Text fontSize="body.sm" fontWeight="semibold">
                                  {item.name}
                                </Text>
                                <Text
                                  mt={1}
                                  fontSize="label.sm"
                                  color="content.tertiary"
                                >
                                  {item.template?.name ??
                                    t("funding-no-template")}
                                </Text>
                                {programmeMeta(item) && (
                                  <Text
                                    mt={1}
                                    fontSize="label.sm"
                                    color="content.secondary"
                                  >
                                    {programmeMeta(item)}
                                  </Text>
                                )}
                              </Box>
                            </Button>
                          ))}
                        </VStack>
                      )}
                    </Box>
                    {opportunity && (
                      <FundingOpportunityDetails
                        opportunity={opportunity}
                        lng={lng}
                      />
                    )}
                  </>
                )}
              </VStack>
            </Flex>
          )}
        </DialogBody>
        {add.mode ? (
          <AddFunderFooter add={add} flow={funderImport} lng={lng} />
        ) : own.mode ? (
          <AddFunderFooter
            add={own}
            flow={templateImport}
            lng={lng}
            submitLabel="template-use-submit"
            submitTestId="concept-note-use-template"
          />
        ) : (
          <DialogFooter
            display="block"
            flexShrink={0}
            p={4}
            borderTop="1px solid"
            borderColor="border.neutral"
          >
            {busy && (
              <Text
                mb={3}
                role="status"
                fontSize="body.sm"
                color="content.secondary"
              >
                {t("funding-busy")}
              </Text>
            )}
            {hasDraft && changed && (
              <Box
                mb={3}
                p={3}
                bg="sentiment.warningOverlay"
                borderRadius="rounded"
              >
                <Text mb={2} fontSize="body.sm">
                  {t("funding-draft-warning")}
                </Text>
                <Checkbox
                  checked={acknowledged}
                  onCheckedChange={({ checked }) =>
                    setAcknowledged(checked === true)
                  }
                  disabled={saveState.isLoading}
                >
                  {t("funding-draft-acknowledge")}
                </Checkbox>
              </Box>
            )}
            {notice && (
              <Text
                role="status"
                mb={3}
                color="sentiment.positiveDefault"
                fontSize="body.sm"
              >
                {notice}
              </Text>
            )}
            {error && (
              <Text
                role="alert"
                mb={3}
                color="sentiment.negativeDefault"
                fontSize="body.sm"
              >
                {error}
              </Text>
            )}
            <Flex
              align="center"
              gap={3}
              flexWrap="wrap"
              justify="space-between"
            >
              <Box flex={1} minW="160px">
                <Text fontSize="body.sm" fontWeight="semibold">
                  {usingOwn
                    ? t("template-own-title")
                    : (funder?.name ?? t("funding-not-selected"))}
                </Text>
                <Text fontSize="label.sm" color="content.tertiary">
                  {selectedTemplate?.name ?? t("template-not-selected")}
                </Text>
              </Box>
              <Button
                variant="ghost"
                color="content.link"
                textDecoration="underline"
                _hover={{
                  bg: "background.transparentGrey",
                  color: "content.link",
                }}
                size="sm"
                disabled={
                  (!funderId && !usingOwn) || saveState.isLoading || isError
                }
                onClick={() => {
                  setFunderId(null);
                  setOpportunityId(null);
                  setUsingOwn(false);
                  setAcknowledged(false);
                }}
              >
                {t("funding-clear")}
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={saveState.isLoading}
                onClick={onClose}
              >
                {t("cancel")}
              </Button>
              <Button
                size="sm"
                loading={saveState.isLoading}
                disabled={
                  !changed ||
                  isLoading ||
                  isError ||
                  busy ||
                  (hasDraft && changed && !acknowledged) ||
                  (!usingOwn && funderId !== null && !funder)
                }
                onClick={() => void save()}
                data-testid="concept-note-funding-save"
                title={savesIntoDrafting ? t("funding-next-step") : undefined}
              >
                {t(
                  savesIntoDrafting ? "funding-save-and-draft" : "funding-save",
                )}
              </Button>
            </Flex>
          </DialogFooter>
        )}
      </DialogContent>
    </DialogRoot>
  );
}
