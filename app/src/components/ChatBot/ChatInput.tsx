import React from "react";
import {
  HStack,
  IconButton,
  Textarea,
} from "@chakra-ui/react";
import { MdOutlineSend, MdStop } from "react-icons/md";
import { useEnterSubmit } from "@/hooks/useEnterSubmit";

interface ChatInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  onStop: () => void;
  disabled: boolean;
  isGenerating: boolean;
  placeholder: string;
  sendLabel: string;
  stopLabel: string;
  inputRef?: React.Ref<HTMLTextAreaElement>;
}

export function ChatInput({
  value,
  onChange,
  onSubmit,
  onStop,
  disabled,
  isGenerating,
  placeholder,
  sendLabel,
  stopLabel,
  inputRef,
}: ChatInputProps) {
  const { formRef, onKeyDown } = useEnterSubmit();

  return (
    <form onSubmit={onSubmit} ref={formRef}>
      <HStack mt={1}>
        <Textarea
          h="80px"
          ref={inputRef}
          flexGrow={1}
          w="full"
          p={4}
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
        />
        {disabled ? (
          <IconButton
            onClick={onStop}
            colorScheme="red"
            aria-label={stopLabel}
          >
            <MdStop />
          </IconButton>
        ) : (
          <IconButton
            type="submit"
            variant="ghost"
            color="content.tertiary"
            aria-label={sendLabel}
            disabled={disabled}
          >
            <MdOutlineSend size={24} />
          </IconButton>
        )}
      </HStack>
    </form>
  );
}