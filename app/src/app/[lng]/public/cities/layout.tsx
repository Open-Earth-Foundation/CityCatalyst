import { NavigationBar } from "@/components/navigation-bar";
import { Box } from "@chakra-ui/react";

export default async function DataLayout(props: {
  children: React.ReactNode;
  params: Promise<{ lng: string }>;
}) {
  const { lng } = await props.params;

  return (
    <Box
      h="full"
      display="flex"
      flexDirection="column"
      bg="background.backgroundLight"
    >
      <NavigationBar lng={lng} isPublic={true} />
      <Box w="full" h="full">
        {props.children}
      </Box>
    </Box>
  );
}
