import { Combobox, useFilter, useListCollection } from "@chakra-ui/react";
import { TFunction } from "i18next";
import { useEffect } from "react";
import { modalInputProps } from "./ModalField";
import { KNOWN_DATA_PROVIDERS } from "@/util/data-providers";

interface ProviderComboboxProps {
  t: TFunction;
  value: string;
  onChange: (value: string) => void;
  invalid?: boolean;
}

/**
 * Combobox suggesting known data providers while accepting any custom text.
 * The input text is the source of truth, so a typed provider is kept as is.
 */
export const ProviderCombobox = ({
  t,
  value,
  onChange,
  invalid,
}: ProviderComboboxProps) => {
  const { contains } = useFilter({ sensitivity: "base" });
  const { collection, filter } = useListCollection({
    initialItems: KNOWN_DATA_PROVIDERS,
    filter: contains,
  });

  // keep the suggestions in sync when the value is set from outside (reset/edit)
  useEffect(() => {
    filter(value ?? "");
  }, [value, filter]);

  return (
    <Combobox.Root
      collection={collection}
      allowCustomValue
      openOnClick
      inputValue={value ?? ""}
      onInputValueChange={(e) => onChange(e.inputValue)}
      positioning={{ strategy: "fixed", sameWidth: true }}
      invalid={invalid}
      w="full"
    >
      <Combobox.Control>
        <Combobox.Input
          data-testid="data-provider-input"
          placeholder={t("data-provider-placeholder")}
          {...modalInputProps(!!invalid)}
        />
        <Combobox.IndicatorGroup>
          <Combobox.Trigger />
        </Combobox.IndicatorGroup>
      </Combobox.Control>
      <Combobox.Positioner>
        <Combobox.Content>
          <Combobox.Empty>{t("data-provider-use-custom")}</Combobox.Empty>
          {collection.items.map((item) => (
            <Combobox.Item item={item} key={item}>
              {item}
              <Combobox.ItemIndicator />
            </Combobox.Item>
          ))}
        </Combobox.Content>
      </Combobox.Positioner>
    </Combobox.Root>
  );
};
