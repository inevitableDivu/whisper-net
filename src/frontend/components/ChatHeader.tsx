import React from "react";
import { Shield, Share2, Flame, LogOut, Menu, Sun, Moon } from "lucide-react";

interface ChatHeaderProps {
  roomId: string;
  peerCount: number;
  status?: "connected" | "connecting" | "disconnected" | "burned" | "error";
  theme?: "dark" | "light";
  onCopyInvite: () => void;
  onOpenBurnModal: () => void;
  onLeaveRoom: () => void;
  onToggleSidebar?: () => void;
  onToggleTheme?: () => void;
}

export function ChatHeader({
  roomId,
  peerCount,
  status = "connected",
  theme = "dark",
  onCopyInvite,
  onOpenBurnModal,
  onLeaveRoom,
  onToggleSidebar,
  onToggleTheme,
}: ChatHeaderProps) {
  const shortRoomId = roomId.length > 16 ? `${roomId.slice(0, 10)}...${roomId.slice(-4)}` : roomId;

  return (
    <header className="chat-header">
      <div className="header-left">
        {onToggleSidebar && (
          <button
            type="button"
            className="header-icon-btn mobile-menu-btn"
            onClick={onToggleSidebar}
            title="Toggle Sidebar"
          >
            <Menu size={20} />
          </button>
        )}
        <div className="header-title-block">
          <div className="header-room-title">
            <span className="room-name">{shortRoomId}</span>
            <div className="header-status-badge">
              <span className={`status-pulse-dot ${status === "connecting" ? "status-connecting" : ""}`} />
              <span className="status-text">
                {status === "connecting" ? "Reconnecting..." : `${peerCount} online`}
              </span>
            </div>
          </div>
          <div className="header-security-tag">
            <Shield size={12} className="security-icon" />
            <span>End-to-End Encrypted</span>
          </div>
        </div>
      </div>

      <div className="header-actions">
        {onToggleTheme && (
          <button
            type="button"
            className="header-icon-btn theme-header-btn"
            onClick={onToggleTheme}
            title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
          >
            {theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}
          </button>
        )}

        <button
          type="button"
          className="btn-header-action"
          onClick={onCopyInvite}
          title="Copy invite link to share with friends"
        >
          <Share2 size={16} />
          <span className="action-label">Share Link</span>
        </button>

        <button
          type="button"
          className="btn-header-action btn-header-danger"
          onClick={onOpenBurnModal}
          title="Burn Room permanently"
        >
          <Flame size={16} />
          <span className="action-label">Burn</span>
        </button>

        <button
          type="button"
          className="header-icon-btn"
          onClick={onLeaveRoom}
          title="Leave Room"
        >
          <LogOut size={18} />
        </button>
      </div>
    </header>
  );
}
