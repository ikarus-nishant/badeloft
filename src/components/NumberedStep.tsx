import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";

export interface NumberedStepProps {
  stepNumber: number;
  title: string;
  summary: string;
  priceDelta?: string;
  isOpen: boolean;
  onToggle: () => void;
  children: ReactNode;
}

export function NumberedStep({
  stepNumber,
  title,
  summary,
  priceDelta,
  isOpen,
  onToggle,
  children,
}: NumberedStepProps) {
  return (
    <div className={`numbered-step ${isOpen ? "open" : "collapsed"}`}>
      <button
        type="button"
        className="numbered-step-header"
        onClick={onToggle}
        aria-expanded={isOpen}
      >
        <div className="numbered-step-badge">{stepNumber}</div>
        <div className="numbered-step-title-wrapper">
          <span className="numbered-step-title">{title}</span>
          <span className="numbered-step-summary">{summary}</span>
        </div>
        <div className="numbered-step-meta">
          {priceDelta && <span className="numbered-step-price">{priceDelta}</span>}
          <span className={`numbered-step-chevron ${isOpen ? "open" : ""}`} aria-hidden="true">
            <ChevronDown size={18} />
          </span>
        </div>
      </button>

      {isOpen && (
        <div className="numbered-step-content">
          {children}
        </div>
      )}
    </div>
  );
}
