import { useEffect, useRef } from "react";
import { contextMenuStore, useContextMenuState } from "../../stores/contextMenuStore";
import "./ContextMenu.css";

export function ContextMenuHost() {
  const state = useContextMenuState();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!state) return;
    const close = () => contextMenuStore.close();
    window.addEventListener("click", close);
    window.addEventListener("blur", close);
    window.addEventListener("contextmenu", close);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("blur", close);
      window.removeEventListener("contextmenu", close);
    };
  }, [state]);

  if (!state) return null;

  const maxLeft = Math.min(state.x, window.innerWidth - 190);
  const maxTop = Math.min(state.y, window.innerHeight - state.items.length * 30 - 16);

  return (
    <div
      ref={ref}
      className="context-menu"
      style={{ left: Math.max(4, maxLeft), top: Math.max(4, maxTop) }}
      onClick={(e) => e.stopPropagation()}
    >
      {state.items.map((item, i) => (
        <button
          key={i}
          type="button"
          disabled={item.disabled}
          className={`context-menu__item${item.danger ? " context-menu__item--danger" : ""}`}
          onClick={() => {
            item.onSelect();
            contextMenuStore.close();
          }}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
