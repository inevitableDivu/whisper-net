import React, { useRef, useEffect } from "react";
import type { ChatMessage } from "../types/chat.ts";
import { MessageBubble } from "./MessageBubble.tsx";
import { Lock, MessageSquare } from "lucide-react";

interface MessageListProps {
  messages: ChatMessage[];
  systemNotice: string | null;
  isKeyboardOpen?: boolean;
}

export function MessageList({ messages, systemNotice, isKeyboardOpen }: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, systemNotice, isKeyboardOpen]);

  return (
    <div className="message-list-viewport">
      {messages.length === 0 ? (
        <div className="chat-empty-state">
          <div className="empty-icon-wrapper">
            <Lock size={32} className="empty-icon" />
          </div>
          <h3 className="empty-title">End-to-End Encrypted Room</h3>
          <p className="empty-description">
            Messages sent in this room are encrypted directly on your device with your room password. No one outside this room can read them.
          </p>
        </div>
      ) : (
        <div className="messages-container">
          {messages.map((msg) => (
            <MessageBubble key={msg.id} message={msg} />
          ))}
        </div>
      )}

      {systemNotice && (
        <div className="system-notice-banner">
          <span className="system-notice-pill">{systemNotice}</span>
        </div>
      )}

      <div ref={bottomRef} className="messages-anchor" />
    </div>
  );
}
