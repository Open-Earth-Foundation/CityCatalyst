import { Box, Heading, Text, VStack, HStack, Stack } from '@chakra-ui/react';

// You may want to import Poppins and Open Sans fonts in your _app.tsx or index.html
// Example: https://fonts.googleapis.com/css2?family=Open+Sans:wght@400;600&family=Poppins:wght@400;500;600&display=swap

const baseDark = '#00001F';
const baseLight = '#FFFFFF';

const fontSamples = [
  {
    section: 'Display',
    description:
      'As the largest text on the screen, display styles are reserved for short, important text or numerals. They work best on large screens.',
    samples: [
      {
        label: 'Display/large',
        fontFamily: 'Poppins',
        fontWeight: 600,
        fontSize: '57px',
        lineHeight: '64px',
        details: ['Poppins', 'Semi bold 57px', 'Line height 64px', 'Letter spacing 0'],
      },
      {
        label: 'Display/medium',
        fontFamily: 'Poppins',
        fontWeight: 600,
        fontSize: '45px',
        lineHeight: '52px',
        details: ['Poppins', 'Semi bold 45px', 'Line height 52px', 'Letter spacing 0'],
      },
      {
        label: 'Display/small',
        fontFamily: 'Poppins',
        fontWeight: 600,
        fontSize: '36px',
        lineHeight: '44px',
        details: ['Poppins', 'Semi bold 36px', 'Line height 44px', 'Letter spacing 0'],
      },
    ],
  },
  {
    section: 'Headline',
    description:
      'Headlines are best-suited for short, high-emphasis text on smaller screens. These styles can be good for marking primary passages of text or important regions of content.',
    samples: [
      {
        label: 'Headline/large',
        fontFamily: 'Poppins',
        fontWeight: 600,
        fontSize: '32px',
        lineHeight: '40px',
        details: ['Poppins', 'Semi bold 32px', 'Line height 40px', 'Letter spacing 0'],
      },
      {
        label: 'Headline/medium',
        fontFamily: 'Poppins',
        fontWeight: 600,
        fontSize: '28px',
        lineHeight: '36px',
        details: ['Poppins', 'Semi bold 28px', 'Line height 36px', 'Letter spacing 0'],
      },
      {
        label: 'Headline/small',
        fontFamily: 'Poppins',
        fontWeight: 600,
        fontSize: '24px',
        lineHeight: '32px',
        details: ['Poppins', 'Semi bold 24px', 'Line height 32px', 'Letter spacing 0'],
      },
    ],
  },
  {
    section: 'Title',
    description:
      'Titles are smaller than headline styles, and should be used for medium-emphasis text that remains relatively short.',
    samples: [
      {
        label: 'Title/large',
        fontFamily: 'Poppins',
        fontWeight: 600,
        fontSize: '22px',
        lineHeight: '28px',
        details: ['Poppins', 'Semi bold 22px', 'Line height 28px', 'Letter spacing 0'],
      },
      {
        label: 'Title/medium',
        fontFamily: 'Poppins',
        fontWeight: 600,
        fontSize: '16px',
        lineHeight: '24px',
        details: ['Poppins', 'Semi bold 16px', 'Line height 24px', 'Letter spacing 0'],
      },
      {
        label: 'Title/small',
        fontFamily: 'Poppins',
        fontWeight: 600,
        fontSize: '14px',
        lineHeight: '20px',
        details: ['Poppins', 'Semi bold 14px', 'Line height 20px', 'Letter spacing 0'],
      },
    ],
  },
  {
    section: 'Label',
    description:
      'Label styles are smaller, utilitarian styles, used for things like the text inside components or for very small text in the content body, such as captions.',
    samples: [
      {
        label: 'Label/large',
        fontFamily: 'Poppins',
        fontWeight: 500,
        fontSize: '14px',
        lineHeight: '20px',
        details: ['Poppins', 'Medium 14px', 'Line height 20px', 'Letter spacing 0.5px'],
      },
      {
        label: 'Label/medium',
        fontFamily: 'Poppins',
        fontWeight: 500,
        fontSize: '12px',
        lineHeight: '16px',
        details: ['Poppins', 'Medium 12px', 'Line height 16px', 'Letter spacing 0.5px'],
      },
      {
        label: 'Label/small',
        fontFamily: 'Poppins',
        fontWeight: 500,
        fontSize: '11px',
        lineHeight: '16px',
        details: ['Poppins', 'Medium 11px', 'Line height 16px', 'Letter spacing 0.5px'],
      },
    ],
  },
  {
    section: 'Body',
    description: 'Body styles are used for longer passages of text in the product.',
    samples: [
      {
        label: 'Body/extra-large',
        fontFamily: 'Open Sans',
        fontWeight: 400,
        fontSize: '22px',
        lineHeight: '32px',
        details: ['Open Sans', 'Regular 22px', 'Line height 32px', 'Letter spacing 0.5px'],
      },
      {
        label: 'Body/large',
        fontFamily: 'Open Sans',
        fontWeight: 400,
        fontSize: '16px',
        lineHeight: '24px',
        details: ['Open Sans', 'Regular 16px', 'Line height 24px', 'Letter spacing 0.5px'],
      },
      {
        label: 'Body/medium',
        fontFamily: 'Open Sans',
        fontWeight: 400,
        fontSize: '14px',
        lineHeight: '20px',
        details: ['Open Sans', 'Regular 14px', 'Line height 20px', 'Letter spacing 0.5px'],
      },
      {
        label: 'Body/small',
        fontFamily: 'Open Sans',
        fontWeight: 400,
        fontSize: '12px',
        lineHeight: '16px',
        details: ['Open Sans', 'Regular 12px', 'Line height 16px', 'Letter spacing 0.5px'],
      },
    ],
  },
  {
    section: 'Button',
    description:
      'Button text is a call to action used by different types of buttons (such as text, outlined and contained buttons) and in tabs, dialogs, and cards.',
    samples: [
      {
        label: 'Button/large',
        fontFamily: 'Poppins',
        fontWeight: 600,
        fontSize: '20px',
        lineHeight: '24px',
        textTransform: 'uppercase',
        letterSpacing: '1.25px',
        details: ['Poppins', 'Semi bold 20px', 'Line height 24px', 'Letter spacing 1.25px'],
      },
      {
        label: 'Button/medium',
        fontFamily: 'Poppins',
        fontWeight: 600,
        fontSize: '14px',
        lineHeight: '16px',
        textTransform: 'uppercase',
        letterSpacing: '1.25px',
        details: ['Poppins', 'Semi bold 14px', 'Line height 16px', 'Letter spacing 1.25px'],
      },
      {
        label: 'Button/small',
        fontFamily: 'Poppins',
        fontWeight: 600,
        fontSize: '12px',
        lineHeight: '16px',
        textTransform: 'uppercase',
        letterSpacing: '1.25px',
        details: ['Poppins', 'Semi bold 12px', 'Line height 16px', 'Letter spacing 1.25px'],
      },
    ],
  },
  {
    section: 'Caption and overline',
    description:
      'Caption and overline text are the smallest font sizes. They are used sparingly to annotate imagery or to introduce a headline.',
    samples: [
      {
        label: 'Caption',
        fontFamily: 'Poppins',
        fontWeight: 400,
        fontSize: '12px',
        lineHeight: '16px',
        details: ['Open Sans', 'Regular 12px', 'Line height 16px', 'Letter spacing 0.5px'],
      },
      {
        label: 'Overline',
        fontFamily: 'Poppins',
        fontWeight: 600,
        fontSize: '10px',
        lineHeight: '16px',
        textTransform: 'uppercase',
        letterSpacing: '1.5px',
        details: ['Poppins', 'Bold 10px', 'Line height 16px', 'Letter spacing 1.5px'],
      },
    ],
  },
];

