/* eslint-disable i18next/no-literal-string */

import { Box, Container, Flex, Grid, Heading, Text } from "@chakra-ui/react";
import { Button } from "@/components/ui/button";
import Link from "next/link";

const Collaborators = ({ lng, project }: { lng: string; project: string }) => {
  return (
    <Box py={16} px={{ base: 6, md: 10, lg: 16 }} bg="white" w="full">
      <Container maxW="7xl">
        <Heading
          fontSize="headline.md"
          fontWeight="bold"
          textAlign="center"
          mb={8}
        >
          Collaborators
        </Heading>
        <Grid templateColumns={{ base: "1fr", md: "repeat(3, 1fr)" }} gap={8}>
          <Flex flexDirection="column" alignItems="center">
            <Text
              fontSize="Headline.sm"
              textAlign="center"
              fontWeight="bold"
              mb={4}
            >
              Developed by
            </Text>
            <Flex gap={6} align="center">
              <img
                src="/assets/projects_dashboard/openearth.png"
                alt="openearth"
              />
              <img
                src="/assets/projects_dashboard/icare_logo.png"
                alt="C40 Cities"
              />
            </Flex>
          </Flex>

          <Flex flexDirection="column" alignItems="center">
            <Text fontSize="Headline.sm" fontWeight="bold" mb={4}>
              A commitment from
            </Text>
            <Flex gap={6} align="center">
              <img
                src="/assets/projects_dashboard/brazil_ministry_logo.png"
                alt="Brazilian Government"
                height="150px"
                width="150px"
              />
            </Flex>
          </Flex>

          <Flex flexDirection="column" alignItems="center">
            <Text fontSize="Headline.sm" fontWeight="bold" mb={4}>
              Supported by
            </Text>
            <Flex gap={6} align="center">
              <img
                src="/assets/projects_dashboard/global_covenant_logo.png"
                alt="Global Covenant of Mayors"
                height="80px"
                width="80px"
              />
              <img
                src="/assets/projects_dashboard/c40_cities_logo.png"
                alt="C40 Cities"
                height="80px"
                width="80px"
              />
              <img
                src="/assets/projects_dashboard/cdp_logo.png"
                alt="CDP"
                height="80px"
                width="80px"
              />
            </Flex>
          </Flex>
        </Grid>

        <Flex mt={12} flexDir="column" alignItems="center">
          <Text fontSize="title.sm" fontWeight="bold" mb={4}>
            With collaboration from
          </Text>
          <Flex gap={6} align="center" justifyContent="space-between" w="full">
            <img
              src="/assets/projects_dashboard/iclei.png"
              alt="ICLEI"
              height="80px"
              width="80px"
            />
            <img
              src="/assets/projects_dashboard/seeg.png"
              alt="SEEG"
              height="80px"
              width="80px"
            />
            <img
              src="/assets/projects_dashboard/fnp.png"
              alt="SEEG"
              height="80px"
              width="80px"
            />
            <img
              src="/assets/projects_dashboard/adapta-brazil.png"
              alt="CC"
              height="80px"
              width="80px"
            />
            <img
              src="/assets/projects_dashboard/climate-trace.png"
              alt="CC"
              height="80px"
              width="80px"
            />
          </Flex>
          <Link
            href={`/${lng}/public/project/${project}/collaborators`}
            className="mt-2"
          >
            <Button variant="outline">About the collaborators</Button>
          </Link>
        </Flex>
      </Container>
    </Box>
  );
};

export default Collaborators;
