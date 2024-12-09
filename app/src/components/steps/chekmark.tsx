import { CheckIcon } from "@chakra-ui/icons";
import React, { FC } from "react";

interface CheckmarkProps {
  condition: boolean;
}

const Checkmark: FC<CheckmarkProps> = ({ condition }) => {
  return condition ? <CheckIcon color="semantic.success" boxSize={4} /> : null;
};

export default Checkmark;
