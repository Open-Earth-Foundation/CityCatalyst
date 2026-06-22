import { Box, Text, chakra } from "@chakra-ui/react";
import type { Components } from "react-markdown";

type MarkdownTextStyle = {
  fontSize: string;
  lineHeight: string;
  color?: string;
};

type MarkdownCodeStyle = {
  bg: string;
  fontSize: string;
  color?: string;
};

export type ChatMarkdownComponentsOptions = {
  paragraph: MarkdownTextStyle;
  h1: MarkdownTextStyle;
  h2: MarkdownTextStyle;
  h3: MarkdownTextStyle;
  list: {
    lineHeight: string;
    color?: string;
  };
  inlineColor?: string;
  code: MarkdownCodeStyle;
  pre: MarkdownCodeStyle & {
    borderRadius: string;
  };
  table: {
    fontSize: string;
    headBg: string;
    color?: string;
  };
  borderColor: string;
  link?: {
    color: string;
    fontWeight: string;
    textDecoration: string;
  };
  blockquote?: {
    borderColor: string;
    color: string;
  };
};

export function createChatMarkdownComponents(
  options: ChatMarkdownComponentsOptions,
): Components {
  const components: Components = {
    p: ({ children }) => (
      <Text
        mb={3}
        lineHeight={options.paragraph.lineHeight}
        fontSize={options.paragraph.fontSize}
        color={options.paragraph.color}
        _last={{ mb: 0 }}
      >
        {children}
      </Text>
    ),
    h1: ({ children }) => (
      <Text
        as="h1"
        fontWeight="bold"
        fontSize={options.h1.fontSize}
        mb={3}
        mt={2}
        lineHeight={options.h1.lineHeight}
        color={options.h1.color}
      >
        {children}
      </Text>
    ),
    h2: ({ children }) => (
      <Text
        as="h2"
        fontWeight="bold"
        fontSize={options.h2.fontSize}
        mb={3}
        mt={2}
        lineHeight={options.h2.lineHeight}
        color={options.h2.color}
      >
        {children}
      </Text>
    ),
    h3: ({ children }) => (
      <Text
        as="h3"
        fontWeight="semibold"
        fontSize={options.h3.fontSize}
        mb={2}
        mt={2}
        lineHeight={options.h3.lineHeight}
        color={options.h3.color}
      >
        {children}
      </Text>
    ),
    ul: ({ children }) => (
      <Box
        as="ul"
        pl={5}
        mb={3}
        color={options.list.color}
        css={{ listStyleType: "disc" }}
      >
        {children}
      </Box>
    ),
    ol: ({ children }) => (
      <Box
        as="ol"
        pl={5}
        mb={3}
        color={options.list.color}
        css={{ listStyleType: "decimal" }}
      >
        {children}
      </Box>
    ),
    li: ({ children }) => (
      <Box
        as="li"
        lineHeight={options.list.lineHeight}
        mb={1}
        color={options.list.color}
      >
        {children}
      </Box>
    ),
    strong: ({ children }) => (
      <Text
        as="strong"
        fontWeight="bold"
        display="inline"
        color={options.inlineColor}
      >
        {children}
      </Text>
    ),
    em: ({ children }) => (
      <Text
        as="em"
        fontStyle="italic"
        display="inline"
        color={options.inlineColor}
      >
        {children}
      </Text>
    ),
    code: ({ children }) => (
      <Text
        as="code"
        fontFamily="mono"
        bg={options.code.bg}
        px={1}
        borderRadius="sm"
        fontSize={options.code.fontSize}
        color={options.code.color}
      >
        {children}
      </Text>
    ),
    pre: ({ children }) => (
      <Box
        as="pre"
        bg={options.pre.bg}
        p={3}
        borderRadius={options.pre.borderRadius}
        mb={3}
        overflowX="auto"
        fontSize={options.pre.fontSize}
      >
        {children}
      </Box>
    ),
    table: ({ children }) => (
      <Box overflowX="auto" mb={3}>
        <Box
          as="table"
          w="full"
          fontSize={options.table.fontSize}
          css={{ borderCollapse: "collapse" }}
          color={options.table.color}
        >
          {children}
        </Box>
      </Box>
    ),
    thead: ({ children }) => (
      <Box as="thead" bg={options.table.headBg}>
        {children}
      </Box>
    ),
    tbody: ({ children }) => <Box as="tbody">{children}</Box>,
    tr: ({ children }) => (
      <Box
        as="tr"
        css={{ borderBottom: "1px solid" }}
        borderColor={options.borderColor}
      >
        {children}
      </Box>
    ),
    th: ({ children }) => (
      <Box
        as="th"
        px={3}
        py={2}
        fontWeight="semibold"
        textAlign="left"
        color={options.table.color}
        css={{ border: "1px solid" }}
        borderColor={options.borderColor}
      >
        {children}
      </Box>
    ),
    td: ({ children }) => (
      <Box
        as="td"
        px={3}
        py={2}
        color={options.table.color}
        css={{ border: "1px solid" }}
        borderColor={options.borderColor}
      >
        {children}
      </Box>
    ),
  };

  if (options.link) {
    components.a = ({ children, href }) => (
      <chakra.a
        href={href}
        color={options.link?.color}
        fontWeight={options.link?.fontWeight}
        textDecoration={options.link?.textDecoration}
        display="inline"
      >
        {children}
      </chakra.a>
    );
  }

  if (options.blockquote) {
    components.blockquote = ({ children }) => (
      <Box
        as="blockquote"
        borderLeftWidth="3px"
        borderColor={options.blockquote?.borderColor}
        pl={3}
        my={3}
        color={options.blockquote?.color}
      >
        {children}
      </Box>
    );
  }

  return components;
}
