import React from "react";
import type { ChatMessage } from "../types/chat.ts";
import { Check } from "lucide-react";

interface MessageBubbleProps {
  message: ChatMessage;
}

function formatTime(timestamp: number): string {
  try {
    const d = new Date(timestamp);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const { isMe, senderName, text, timestamp } = message;

  return (
    <div className={`message-row ${isMe ? "message-row-self" : "message-row-peer"}`}>
      <div className={`message-bubble ${isMe ? "bubble-self" : "bubble-peer"}`}>
        {!isMe && (
          <div className="message-sender-name">
            {senderName || "Peer"}
          </div>
        )}
        <div className="message-body">
          <span className="message-text">{text}</span>
          <span className="message-meta">
            <span className="message-time">{formatTime(timestamp)}</span>
            {isMe && <Check size={11} className="message-check" />}
          </span>
        </div>
      </div>
    </div>
  );
}
