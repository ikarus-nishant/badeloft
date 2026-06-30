interface StepperProps {
  steps: string[];
  currentStep: number;
  onStepClick: (step: number) => void;
}

export function Stepper({ steps, currentStep, onStepClick }: StepperProps) {
  return (
    <nav className="stepper" aria-label="Configuration steps">
      {steps.map((step, index) => (
        <button
          className={`stepper-item ${index === currentStep ? "active" : ""} ${index < currentStep ? "complete" : ""}`}
          key={step}
          onClick={() => onStepClick(index)}
          type="button"
        >
          <span>{index + 1}</span>
          {step}
        </button>
      ))}
    </nav>
  );
}