export default function TypographyGuide() {
  return (
    <Box bg={baseLight} color={baseDark} px={20} py={20}>
      <VStack align="start" gap={24} w="full">
        <Box>
          <Heading fontFamily="Poppins" fontWeight={600} fontSize="45px" lineHeight="52px" mb={2}>
            Typography
          </Heading>
          <Text fontFamily="Open Sans" fontSize="22px" lineHeight="32px">
            Here you can see the list of text styles we use in the CityCatalyst product and their uses.
          </Text>
        </Box>
        {fontSamples.map((section) => (
          <Box key={section.section} w="1200px">
            <Heading fontFamily="Poppins" fontWeight={600} fontSize="32px" lineHeight="40px" mb={2}>
              {section.section}
            </Heading>
            <Text fontFamily="Open Sans" fontSize="16px" lineHeight="24px" mb={8}>
              {section.description}
            </Text>
            <Stack align="start" gap={9}>
              {section.samples.map((sample) => (
                <HStack key={sample.label} align="center" gap={12} w="full">
                  <Text
                    fontFamily={sample.fontFamily}
                    fontWeight={sample.fontWeight}
                    fontSize={sample.fontSize}
                    lineHeight={sample.lineHeight}
                    textTransform={sample.textTransform}
                    letterSpacing={sample.letterSpacing}
                    w="600px"
                  >
                    {sample.label}
                  </Text>
                  <VStack align="start" gap={0} fontSize="16px">
                    {sample.details.map((d, i) => (
                      <Text key={i} fontFamily="Open Sans" fontSize="16px" lineHeight="24px">
                        {d}
                      </Text>
                    ))}
                  </VStack>
                </HStack>
              ))}
            </Stack>
          </Box>
        ))}
      </VStack>
    </Box>
  );
}
