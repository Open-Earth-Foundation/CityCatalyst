import WizardSteps from "../components/wizard-steps";
import { Meta, StoryObj } from "@storybook/react";

const meta: Meta<typeof WizardSteps> = {
  title: "CityCatalyst/WizardSteps",
  component: WizardSteps,
  tags: ["onboarding", "wizard"],
};

export default meta;
type Story = StoryObj<typeof WizardSteps>;

export const Default: Story = {
  args: {
    steps: [
      { title: "Setting up your inventory" },
      { title: "Confirm City's Information" },
    ],
    currentStep: 0,
  },
};
