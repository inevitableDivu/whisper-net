import React, { useState } from "react";
import {
  Shield,
  Lock,
  Copy,
  Check,
  Flame,
  LogOut,
  Edit2,
  Eye,
  EyeOff,
  Sun,
  Moon,
  Fingerprint,
} from "lucide-react";
import type { UserProfile } from "../types/chat.ts";

interface SidebarProps {
  roomId: string;
  password: string;
  peerCount: number;
  userProfile: UserProfile;
  theme?: "dark" | "light";
  isOpen: boolean;
  onClose: () => void;
  onCopyInvite: () => void;
  onOpenBurnModal: () => void;
  onLeaveRoom: () => void;
  onEditName: () => void;
  onToggleTheme?: () => void;
}

export function Sidebar({
  roomId,
  password,
  peerCount,
  userProfile,
  theme = "dark",
  isOpen,
  onClose,
  onCopyInvite,
  onOpenBurnModal,
  onLeaveRoom,
  onEditName,
  onToggleTheme,
}: SidebarProps) {
  const [showPassword, setShowPassword] = useState(false);
  const [copiedId, setCopiedId] = useState(false);
  const [copiedUserId, setCopiedUserId] = useState(false);

  const handleCopyRoomId = () => {
    navigator.clipboard.writeText(roomId);
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 2000);
  };

  const handleCopyUserId = () => {
    navigator.clipboard.writeText(userProfile.id);
    setCopiedUserId(true);
    setTimeout(() => setCopiedUserId(false), 2000);
  };

  const userInitial = userProfile.name ? userProfile.name.charAt(0).toUpperCase() : "?";
  const shortUserId = userProfile.id ? `${userProfile.id.slice(0, 8)}...` : "";

  return (
    <>
      {isOpen && <div className="sidebar-backdrop" onClick={onClose} />}
      <aside className={`chat-sidebar ${isOpen ? "sidebar-open" : ""}`}>
        {/* Brand */}
        <div className="sidebar-brand">
          <div className="brand-logo-wrapper">
            <Lock size={18} className="brand-icon" />
          </div>
          <div className="brand-details">
            <span className="brand-title">WhisperNet</span>
            <span className="brand-version">Zero-Knowledge E2EE</span>
          </div>
          {onToggleTheme && (
            <button
              type="button"
              className="theme-toggle-btn"
              onClick={onToggleTheme}
              title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
            >
              {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
            </button>
          )}
        </div>

        {/* User Card */}
        <div className="sidebar-user-card">
          <div
            className="user-avatar"
            style={{ backgroundColor: userProfile.avatarColor }}
          >
            {userInitial}
          </div>
          <div className="user-info">
            <span className="user-name">{userProfile.name}</span>
            <button
              type="button"
              className="user-uuid-badge"
              onClick={handleCopyUserId}
              title="Click to copy your persistent client UUID"
            >
              <Fingerprint size={10} />
              <span>{copiedUserId ? "Copied UUID" : shortUserId}</span>
            </button>
          </div>
          <button
            type="button"
            className="user-edit-btn"
            onClick={onEditName}
            title="Edit display name"
          >
            <Edit2 size={14} />
          </button>
        </div>

        {/* Room Info Section */}
        <div className="sidebar-section">
          <div className="sidebar-section-title">ACTIVE CONVERSATION</div>
          <div className="room-info-card">
            <div className="room-info-row">
              <span className="room-info-label">Room ID</span>
              <button
                type="button"
                className="btn-copy-code"
                onClick={handleCopyRoomId}
                title="Click to copy Room ID"
              >
                <span>{roomId.slice(0, 12)}...</span>
                {copiedId ? <Check size={12} /> : <Copy size={12} />}
              </button>
            </div>

            <div className="room-info-row">
              <span className="room-info-label">Room Key</span>
              <div className="password-display-wrapper">
                <span className="password-masked">
                  {showPassword ? password : "••••••••••••"}
                </span>
                <button
                  type="button"
                  className="btn-toggle-eye"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? <EyeOff size={13} /> : <Eye size={13} />}
                </button>
              </div>
            </div>

            <div className="room-info-row">
              <span className="room-info-label">Participants</span>
              <span className="members-badge">
                <span className="status-dot-active" />
                {peerCount} Connected
              </span>
            </div>

            <button
              type="button"
              className="btn btn-primary btn-full-width mt-3"
              onClick={onCopyInvite}
            >
              <Copy size={15} />
              <span>Copy Invite Link</span>
            </button>
          </div>
        </div>

        {/* Privacy Note */}
        <div className="sidebar-security-badge">
          <Shield size={16} className="security-badge-icon" />
          <div className="security-badge-text">
            <strong>Client Encrypted:</strong> All messages & keys are derived and encrypted on your device. The server only sees encrypted ciphertext.
          </div>
        </div>

        {/* Footer Actions */}
        <div className="sidebar-footer">
          <button
            type="button"
            className="btn btn-secondary btn-full-width"
            onClick={onLeaveRoom}
          >
            <LogOut size={15} />
            <span>Leave Conversation</span>
          </button>

          <button
            type="button"
            className="btn btn-danger-outline btn-full-width"
            onClick={onOpenBurnModal}
          >
            <Flame size={15} />
            <span>Burn Room & History</span>
          </button>
        </div>
      </aside>
    </>
  );
}
