import React, { useState, useRef, useEffect } from "react";
import { Send } from "lucide-react";

interface MessageComposerProps {
  onSendMessage: (text: string) => void;
  disabled?: boolean;
}

export function MessageComposer({ onSendMessage, disabled = false }: MessageComposerProps) {
  const [text, setText] = useState("");
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  const handleSend = () => {
    const trimmed = text.trim();
    if (!trimmed || disabled) return;
    onSendMessage(trimmed);
    setText("");
    if (inputRef.current) {
      inputRef.current.style.height = "auto";
      inputRef.current.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setText(e.target.value);
    // Auto-grow height up to 140px
    const target = e.target;
    target.style.height = "auto";
    target.style.height = `${Math.min(target.scrollHeight, 140)}px`;
  };

  const handleFocus = () => {
    // When virtual keyboard opens on mobile, prevent unwanted window scroll
    requestAnimationFrame(() => {
      if (window.scrollY !== 0) {
        window.scrollTo(0, 0);
      }
    });
    setTimeout(() => {
      if (window.scrollY !== 0) {
        window.scrollTo(0, 0);
      }
    }, 150);
  };

  return (
    <div className="message-composer-wrapper">
      <div className="composer-container">
        <textarea
          ref={inputRef}
          rows={1}
          value={text}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          onFocus={handleFocus}
          placeholder="Type a message..."
          disabled={disabled}
          className="composer-textarea"
        />
        <button
          type="button"
          onClick={handleSend}
          disabled={!text.trim() || disabled}
          className="composer-send-btn"
          title="Send message (Enter)"
        >
          <Send size={18} />
        </button>
      </div>
    </div>
  );
}
