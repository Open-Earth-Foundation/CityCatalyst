import "katex/dist/katex.min.css";
import Latex from "react-latex-next";

/** Keeping the call to Latex library in a separate component to minimize coupling*/
export const LatexEquation = ({ formula }: { formula: string }) => {
  return <Latex>{`$${formula}$`}</Latex>;
};
