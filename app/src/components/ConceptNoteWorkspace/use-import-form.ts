"use client";

import { useState } from "react";
import type {
  ConceptNoteFunderImport,
  ConceptNoteFunderImportDraft,
} from "@/util/types";
import { funderApiErrorKey, type FunderFormErrors } from "./funder-form";
import type { FunderImportFlow } from "./use-funder-import";

/** Editing and document-review state shared by the funder and template forms. */
export function useImportForm<Form>({
  empty,
  fromDraft,
  validate,
  flow,
}: {
  empty: () => Form;
  fromDraft: (draft: ConceptNoteFunderImportDraft) => Form;
  validate: (form: Form) => FunderFormErrors;
  flow?: FunderImportFlow;
}) {
  const [mode, setMode] = useState<"choose" | "form" | null>(null);
  const [form, setForm] = useState(empty);
  const [source, setSource] = useState<ConceptNoteFunderImport | null>(null);
  const [showErrors, setShowErrors] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const errors = validate(form);

  function edit(next: Form, from: ConceptNoteFunderImport | null): void {
    setForm(next);
    setSource(from);
    setShowErrors(false);
    setError(null);
    setMode("form");
  }

  function reset(): void {
    edit(empty(), null);
    setMode(null);
  }

  return {
    mode,
    form,
    setForm,
    source,
    errors: showErrors ? errors : {},
    error,
    edit,
    reset,
    setSource,
    setError,
    isValid(): boolean {
      if (!Object.keys(errors).length) return true;
      setShowErrors(true);
      return false;
    },
    open: () => setMode(flow ? "choose" : "form"),
    close: () => setMode(null),
    back: () => setMode(mode === "form" && flow ? "choose" : null),
    enterManually: () => edit(empty(), null),
    review(): void {
      const ready = flow?.funderImport;
      if (ready?.draft && ready.import_id !== source?.import_id) {
        edit(fromDraft(ready.draft), ready);
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
  };
}
