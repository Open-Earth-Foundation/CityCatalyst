import type { Meta, StoryObj } from '@storybook/react';
import { Header } from './Page';

const meta: Meta<typeof Header> = {
  title: 'Page',
  component: Header,
  parameters: {
    // More on how to position stories at: https://storybook.js.org/docs/react/configure/story-layout
    layout: 'fullscreen',
  },
};

export default meta;
type Story = StoryObj<typeof Header>;


