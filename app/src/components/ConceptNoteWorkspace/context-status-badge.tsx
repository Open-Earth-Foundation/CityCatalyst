import { Box, HStack, Text } from "@chakra-ui/react";
export type ContextTone = "positive" | "neutral" | "warning";

export function toneColor(tone: ContextTone): string {
  if (tone === "positive") {
    return "sentiment.positiveDefault";
  }
  if (tone === "warning") {
    return "sentiment.warningDefault";
  }
  return "content.tertiary";
}

export function ContextStatusBadge({
  label,
  tone = "neutral",
}: {
  label: string;
  tone?: ContextTone;
}) {
  const color = toneColor(tone);

  return (
    <HStack
      alignSelf="flex-start"
      gap={1.5}
      border="1px solid"
      borderColor={color}
      borderRadius="pill"
      px={2}
      py={0.5}
    >
      <Box boxSize="6px" borderRadius="full" bg={color} />
      <Text fontSize="10px" lineHeight="16px" color="content.secondary">
        {label}
      </Text>
    </HStack>
  );
}
