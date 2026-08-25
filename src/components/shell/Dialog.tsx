import { dialogStore, useDialogRequest } from "../../stores/dialogStore";
import "./Dialog.css";

export function DialogHost() {
  const request = useDialogRequest();
  if (!request) return null;

  return (
    <div className="dialog-overlay" onClick={() => dialogStore.resolve("cancel")}>
      <div className="dialog-box" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-box__title">{request.title}</div>
        {request.message && <div className="dialog-box__message">{request.message}</div>}
        <div className="dialog-box__actions">
          {request.actions.map((action) => (
            <button
              key={action.value}
              type="button"
              className={`dialog-box__button dialog-box__button--${action.variant ?? "default"}`}
              onClick={() => dialogStore.resolve(action.value)}
            >
              {action.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
