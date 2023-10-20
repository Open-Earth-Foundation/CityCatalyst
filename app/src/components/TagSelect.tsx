import { Select, Props, ChakraStylesConfig } from "chakra-react-select";
import {
  FieldValues,
  UseControllerProps,
  useController,
} from "react-hook-form";

export function TagSelect<T extends FieldValues>({
  control,
  name,
  id,
  rules,
  ...props
}: UseControllerProps<T, any> & Props) {
  const {
    field: { onChange, onBlur, value, ref },
  } = useController<T>({
    name,
    control,
    rules,
  });

  const chakraStyles: ChakraStylesConfig = {
    multiValueRemove: (provided, state) => ({
      ...provided,
      color: "content.alternative",
      _focus: {
        color: "content.secondary",
      },
    }),
    option: (provided, state) => ({
      ...provided,
      bgColor: state.isFocused ? "background.neutral" : "base.light",
    }),
    input: (provided, state) => ({
      ...provided,
      px: 4,
      py: 3,
      borderRadius: "4px",
      borderColor: "border.neutral",
      _focus: {
        borderColor: "interactive.secondary",
      },
    }),
  };

  return (
    <Select
      isMulti
      tagVariant="filled"
      name={name}
      ref={ref}
      onChange={onChange}
      onBlur={onBlur}
      value={value}
      chakraStyles={chakraStyles}
      {...props}
    />
  );
}
