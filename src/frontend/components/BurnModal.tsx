import React from "react";
import { Flame, AlertTriangle, X } from "lucide-react";

interface BurnModalProps {
  isOpen: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function BurnModal({ isOpen, onConfirm, onCancel }: BurnModalProps) {
  if (!isOpen) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-container burn-modal">
        <button className="modal-close-btn" onClick={onCancel}>
          <X size={18} />
        </button>
        <div className="modal-header">
          <div className="modal-icon-wrapper danger">
            <Flame size={24} className="modal-icon danger" />
          </div>
          <div>
            <h2 className="modal-title">Burn Room Session?</h2>
            <p className="modal-subtitle">
              This will permanently delete this conversation and wipe all encrypted message records for all participants immediately. This action cannot be reversed.
            </p>
          </div>
        </div>

        <div className="modal-actions">
          <button type="button" className="btn btn-secondary" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="btn btn-danger" onClick={onConfirm}>
            <Flame size={16} />
            <span>Confirm & Burn Room</span>
          </button>
        </div>
      </div>
    </div>
  );
}
