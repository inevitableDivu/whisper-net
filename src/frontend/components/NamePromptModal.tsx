import React, { useState } from "react";
import { User, Check, ArrowRight } from "lucide-react";

interface NamePromptModalProps {
  isOpen: boolean;
  initialName?: string;
  onSave: (name: string) => void;
  onClose?: () => void;
  canClose?: boolean;
}

export function NamePromptModal({
  isOpen,
  initialName = "",
  onSave,
  onClose,
  canClose = false,
}: NamePromptModalProps) {
  const [name, setName] = useState(initialName);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (trimmed.length < 2) {
      setError("Name must be at least 2 characters.");
      return;
    }
    if (trimmed.length > 32) {
      setError("Name cannot exceed 32 characters.");
      return;
    }
    setError(null);
    onSave(trimmed);
  };

  return (
    <div className="modal-overlay">
      <div className="modal-container">
        <div className="modal-header">
          <div className="modal-icon-wrapper">
            <User size={24} className="modal-icon" />
          </div>
          <div>
            <h2 className="modal-title">Welcome to WhisperNet</h2>
            <p className="modal-subtitle">
              Enter your display name to start participating in private conversations.
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="modal-form">
          <div className="form-group">
            <label className="form-label">Display Name</label>
            <div className="input-with-icon">
              <input
                type="text"
                autoFocus
                className="text-input"
                placeholder="e.g. Alex"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  if (error) setError(null);
                }}
                maxLength={32}
              />
            </div>
            {error && <p className="form-error">{error}</p>}
          </div>

          <div className="modal-actions">
            {canClose && onClose && (
              <button
                type="button"
                className="btn btn-secondary"
                onClick={onClose}
              >
                Cancel
              </button>
            )}
            <button
              type="submit"
              className="btn btn-primary"
              disabled={name.trim().length < 2}
            >
              <span>Continue</span>
              <ArrowRight size={16} />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
