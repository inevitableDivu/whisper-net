import React from "react";
import { Check, AlertCircle, Info } from "lucide-react";

export interface ToastMessage {
  id: string;
  type: "success" | "error" | "info";
  text: string;
}

interface ToastProps {
  toast: ToastMessage | null;
  onDismiss?: () => void;
}

export function Toast({ toast, onDismiss }: ToastProps) {
  if (!toast) return null;

  return (
    <div className={`toast-container toast-${toast.type}`} onClick={onDismiss}>
      <div className="toast-icon">
        {toast.type === "success" && <Check size={16} />}
        {toast.type === "error" && <AlertCircle size={16} />}
        {toast.type === "info" && <Info size={16} />}
      </div>
      <span className="toast-text">{toast.text}</span>
    </div>
  );
}
