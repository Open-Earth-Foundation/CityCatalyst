/* eslint-disable i18next/no-literal-string */
"use client";

import { use, useEffect, useState } from "react";
import {
  Box,
  Card,
  Heading,
  Text,
  Badge,
  Code,
  VStack,
  HStack,
  Icon,
  Table,
} from "@chakra-ui/react";
import { MdCheck, MdClose, MdFlag, MdRefresh } from "react-icons/md";
import { useTranslation } from "@/i18n/client";
import { useAdminGuard } from "@/hooks/useAdminGuard";
import ProgressLoader from "@/components/ProgressLoader";
import {
  FeatureFlags,
  listQAFeatureFlags,
  getFeatureFlags,
  hasFeatureFlag,
} from "@/util/feature-flags";

interface FlagStatus {
  flag: FeatureFlags;
  enabled: boolean;
  source: "env" | "qa_override";
}

export default function FeatureFlagsPage({
  params,
}: {
  params: Promise<{ lng: string }>;
}) {
  const { lng } = use(params);
  const { t } = useTranslation(lng, "admin");
  const [flagStatuses, setFlagStatuses] = useState<FlagStatus[]>([]);
  const [qaOverrides, setQaOverrides] = useState<Record<string, boolean>>({});
  const isAdmin = useAdminGuard(lng, t);

  useEffect(() => {
    loadFeatureFlags();
  }, []);

  const loadFeatureFlags = () => {
    const envFlags = getFeatureFlags();
    const qaFlags = listQAFeatureFlags();
    setQaOverrides(qaFlags);

    const statuses: FlagStatus[] = Object.values(FeatureFlags).map((flag) => {
      const enabled = hasFeatureFlag(flag);
      const source = flag in qaFlags ? "qa_override" : "env";
      return { flag, enabled, source };
    });

    setFlagStatuses(statuses);
  };

  if (!isAdmin) {
    return <ProgressLoader />;
  }

  return (
    <Box p={8} maxW="1400px" mx="auto">
      <VStack align="stretch" gap={6}>
        {/* Header */}
        <Box>
          <HStack mb={2}>
            <Icon as={MdFlag} boxSize={8} color="blue.500" />
            <Heading size="lg">LocalStorage Feature Flags (QA Testing)</Heading>
          </HStack>
          <Text color="gray.600">
            This page displays all feature flags and their current status.
            QA overrides (localStorage) take precedence over environment variables.
          </Text>
          <Text color="gray.500" fontSize="sm" mt={2}>
            Note: This page is only accessible to admin users by direct URL.
          </Text>
        </Box>

        {/* Reload Warning */}
        <Box
          p={3}
          bg="orange.50"
          borderWidth="1px"
          borderColor="orange.200"
          borderRadius="md"
        >
          <HStack>
            <Icon as={MdRefresh} color="orange.700" boxSize={5} />
            <Text fontWeight="semibold" color="orange.700">
              Important: Reload Required
            </Text>
          </HStack>
          <Text fontSize="sm" color="orange.600" mt={1}>
            After setting or removing any feature flag, you must{" "}
            <Text as="span" fontWeight="semibold">
              reload the page
            </Text>{" "}
            for the changes to take effect.
          </Text>
        </Box>

        {/* Feature Flags Table */}
        <Card.Root>
          <Card.Header>
            <Heading size="md">All Feature Flags Status</Heading>
          </Card.Header>
          <Card.Body>
            <Table.Root variant="outline" size="sm">
              <Table.Header>
                <Table.Row>
                  <Table.ColumnHeader>Feature Flag</Table.ColumnHeader>
                  <Table.ColumnHeader>Status</Table.ColumnHeader>
                  <Table.ColumnHeader>Source</Table.ColumnHeader>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {flagStatuses.map(({ flag, enabled, source }) => (
                  <Table.Row key={flag}>
                    <Table.Cell>
                      <Code fontSize="sm" colorScheme="blue">
                        {flag}
                      </Code>
                    </Table.Cell>
                    <Table.Cell>
                      <Badge
                        colorScheme={enabled ? "green" : "gray"}
                        display="inline-flex"
                        alignItems="center"
                        gap={1}
                      >
                        <Icon
                          as={enabled ? MdCheck : MdClose}
                          boxSize={4}
                        />
                        {enabled ? "Enabled" : "Disabled"}
                      </Badge>
                    </Table.Cell>
                    <Table.Cell>
                      <Badge
                        colorScheme={source === "qa_override" ? "orange" : "blue"}
                      >
                        {source === "qa_override"
                          ? "QA Override"
                          : "Environment"}
                      </Badge>
                    </Table.Cell>
                  </Table.Row>
                ))}
              </Table.Body>
            </Table.Root>
          </Card.Body>
        </Card.Root>

        {/* QA Overrides */}
        {Object.keys(qaOverrides).length > 0 && (
          <Card.Root bg="orange.50" borderColor="orange.200">
            <Card.Header>
              <Heading size="md" color="orange.800">
                Active QA Overrides
              </Heading>
            </Card.Header>
            <Card.Body>
              <VStack align="stretch" gap={2}>
                {Object.entries(qaOverrides).map(([flag, enabled]) => (
                  <HStack key={flag} justifyContent="space-between">
                    <Code fontSize="sm">{flag}</Code>
                    <Badge colorScheme={enabled ? "green" : "red"}>
                      {enabled ? "Enabled" : "Disabled"}
                    </Badge>
                  </HStack>
                ))}
                <Text fontSize="sm" color="orange.700" mt={2}>
                  💡 To remove overrides, use{" "}
                  <Code>qaFlags.clearAll()</Code> in the console
                </Text>
              </VStack>
            </Card.Body>
          </Card.Root>
        )}

        {/* Quick Start Guide */}
        <Card.Root>
          <Card.Header>
            <Heading size="md">Quick Start (Browser Console)</Heading>
          </Card.Header>
          <Card.Body>
            <VStack align="stretch" gap={4}>
              <Box>
                <Text fontWeight="semibold" mb={2}>
                  Enable a feature for testing
                </Text>
                <Code display="block" p={3} borderRadius="md">
                  qaFlags.set(qaFlags.FeatureFlags.CCRA_MODULE, true)
                </Code>
              </Box>

              <Box>
                <Text fontWeight="semibold" mb={2}>
                  Disable a feature for testing
                </Text>
                <Code display="block" p={3} borderRadius="md">
                  qaFlags.set(qaFlags.FeatureFlags.JN_ENABLED, false)
                </Code>
              </Box>

              <Box>
                <Text fontWeight="semibold" mb={2}>
                  View current QA overrides
                </Text>
                <Code display="block" p={3} borderRadius="md">
                  qaFlags.list()
                </Code>
              </Box>

              <Box>
                <Text fontWeight="semibold" mb={2}>
                  See complete status of all flags
                </Text>
                <Code display="block" p={3} borderRadius="md">
                  qaFlags.debug()
                </Code>
              </Box>

              <Box>
                <Text fontWeight="semibold" mb={2}>
                  Remove a specific override
                </Text>
                <Code display="block" p={3} borderRadius="md">
                  qaFlags.clear(qaFlags.FeatureFlags.CCRA_MODULE)
                </Code>
              </Box>

              <Box>
                <Text fontWeight="semibold" mb={2}>
                  Remove all QA overrides
                </Text>
                <Code display="block" p={3} borderRadius="md">
                  qaFlags.clearAll()
                </Code>
              </Box>
            </VStack>
          </Card.Body>
        </Card.Root>

        {/* Available Flags Reference */}
        <Card.Root>
          <Card.Header>
            <Heading size="md">Available Feature Flags</Heading>
          </Card.Header>
          <Card.Body>
            <VStack align="stretch" gap={2}>
              <Code display="block" p={3} borderRadius="md" whiteSpace="pre">
                {`qaFlags.FeatureFlags = {
  ENTERPRISE_MODE: "ENTERPRISE_MODE",
  PROJECT_OVERVIEW_ENABLED: "PROJECT_OVERVIEW_ENABLED",
  ACCOUNT_SETTINGS_ENABLED: "ACCOUNT_SETTINGS_ENABLED",
  UPLOAD_OWN_DATA_ENABLED: "UPLOAD_OWN_DATA_ENABLED",
  JN_ENABLED: "JN_ENABLED",
  OAUTH_ENABLED: "OAUTH_ENABLED",
  ANALYTICS_ENABLED: "ANALYTICS_ENABLED",
  CCRA_MODULE: "CCRA_MODULE"
}`}
              </Code>
              <Text fontSize="sm" color="gray.600" mt={2}>
                Use these flag names when setting overrides. All flags are accessible via the global <Code>qaFlags</Code> object in the browser console.
              </Text>
            </VStack>
          </Card.Body>
        </Card.Root>

        {/* Documentation Link */}
        <Card.Root>
          <Card.Body>
            <Text>
              📚 For detailed documentation, examples, and troubleshooting, see{" "}
              <Code>/app/docs/QA_FEATURE_FLAGS.md</Code>
            </Text>
          </Card.Body>
        </Card.Root>
      </VStack>
    </Box>
  );
}
