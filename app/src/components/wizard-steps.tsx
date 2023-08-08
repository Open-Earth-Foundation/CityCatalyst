interface WizardStep {
  name: string,
}

export default function WizardSteps({
  steps,
  currentStep,
  onSelect,
}: {
  steps: WizardStep[],
  currentStep: number,
  onSelect?: (selectedStep: number) => void,
}) {
  return (
    <div className="w-11/12 lg:w-2/6 mx-auto mt-4">
      <div className="bg-gray-200 h-1 flex items-center justify-between">
        <div className="w-1/3 bg-brand h-1 flex items-center">
          <div className="bg-brand h-6 w-6 rounded-full flex items-center justify-center text-white p-2">
            1
          </div>
        </div>
        <div className="w-1/3 flex justify-between bg-brand h-1 items-center relative">
          <div className="absolute right-0 -mr-2">
            <div className="relative bg-white px-2 py-1 mt-16 -mr-12">
              <p tabIndex={0} className="text-md font-bold">Step 3: Analyzing</p>
            </div>
          </div>
          <div className="bg-brand h-6 w-6 rounded-full flex items-center justify-center -ml-2 text-white p-2">
            2
          </div>
          <div className="bg-white h-6 w-6 rounded-full flex items-center justify-center -mr-3 relative">
            <div className="h-3 w-3 bg-brand rounded-full"></div>
          </div>
        </div>
        <div className="w-1/3 flex justify-end">
          <div className="bg-white h-6 w-6 rounded-full shadow"></div>
        </div>
      </div>
    </div>
  )
}

