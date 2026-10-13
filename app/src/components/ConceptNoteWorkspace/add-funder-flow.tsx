"use client";

import { useState } from "react";
import { Text } from "@chakra-ui/react";

import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";
import { useTranslation } from "@/i18n/client";
import { api } from "@/services/api";
import type { ConceptNoteFunderCreateResponse } from "@/util/types";

import { AddFunderForm } from "./add-funder-form";
import { AddFunderPanel } from "./add-funder-panel";
import {
  emptyFunderForm,
  formFromDraft,
  formToCreateRequest,
  funderApiErrorCode,
  funderApiErrorKey,
  validateFunderForm,
} from "./funder-form";
import { useImportForm } from "./use-import-form";
import type { FunderImportFlow } from "./use-funder-import";

/**
 * State for adding an unlisted funder inside the funding dialog: choose a
 * document or the form (`choose`), then review and submit the form (`form`).
 */
export function useAddFunder({
  runId,
  flow,
  onAdded,
}: {
  runId: string;
  /** Enables adding from a document; by hand works without it. */
  flow?: FunderImportFlow;
  onAdded: (created: ConceptNoteFunderCreateResponse) => Promise<void>;
}) {
  const editor = useImportForm({
    empty: emptyFunderForm,
    fromDraft: formFromDraft,
    validate: validateFunderForm,
    flow,
  });
  const { form, source, reset, setError, setSource, isValid } = editor;
  const [createFunder] = api.useCreateConceptNoteFunderMutation();
  const [creating, setCreating] = useState(false);

  return {
    ...editor,
    creating,
    async submit(): Promise<void> {
      if (creating) return;
      setError(null);
      if (!isValid()) return;
      setCreating(true);
      try {
        const created = await createFunder({
          runId,
          funder: formToCreateRequest(form, source),
        }).unwrap();
        reset();
        await onAdded(created);
      } catch (cause) {
        // A replaced or discarded import can still be added as typed.
        if (funderApiErrorCode(cause) === "funder_import_changed") {
          setSource(null);
        }
        setError(funderApiErrorKey(cause));
      } finally {
        setCreating(false);
      }
    },
  };
}

export type AddFunder = ReturnType<typeof useAddFunder>;

/** What the shared footer needs from an add-funder or own-template flow. */
export type AddFlowControls = Pick<
  AddFunder,
  "mode" | "error" | "creating" | "back" | "discard" | "submit"
>;

interface AddFunderPartProps {
  add: AddFunder;
  flow?: FunderImportFlow;
  lng: string;
}

/** Right pane while adding: the document panel or the funder form. */
export function AddFunderPane({ add, flow, lng }: AddFunderPartProps) {
  if (add.mode === "choose" && flow) {
    return (
      <AddFunderPanel
        flow={flow}
        lng={lng}
        onEnterManually={add.enterManually}
        onReview={add.review}
      />
    );
  }
  return (
    <AddFunderForm
      form={add.form}
      onChange={add.setForm}
      source={add.source}
      errors={add.errors}
      disabled={add.creating}
      lng={lng}
    />
  );
}

/** Dialog footer while adding, replacing the selection footer. */
export function AddFunderFooter({
  add,
  flow,
  lng,
  submitLabel = "funder-add-submit",
  submitTestId = "concept-note-add-funder",
}: {
  add: AddFlowControls;
  flow?: FunderImportFlow;
  lng: string;
  submitLabel?: string;
  submitTestId?: string;
}) {
  const { t } = useTranslation(lng, "concept-notes");
  return (
    <DialogFooter
      flexShrink={0}
      flexWrap="wrap"
      gap={3}
      p={4}
      borderTop="1px solid"
      borderColor="border.neutral"
    >
      {add.error && (
        <Text
          role="alert"
          flexBasis="100%"
          color="sentiment.negativeDefault"
          fontSize="body.sm"
        >
          {t(add.error)}
        </Text>
      )}
      {flow && (add.mode === "form" || flow.phase !== "idle") && (
        <Button
          variant="ghost"
          color="content.link"
          textDecoration="underline"
          size="sm"
          loading={flow.busy}
          disabled={add.creating}
          onClick={() => void add.discard()}
        >
          {t("funder-discard")}
        </Button>
      )}
      <Button
        variant="outline"
        size="sm"
        disabled={add.creating}
        onClick={add.back}
      >
        {t("funder-back")}
      </Button>
      {add.mode === "form" && (
        <Button
          size="sm"
          loading={add.creating}
          onClick={() => void add.submit()}
          data-testid={submitTestId}
        >
          {t(submitLabel)}
        </Button>
      )}
    </DialogFooter>
  );
}
