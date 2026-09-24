"use client";

import { Button } from "@/components/ui/button";
import {
  DialogBody,
  DialogCloseTrigger,
  DialogContent,
  DialogFooter,
  DialogRoot,
} from "@/components/ui/dialog";
import { useTranslation } from "@/i18n/client";
import type { ConceptNoteApplicationContext } from "@/util/types";

import { ApplicationTemplatePreview } from "./funding-details";

interface ApplicationTemplateDialogProps {
  lng: string;
  onClose: () => void;
  template: NonNullable<ConceptNoteApplicationContext["template"]>;
}

/** Read-only view of the application template selected for this run. */
export function ApplicationTemplateDialog({
  lng,
  onClose,
  template,
}: ApplicationTemplateDialogProps) {
  const { t } = useTranslation(lng, "concept-notes");
  return (
    <DialogRoot
      open
      scrollBehavior="inside"
      onOpenChange={({ open }) => !open && onClose()}
    >
      <DialogContent
        maxW="720px"
        borderRadius="rounded"
        bg="base.light"
        boxShadow="12dp"
      >
        <DialogBody px={6} pt={6} pb={4}>
          <ApplicationTemplatePreview template={template} lng={lng} />
        </DialogBody>
        <DialogFooter
          borderTop="1px solid"
          borderColor="border.neutral"
          px={6}
          py={4}
        >
          <Button size="sm" variant="outline" onClick={onClose}>
            {t("close")}
          </Button>
        </DialogFooter>
        <DialogCloseTrigger />
      </DialogContent>
    </DialogRoot>
  );
}
