import type { ReactNode } from "react";

interface CardProps {
  image?: string;
  label?: string;
  selected?: boolean;
  onClick?: () => void;
  children?: ReactNode;
}

export function Card({ image, label, selected = false, onClick, children }: CardProps) {
  return (
    <button
      className={`reusable-card ${selected ? "selected" : ""}`}
      onClick={onClick}
      type="button"
      style={{ cursor: onClick ? "pointer" : "default" }}
    >
      {image && (
        <div className="reusable-card-image-wrapper">
          <img src={image} alt={label || "Card image"} className="reusable-card-image" />
        </div>
      )}
      {(label || children) && (
        <div className="reusable-card-content">
          {label && <div className="reusable-card-label">{label}</div>}
          {children}
        </div>
      )}
    </button>
  );
}

export default Card;
