import type { ReactNode } from "react";
import "./EmptyState.css";

interface Props {
  icon: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}

/** Shared empty-state shape used by every workspace page (product spec §44). */
export function EmptyState({ icon, title, description, action }: Props) {
  return (
    <div className="empty-state">
      <div className="empty-state__icon">{icon}</div>
      <div className="empty-state__title">{title}</div>
      {description && <div className="empty-state__description">{description}</div>}
      {action}
    </div>
  );
}
