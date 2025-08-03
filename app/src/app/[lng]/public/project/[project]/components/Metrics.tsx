import { Skeleton } from "@/components/ui/skeleton";
import { Box, Heading, Text } from "@chakra-ui/react";

export interface MetricItem {
  value: number | string;
  label: string;
}

export interface MetricsProps {
  title?: string;
  description?: string;
  metrics: MetricItem[];
  isLoading?: boolean;
}

const Metrics = ({
  title,
  description,
  metrics,
  isLoading = false,
}: MetricsProps) => {
  return (
    <Box as="section" py={16} px={6}>
      <Box maxW="7xl" mx="auto">
        {/* Optional section title and description */}
        {title && (
          <Heading fontSize="3xl" fontWeight="bold" color="gray.800" mb={8}>
            {title}
          </Heading>
        )}

        {description && (
          <Text maxW="3xl" mb={10} color="gray.600">
            {description}
          </Text>
        )}

        {/* Metrics grid */}
        <Box display="grid" gridTemplateColumns="repeat(2, 1fr)" gap={4}>
          {metrics.map((metric, index) => (
            <Box key={index} bg="white" p={6} rounded="md">
              <Text
                color="gray.500"
                textTransform="uppercase"
                fontSize="xs"
                fontWeight="medium"
                mb={2}
                letterSpacing="wider"
              >
                {metric.label}
              </Text>
              {isLoading ? (
                <Skeleton h="12" w="24" bg="gray.200" />
              ) : (
                <Text fontSize="4xl" fontWeight="bold" color="gray.800">
                  {metric.value}
                </Text>
              )}
            </Box>
          ))}
        </Box>
      </Box>
    </Box>
  );
};

export default Metrics;
