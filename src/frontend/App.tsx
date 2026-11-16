import React, { useState, useEffect, useCallback } from "react";
import { useUserProfile } from "./hooks/useUserProfile.ts";
import { useChatSession } from "./hooks/useChatSession.ts";
import { NamePromptModal } from "./components/NamePromptModal.tsx";
import { RoomSetup } from "./components/RoomSetup.tsx";
import { ChatHeader } from "./components/ChatHeader.tsx";
import { Sidebar } from "./components/Sidebar.tsx";
import { MessageList } from "./components/MessageList.tsx";
import { MessageComposer } from "./components/MessageComposer.tsx";
import { BurnModal } from "./components/BurnModal.tsx";
import { Toast, type ToastMessage } from "./components/Toast.tsx";
import { InsecureContextBanner } from "./components/InsecureContextBanner.tsx";
import {
  buildRoomInviteLink,
  parseRoomInviteHash,
  safeRandomUUID,
  isSubtleCryptoAvailable,
} from "../crypto/client-crypto.ts";
import { cryptoService } from "./services/crypto-service.ts";
import { useVisualViewport } from "./hooks/useVisualViewport.ts";

export function App() {
  const { profile, userName, hasName, isLoading, theme, toggleTheme, updateName } = useUserProfile();
  const chat = useChatSession();
  const { isKeyboardOpen } = useVisualViewport();

  const [isEditingName, setIsEditingName] = useState(false);
  const [isBurnModalOpen, setIsBurnModalOpen] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const [pendingJoin, setPendingJoin] = useState<{ roomId: string; password: string } | null>(null);

  const showToast = useCallback((text: string, type: "success" | "error" | "info" = "success") => {
    const id = Date.now().toString();
    setToast({ id, text, type });
    setTimeout(() => {
      setToast((curr) => (curr?.id === id ? null : curr));
    }, 3000);
  }, []);

  // Check URL fragment on initial mount
  useEffect(() => {
    const parsed = parseRoomInviteHash(window.location.hash);
    if (parsed.roomId && parsed.password) {
      if (hasName && profile.id) {
        handleJoinRoom(parsed.roomId, parsed.password);
      } else {
        setPendingJoin({ roomId: parsed.roomId, password: parsed.password });
      }
    }
  }, [hasName, profile.id]);

  const handleSaveName = async (name: string) => {
    await updateName(name);
    setIsEditingName(false);

    // If there was a pending room join from an invite link, join it now
    if (pendingJoin) {
      const { roomId, password } = pendingJoin;
      setPendingJoin(null);
      await chat.connectAndJoin({
        roomId,
        password,
        userName: name,
        userId: profile.id,
      });
      window.location.hash = `room=${roomId}&pwd=${encodeURIComponent(password)}`;
    }
  };

  const handleCreateRoom = async (password: string) => {
    if (!hasName) {
      setIsEditingName(true);
      return;
    }

    try {
      const generatedRoomId = "room_" + safeRandomUUID().replace(/-/g, "");
      const derivation = await cryptoService.deriveKey(password, generatedRoomId);

      // Register room with authVerifierHash on server
      const res = await fetch("/api/rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roomId: generatedRoomId,
          maxPeers: 10,
          authVerifierHash: derivation.authVerifierHash,
          ttlSeconds: 86400,
        }),
      });

      if (!res.ok) {
        throw new Error("Failed to register room on server");
      }

      window.location.hash = `room=${generatedRoomId}&pwd=${encodeURIComponent(password)}`;

      await chat.connectAndJoin({
        roomId: generatedRoomId,
        password,
        userName,
        userId: profile.id,
      });
    } catch (err: any) {
      showToast(err.message || "Failed to create room", "error");
    }
  };

  const handleJoinRoom = async (roomId: string, password: string) => {
    if (!hasName) {
      setPendingJoin({ roomId, password });
      setIsEditingName(true);
      return;
    }

    window.location.hash = `room=${roomId}&pwd=${encodeURIComponent(password)}`;

    await chat.connectAndJoin({
      roomId,
      password,
      userName,
      userId: profile.id,
    });
  };

  const handleCopyInviteLink = () => {
    if (!chat.roomId || !chat.password) return;
    const link = buildRoomInviteLink(window.location.origin, chat.roomId, chat.password);
    navigator.clipboard.writeText(link);
    showToast("Invite link copied to clipboard! Share it with your friend.");
  };

  const handleConfirmBurn = () => {
    chat.burnRoom();
    setIsBurnModalOpen(false);
    showToast("Room burned and encrypted history wiped.", "info");
  };

  const isInRoom = Boolean(chat.roomId) && chat.status !== "burned" && chat.status !== "disconnected";

  if (isLoading) {
    return (
      <div className="app-loading-screen">
        <div className="loading-spinner" />
      </div>
    );
  }

  return (
    <div className="app-shell">
      {/* Banner if browser disabled WebCrypto due to insecure HTTP origin */}
      {!isSubtleCryptoAvailable() && <InsecureContextBanner />}

      {/* Name Prompt Modal: Shown upfront if user hasn't chosen a name or clicked Change */}
      <NamePromptModal
        isOpen={!hasName || isEditingName}
        initialName={userName}
        canClose={hasName}
        onSave={handleSaveName}
        onClose={() => setIsEditingName(false)}
      />

      {/* Burn Confirmation Modal */}
      <BurnModal
        isOpen={isBurnModalOpen}
        onConfirm={handleConfirmBurn}
        onCancel={() => setIsBurnModalOpen(false)}
      />

      {/* Non-intrusive feedback toasts */}
      <Toast toast={toast} onDismiss={() => setToast(null)} />

      {isInRoom ? (
        <div className="chat-layout">
          <Sidebar
            roomId={chat.roomId}
            password={chat.password}
            peerCount={chat.peerCount}
            userProfile={profile}
            theme={theme}
            isOpen={isSidebarOpen}
            onClose={() => setIsSidebarOpen(false)}
            onCopyInvite={handleCopyInviteLink}
            onOpenBurnModal={() => setIsBurnModalOpen(true)}
            onLeaveRoom={chat.leaveRoom}
            onEditName={() => setIsEditingName(true)}
            onToggleTheme={toggleTheme}
          />

          <main className="chat-main">
            <ChatHeader
              roomId={chat.roomId}
              peerCount={chat.peerCount}
              status={chat.status}
              theme={theme}
              onCopyInvite={handleCopyInviteLink}
              onOpenBurnModal={() => setIsBurnModalOpen(true)}
              onLeaveRoom={chat.leaveRoom}
              onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
              onToggleTheme={toggleTheme}
            />

            <MessageList
              messages={chat.messages}
              systemNotice={chat.systemNotice}
              isKeyboardOpen={isKeyboardOpen}
            />

            <MessageComposer
              onSendMessage={chat.sendMessage}
              disabled={chat.status !== "connected"}
            />
          </main>
        </div>
      ) : (
        <RoomSetup
          userProfile={profile}
          theme={theme}
          isConnecting={chat.status === "connecting"}
          errorMessage={chat.errorMessage}
          onEditName={() => setIsEditingName(true)}
          onCreateRoom={handleCreateRoom}
          onJoinRoom={handleJoinRoom}
          onToggleTheme={toggleTheme}
        />
      )}
    </div>
  );
}
