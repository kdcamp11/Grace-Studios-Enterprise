"use client";

interface Step {
  label: string;
  number: number;
}

const STEPS: Step[] = [
  { number: 1, label: "Team Info" },
  { number: 2, label: "Design System" },
  { number: 3, label: "Details & Logo" },
  { number: 4, label: "Review" },
];

interface BriefProgressProps {
  currentStep: number;
}

export default function BriefProgress({ currentStep }: BriefProgressProps) {
  return (
    <div className="w-full mb-10">
      {/* Step counter */}
      <div className="flex items-center justify-between mb-4">
        <p className="text-xs font-display uppercase tracking-[0.2em] text-gs-muted">
          Step {currentStep} of {STEPS.length}
        </p>
        <p className="text-xs font-display uppercase tracking-[0.15em] text-gs-muted">
          {STEPS[currentStep - 1]?.label}
        </p>
      </div>

      {/* Progress rail */}
      <div className="relative h-px bg-gs-border w-full">
        <div
          className="absolute inset-y-0 left-0 bg-gs-gold transition-all duration-700 ease-out"
          style={{ width: `${((currentStep - 1) / (STEPS.length - 1)) * 100}%` }}
        />

        {/* Step markers */}
        <div className="absolute inset-0 flex items-center justify-between">
          {STEPS.map((step) => {
            const isDone    = step.number < currentStep;
            const isCurrent = step.number === currentStep;
            return (
              <div
                key={step.number}
                className={`
                  w-2 h-2 rounded-full transition-all duration-500
                  ${isDone    ? "bg-gs-gold scale-100" : ""}
                  ${isCurrent ? "bg-gs-gold scale-150 shadow-[0_0_0_3px_#F7F5F0,0_0_0_4px_#C41E1E]" : ""}
                  ${!isDone && !isCurrent ? "bg-gs-border" : ""}
                `}
              />
            );
          })}
        </div>
      </div>

      {/* Step labels — desktop only */}
      <div className="hidden sm:flex justify-between mt-2.5">
        {STEPS.map((step) => {
          const isDone    = step.number < currentStep;
          const isCurrent = step.number === currentStep;
          return (
            <span
              key={step.number}
              className={`text-[10px] font-display uppercase tracking-widest transition-colors duration-300
                ${isCurrent ? "text-gs-gold"  : ""}
                ${isDone    ? "text-gs-white"  : ""}
                ${!isDone && !isCurrent ? "text-gs-border" : ""}
              `}
            >
              {step.label}
            </span>
          );
        })}
      </div>
    </div>
  );
}
