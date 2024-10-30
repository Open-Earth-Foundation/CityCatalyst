import type { TFunction } from "i18next";
import { Checkbox, ModalBody, Text } from "@chakra-ui/react";

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
    <ModalBody>
      <Text fontWeight="600" fontSize="title.lg">
        {t("make-public")}
      </Text>
      <Text>{t("make-public-description")}</Text>
      <Checkbox my="16px" isChecked={checked} onChange={onAuthorizeChange}>
        {t("i-authorize")}
      </Checkbox>
    </ModalBody>
  );
}
