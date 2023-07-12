import type { Meta, StoryObj } from '@storybook/react';

import { Page } from './Page';

const meta: Meta<typeof Page> = {
  title: 'Ant.Design/Dashboard',
  component: Page,
  parameters: {
    // More on how to position stories at: https://storybook.js.org/docs/react/configure/story-layout
    layout: 'fullscreen',
  },
};

export default meta;
type Story = StoryObj<typeof Page>;

export const Default: Story = {};

