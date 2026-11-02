import { getApiDocs } from "@/lib/swagger";
import ReactSwagger from "./react-swagger";
import { Box } from "@chakra-ui/react";
import { connection } from "next/server";

export default async function IndexPage() {
  // The OpenAPI spec is regenerated from route JSDoc on every request, so
  // this page can't be prerendered - defer it to request time.
  await connection();
  const spec = await getApiDocs();
  return (
    <Box as="section" className="container">
      <ReactSwagger spec={spec} />
    </Box>
  );
}
