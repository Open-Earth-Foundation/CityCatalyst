import { Box } from '@chakra-ui/react';
import TypographyGuide from "@/components/package/Texts/demo";
import CCTerraButtonDemo from "@/components/package/Button/demo";

export default function SamplePage() {
  return (
    <Box minH="100vh" bg="#f7f8fa" p={8}>
      <TypographyGuide />
      <Box h="40px" />
      <CCTerraButtonDemo />
    </Box>
  );
}
