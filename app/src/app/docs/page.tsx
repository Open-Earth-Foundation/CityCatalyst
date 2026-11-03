import { io } from "next/cache";
import { Box } from "@chakra-ui/react";
import { getApiDocs } from "@/lib/swagger";
import ReactSwagger from "./react-swagger";

export default async function IndexPage() {
  // The OpenAPI spec is regenerated from route JSDoc on every request and
  // reads values the pg/swagger-jsdoc internals treat as unstable, so it
  // can't be captured into the static shell - exclude it instead.
  await io();
  const spec = await getApiDocs();
  return (
    <Box as="section" className="container">
      <ReactSwagger spec={spec} />
    </Box>
  );
}
