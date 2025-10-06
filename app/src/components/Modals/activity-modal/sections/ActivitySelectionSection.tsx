import { HStack } from "@chakra-ui/react";
import { TFunction } from "i18next";
import { Control, useController } from "react-hook-form";
import { Radio, RadioGroup } from "@/components/ui/radio";
import { Methodology, SuggestedActivity } from "@/util/form-schema";
import { Field } from "@/components/ui/field";
interface ActivitySelectionSectionProps {
  t: TFunction;
  control: Control<any, any>;
  methodology: Methodology;
  selectedActivity?: SuggestedActivity;
}

export const ActivitySelectionSection = ({
  t,
  control,
  methodology,
  selectedActivity,
}: ActivitySelectionSectionProps) => {
  const { field } = useController({
    name: `activity.${methodology.activitySelectionField?.id}`,
    control,
    defaultValue: selectedActivity?.prefills?.[0].value,
  });

  if (!methodology.activitySelectionField) {
    return null;
  }

  return (
    <HStack
      gap={4}
      mb="24px"
      display="flex"
      flexDirection="column"
      alignItems="flex-start"
      w="full"
    >
      <Field w="full" label={t(methodology.activitySelectionField.id)}>
        <RadioGroup {...field}>
          <HStack
            display="flex"
            flexDirection="row"
            alignItems="flex-start"
            w="full"
          >
            {methodology.activitySelectionField.options?.map((option) => (
              <Radio key={option} value={option}>
                {t(option)}
              </Radio>
            ))}
          </HStack>
        </RadioGroup>
      </Field>
    </HStack>
  );
};