"use client";

import { useState } from "react";
import { Text } from "@chakra-ui/react";

import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";
import { useTranslation } from "@/i18n/client";
import { api } from "@/services/api";
import type {
  ConceptNoteFunderCreateResponse,
  ConceptNoteFunderImport,
} from "@/util/types";

import { AddFunderForm } from "./add-funder-form";
import { AddFunderPanel } from "./add-funder-panel";
import {
  emptyFunderForm,
  formFromDraft,
  formToCreateRequest,
  funderApiErrorCode,
  funderApiErrorKey,
  validateFunderForm,
  type FunderForm,
} from "./funder-form";
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
  const [mode, setMode] = useState<"choose" | "form" | null>(null);
  const [form, setForm] = useState(emptyFunderForm);
  const [source, setSource] = useState<ConceptNoteFunderImport | null>(null);
  const [showErrors, setShowErrors] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createFunder, createState] = api.useCreateConceptNoteFunderMutation();
  const formErrors = validateFunderForm(form);

  function edit(next: FunderForm, from: ConceptNoteFunderImport | null): void {
    setForm(next);
    setSource(from);
    setShowErrors(false);
    setError(null);
    setMode("form");
  }

  function reset(): void {
    edit(emptyFunderForm(), null);
    setMode(null);
  }

  return {
    mode,
    form,
    setForm,
    source,
    /** Errors to show; empty until the user first tries to add the funder. */
    errors: showErrors ? formErrors : {},
    /** i18n key for a failed request. */
    error,
    creating: createState.isLoading,
    open: () => setMode(flow ? "choose" : "form"),
    close: () => setMode(null),
    back: () => setMode(mode === "form" && flow ? "choose" : null),
    enterManually: () => edit(emptyFunderForm(), null),
    /** Fill the form from the ready import unless it is already loaded. */
    review(): void {
      const ready = flow?.funderImport;
      if (ready?.draft && ready.import_id !== source?.import_id) {
        edit(formFromDraft(ready.draft), ready);
      } else {
        setMode("form");
      }
    },
    async discard(): Promise<void> {
      try {
        await flow?.discard();
        reset();
      } catch (cause) {
        setError(funderApiErrorKey(cause));
      }
    },
    async submit(): Promise<void> {
      setError(null);
      if (Object.keys(formErrors).length) {
        setShowErrors(true);
        return;
      }
      try {
        const created = await createFunder({
          runId,
          funder: formToCreateRequest(form, source),
        }).unwrap();
        await onAdded(created);
        reset();
      } catch (cause) {
        // A replaced or discarded import can still be added as typed.
        if (funderApiErrorCode(cause) === "funder_import_changed") {
          setSource(null);
        }
        setError(funderApiErrorKey(cause));
      }
    },
  };
}

export type AddFunder = ReturnType<typeof useAddFunder>;

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
export function AddFunderFooter({ add, flow, lng }: AddFunderPartProps) {
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
          onClick={() => void add.discard()}
        >
          {t("funder-discard")}
        </Button>
      )}
      <Button variant="outline" size="sm" onClick={add.back}>
        {t("funder-back")}
      </Button>
      {add.mode === "form" && (
        <Button
          size="sm"
          loading={add.creating}
          onClick={() => void add.submit()}
          data-testid="concept-note-add-funder"
        >
          {t("funder-add-submit")}
        </Button>
      )}
    </DialogFooter>
  );
}
