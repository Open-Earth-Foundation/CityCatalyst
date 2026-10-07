"use client";

import { useState } from "react";

import type {
  ConceptNoteApplicationContext,
  ConceptNoteCustomTemplateRequest,
  ConceptNoteFunderImport,
  ConceptNoteFundingAddedFrom,
} from "@/util/types";

import { OwnTemplateForm } from "./add-funder-form";
import { AddFunderPanel } from "./add-funder-panel";
import {
  emptyTemplateForm,
  funderApiErrorKey,
  ownTemplateRequest,
  templateFieldsFromContext,
  templateFormFrom,
  templatePreview,
  validateTemplateForm,
  type TemplateForm,
} from "./funder-form";
import type { FunderImportFlow } from "./use-funder-import";

type Template = NonNullable<ConceptNoteApplicationContext["template"]>;

/** The note's own template as chosen in the dialog, before or after saving. */
export interface OwnTemplateChoice {
  /** New or edited template to save; null keeps the saved one. */
  request: ConceptNoteCustomTemplateRequest | null;
  preview: Template;
  source: ConceptNoteFundingAddedFrom;
}

/** The saved own template of a note, if it uses one. */
export function savedOwnTemplate(
  context: ConceptNoteApplicationContext,
): OwnTemplateChoice | null {
  if (!context.template || !context.template_source) return null;
  return {
    request: null,
    preview: context.template,
    source: context.template_source,
  };
}

/**
 * State for giving the note its own template inside the funding dialog:
 * choose a document or the form (`choose`), then review the chapters
 * (`form`). Confirming hands the template to the dialog's selection; the
 * dialog's Save stores it like any funding choice.
 */
export function useOwnTemplate({
  flow,
  onUse,
}: {
  /** Enables reading the template from a document; by hand works without it. */
  flow?: FunderImportFlow;
  onUse: (choice: OwnTemplateChoice) => void;
}) {
  const [mode, setMode] = useState<"choose" | "form" | null>(null);
  const [form, setForm] = useState<TemplateForm>(emptyTemplateForm);
  const [source, setSource] = useState<ConceptNoteFunderImport | null>(null);
  const [showErrors, setShowErrors] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const formErrors = validateTemplateForm(form);

  function edit(next: TemplateForm, from: ConceptNoteFunderImport | null) {
    setForm(next);
    setSource(from);
    setShowErrors(false);
    setError(null);
    setMode("form");
  }

  function reset(): void {
    edit(emptyTemplateForm(), null);
    setMode(null);
  }

  return {
    mode,
    form,
    setForm,
    source,
    errors: showErrors ? formErrors : {},
    /** i18n key for a failed request. */
    error,
    creating: false,
    open: () => setMode(flow ? "choose" : "form"),
    /** Edit a template already chosen for the note. */
    change: (template: Template) =>
      edit(templateFormFrom(templateFieldsFromContext(template)), null),
    close: () => setMode(null),
    back: () => setMode(mode === "form" && flow ? "choose" : null),
    enterManually: () => edit(emptyTemplateForm(), null),
    /** Fill the form from the ready import unless it is already loaded. */
    review(): void {
      const ready = flow?.funderImport;
      if (ready?.draft && ready.import_id !== source?.import_id) {
        edit(templateFormFrom(ready.draft.template), ready);
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
      if (Object.keys(formErrors).length) {
        setShowErrors(true);
        return;
      }
      const request = ownTemplateRequest(form, source);
      onUse({
        request,
        preview: templatePreview(request.template),
        source: source
          ? { kind: "document", filename: source.filename }
          : { kind: "manual", filename: null },
      });
      reset();
    },
  };
}

export type OwnTemplate = ReturnType<typeof useOwnTemplate>;

/** Right pane while defining the note's own template. */
export function OwnTemplatePane({
  own,
  flow,
  lng,
}: {
  own: OwnTemplate;
  flow?: FunderImportFlow;
  lng: string;
}) {
  if (own.mode === "choose" && flow) {
    return (
      <AddFunderPanel
        flow={flow}
        lng={lng}
        onEnterManually={own.enterManually}
        onReview={own.review}
      />
    );
  }
  return (
    <OwnTemplateForm
      form={own.form}
      onChange={own.setForm}
      source={own.source}
      errors={own.errors}
      lng={lng}
    />
  );
}
