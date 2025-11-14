import { Checkbox as ChakraCheckbox } from "@chakra-ui/react"
import * as React from "react"

/**
 * Checkbox wrapper component for Chakra UI v3
 *
 * USAGE GUIDELINES:
 *
 * 1. For SINGLE checkboxes or checkboxes used individually:
 *    Use this wrapper component with react-hook-form or individual state management
 *    Example:
 *    <Checkbox checked={value} onCheckedChange={handler}>Label</Checkbox>
 *
 * 2. For MULTIPLE checkboxes in a MAPPED ARRAY (e.g., map over languages/options):
 *    Use Chakra's native Checkbox.Root components directly, NOT this wrapper
 *    Do NOT wrap them in FieldRoot - use Box or VStack instead
 *    Example:
 *    <Box>
 *      {items.map(item => (
 *        <Checkbox.Root key={item} checked={...} onCheckedChange={...}>
 *          <Checkbox.HiddenInput />
 *          <Checkbox.Control><Checkbox.Indicator /></Checkbox.Control>
 *          <Checkbox.Label>{item}</Checkbox.Label>
 *        </Checkbox.Root>
 *      ))}
 *    </Box>
 *
 * Note: Wrapping multiple checkboxes in FieldRoot causes only the first checkbox
 * to respond to clicks (known Chakra UI v3 issue).
 */
export interface CheckboxProps extends ChakraCheckbox.RootProps {
  icon?: React.ReactNode
  inputProps?: React.InputHTMLAttributes<HTMLInputElement>
  rootRef?: React.Ref<HTMLLabelElement>
}

export const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  function Checkbox(props, ref) {
    const { icon, children, inputProps, rootRef, value, ...rest } = props
    return (
      <ChakraCheckbox.Root ref={rootRef} {...rest}>
        <ChakraCheckbox.HiddenInput ref={ref} value={value} {...inputProps} />
        <ChakraCheckbox.Control>
          {icon || <ChakraCheckbox.Indicator />}
        </ChakraCheckbox.Control>
        {children != null && (
          <ChakraCheckbox.Label>{children}</ChakraCheckbox.Label>
        )}
      </ChakraCheckbox.Root>
    )
  },
)
