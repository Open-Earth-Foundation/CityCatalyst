import { Box } from "@chakra-ui/react";
import "katex/dist/katex.min.css";
import { InlineMath } from "react-katex";

/** Keeping the call to Latex library in a separate component to minimize coupling*/
export const LatexEquation = ({ formula }: { formula: string }) => {
  return (
    <Box py={2}>
      <InlineMath>{formula}</InlineMath>
    </Box>
  );
};
