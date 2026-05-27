import React from "react";
import { Box, Button } from "@chakra-ui/react";

interface Suggestion {
  preview: string;
  message: string;
}

interface ChatSuggestionsProps {
  suggestions: Suggestion[];
  onSuggestionClick: (message: string) => void;
  disabled?: boolean;
}

export function ChatSuggestions({
  suggestions,
  onSuggestionClick,
  disabled = false,
}: ChatSuggestionsProps) {
  return (
    <Box display="flex" flexDir="row" gap={2} whiteSpace="nowrap" pb="3" overflowX="auto" flexShrink={0}>
      {suggestions.map((suggestion, i) => (
        <Button
          key={i}
          onClick={() => onSuggestionClick(suggestion.message)}
          bg="sentiment.positiveOverlay"
          color="interactive.primary"
          py={2}
          px={4}
          textTransform="none"
          fontSize="16px"
          fontFamily="body"
          w="fit-content"
          letterSpacing="0.5px"
          lineHeight="24px"
          fontWeight="400"
          whiteSpace="nowrap"
          display="inline-block"
          disabled={disabled}
          borderWidth="1px"
          borderColor="interactive.primary"
        >
          {suggestion.preview}
        </Button>
      ))}
    </Box>
  );
}
