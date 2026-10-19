import type { Confirmation } from "./confirmAction";

/** Browser dialog supports keyboard confirmation/cancel; RN Alert has no web UI. */
export function confirmAction({ title, message, onConfirm }: Confirmation) {
  if (window.confirm(`${title}\n\n${message}`)) onConfirm();
}
