import { getApiDocs } from "@/lib/swagger";
import ReactSwagger from "./react-swagger";
import { Box } from "@chakra-ui/react";

export default async function IndexPage() {
  const spec = await getApiDocs();
  return (
    <Box as="section" className="container">
      <ReactSwagger spec={spec} />
    </Box>
  );
}
