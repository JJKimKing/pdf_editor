import { toastStore, useToasts } from "../../stores/toastStore";
import "./Toast.css";

const ICON: Record<string, string> = {
  success: "✓",
  info: "ℹ",
  warning: "!",
  error: "✕",
};

export function ToastHost() {
  const toasts = useToasts();
  if (toasts.length === 0) return null;

  return (
    <div className="toast-host">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast--${t.type}`} onClick={() => toastStore.dismiss(t.id)}>
          <span className="toast__icon">{ICON[t.type]}</span>
          <span className="toast__message">{t.message}</span>
        </div>
      ))}
    </div>
  );
}
