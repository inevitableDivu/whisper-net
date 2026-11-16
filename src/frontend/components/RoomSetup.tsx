import React, { useState, useEffect } from "react";
import {
  Lock,
  Shield,
  Key,
  ArrowRight,
  Sparkles,
  User,
  Edit2,
  Eye,
  EyeOff,
  Sun,
  Moon,
} from "lucide-react";
import type { UserProfile } from "../types/chat.ts";
import { parseRoomInviteHash } from "../../crypto/client-crypto.ts";

interface RoomSetupProps {
  userProfile: UserProfile;
  theme?: "dark" | "light";
  isConnecting: boolean;
  errorMessage: string | null;
  onEditName: () => void;
  onCreateRoom: (password: string) => void;
  onJoinRoom: (roomId: string, password: string) => void;
  onToggleTheme?: () => void;
}

export function RoomSetup({
  userProfile,
  theme = "dark",
  isConnecting,
  errorMessage,
  onEditName,
  onCreateRoom,
  onJoinRoom,
  onToggleTheme,
}: RoomSetupProps) {
  const [tab, setTab] = useState<"create" | "join">("create");
  const [roomId, setRoomId] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  // Check URL fragment for invite links
  useEffect(() => {
    const parsed = parseRoomInviteHash(window.location.hash);
    if (parsed.roomId && parsed.password) {
      setRoomId(parsed.roomId);
      setPassword(parsed.password);
      setTab("join");
    }
  }, []);

  // Clear inputs and sanitize URL fragment if room was burned
  useEffect(() => {
    if (errorMessage && errorMessage.toLowerCase().includes("burned")) {
      setRoomId("");
      setPassword("");
      if (typeof window !== "undefined" && window.history?.replaceState) {
        window.history.replaceState(null, "", window.location.pathname);
      }
      window.location.hash = "";
    }
  }, [errorMessage]);

  const generateRandomPassword = () => {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%&*";
    const bytes = new Uint8Array(20);
    crypto.getRandomValues(bytes);
    let pwd = "";
    for (let i = 0; i < bytes.length; i++) {
      pwd += chars[bytes[i]! % chars.length];
    }
    setPassword(pwd);
    setShowPassword(true);
    setValidationError(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError(null);

    const trimmedPassword = password.trim();
    if (!trimmedPassword) {
      setValidationError("Please provide a password for the room.");
      return;
    }

    if (tab === "create") {
      onCreateRoom(trimmedPassword);
    } else {
      const trimmedRoomId = roomId.trim();
      if (!trimmedRoomId) {
        setValidationError("Please enter the Room ID to join.");
        return;
      }
      onJoinRoom(trimmedRoomId, trimmedPassword);
    }
  };

  const userInitial = userProfile.name ? userProfile.name.charAt(0).toUpperCase() : "?";

  return (
    <div className="setup-container">
      <div className="setup-card">
        {onToggleTheme && (
          <button
            type="button"
            className="setup-theme-btn"
            onClick={onToggleTheme}
            title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
          >
            {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
          </button>
        )}

        {/* Brand Header */}
        <div className="setup-brand-header">
          <div className="setup-logo-pill">
            <Lock size={22} className="setup-lock-icon" />
          </div>
          <h1 className="setup-app-title">WhisperNet</h1>
          <p className="setup-app-subtitle">
            Zero-knowledge, end-to-end encrypted messaging. Keys and chats never leave your device unencrypted.
          </p>
        </div>

        {/* User Identity Pill */}
        <div className="setup-user-badge">
          <div
            className="user-avatar-sm"
            style={{ backgroundColor: userProfile.avatarColor }}
          >
            {userInitial}
          </div>
          <div className="setup-user-info">
            <span className="setup-user-label">Chatting as</span>
            <span className="setup-user-name">{userProfile.name}</span>
          </div>
          <button
            type="button"
            className="setup-edit-name-btn"
            onClick={onEditName}
            title="Change display name"
          >
            <Edit2 size={13} />
            <span>Change</span>
          </button>
        </div>

        {/* Mode Tabs */}
        <div className="setup-tabs">
          <button
            type="button"
            className={`setup-tab-btn ${tab === "create" ? "active" : ""}`}
            onClick={() => {
              setTab("create");
              setValidationError(null);
            }}
          >
            Create New Room
          </button>
          <button
            type="button"
            className={`setup-tab-btn ${tab === "join" ? "active" : ""}`}
            onClick={() => {
              setTab("join");
              setValidationError(null);
            }}
          >
            Join Existing Room
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="setup-form">
          {tab === "join" && (
            <div className="form-group">
              <label className="form-label">Room ID</label>
              <input
                type="text"
                className="text-input"
                placeholder="e.g. room_1234567890abcdef"
                value={roomId}
                onChange={(e) => setRoomId(e.target.value)}
                required
              />
            </div>
          )}

          <div className="form-group">
            <div className="form-label-row">
              <label className="form-label">Room Password</label>
              {tab === "create" && (
                <button
                  type="button"
                  className="btn-generate-link"
                  onClick={generateRandomPassword}
                >
                  <Sparkles size={13} />
                  <span>Generate Key</span>
                </button>
              )}
            </div>
            <div className="password-input-container">
              <input
                type={showPassword ? "text" : "password"}
                className="text-input password-input"
                placeholder={
                  tab === "create"
                    ? "Enter or generate a secret password"
                    : "Enter the room password"
                }
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <button
                type="button"
                className="btn-toggle-eye-input"
                onClick={() => setShowPassword(!showPassword)}
                title={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            <span className="form-hint">
              {tab === "create"
                ? "This password will be shared in your invite link to let friends decrypt the chat."
                : "Required to derive the AES-256 decryption key on your device."}
            </span>
          </div>

          {(validationError || errorMessage) && (
            <div className="setup-error-banner">
              {validationError || errorMessage}
            </div>
          )}

          <button
            type="submit"
            className="btn btn-primary btn-full-width btn-lg mt-2"
            disabled={isConnecting}
          >
            {isConnecting ? (
              <span>Deriving Keys & Connecting...</span>
            ) : (
              <>
                <span>{tab === "create" ? "Create & Enter Room" : "Join Secure Room"}</span>
                <ArrowRight size={16} />
              </>
            )}
          </button>
        </form>

        {/* Security Footer Notice */}
        <div className="setup-security-footer">
          <Shield size={14} className="security-icon-sm" />
          <span>Zero-Knowledge: Server never receives your password or plaintext messages.</span>
        </div>
      </div>
    </div>
  );
}
