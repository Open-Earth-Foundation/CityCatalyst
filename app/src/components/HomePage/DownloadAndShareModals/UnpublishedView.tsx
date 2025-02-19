import type { TFunction } from "i18next";
import { Text } from "@chakra-ui/react";
import {
  DialogRoot,
  DialogBody,
  DialogContent,
  DialogFooter,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";

export function UnpublishedView({
  checked,
  onAuthorizeChange,
  t,
}: {
  checked: boolean;
  onAuthorizeChange: () => void;
  t: TFunction;
}) {
  return (
    <DialogBody>
      <Text fontWeight="600" fontSize="title.lg">
        {t("make-public")}
      </Text>
      <Text>{t("make-public-description")}</Text>
      <Checkbox my="16px" checked={checked} onChange={onAuthorizeChange}>
        {t("i-authorize")}
      </Checkbox>
    </DialogBody>
  );
}
