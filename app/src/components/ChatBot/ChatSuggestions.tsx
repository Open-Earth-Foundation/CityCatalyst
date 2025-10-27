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
  disabled = false 
}: ChatSuggestionsProps) {
  return (
    <Box display="flex" overflowX="auto" gap={2} whiteSpace="nowrap" pb="3">
      {suggestions.map((suggestion, i) => (
        <Button
          key={i}
          onClick={() => onSuggestionClick(suggestion.message)}
          bg="background.overlay"
          color="content.alternative"
          py={2}
          px={4}
          textTransform="none"
          fontSize="16px"
          fontFamily="body"
          letterSpacing="0.5px"
          lineHeight="24px"
          fontWeight="400"
          whiteSpace="nowrap"
          display="inline-block"
          disabled={disabled}
        >
          {suggestion.preview}
        </Button>
      ))}
    </Box>
  );
}