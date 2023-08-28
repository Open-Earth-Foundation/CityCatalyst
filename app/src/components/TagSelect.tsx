import { Select, Props } from "chakra-react-select";
import { UseControllerProps, useController } from "react-hook-form"

export function TagSelect<T>({
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

  return (
    <Select
      isMulti
      tagVariant="brand"
      name={name}
      ref={ref}
      onChange={onChange}
      onBlur={onBlur}
      value={value}
      {...props}
    />
  );
}
