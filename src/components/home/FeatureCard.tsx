import type { ReactNode } from "react";
import "./FeatureCard.css";

interface Props {
  icon: ReactNode;
  title: string;
  description: string;
  actionLabel: string;
  onAction: () => void;
}

export function FeatureCard({ icon, title, description, actionLabel, onAction }: Props) {
  return (
    <div className="feature-card">
      <div className="feature-card__icon">{icon}</div>
      <div className="feature-card__title">{title}</div>
      <div className="feature-card__description">{description}</div>
      <button type="button" className="feature-card__action" onClick={onAction}>
        {actionLabel}
      </button>
    </div>
  );
}
