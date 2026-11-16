import { useState, useRef, useEffect, useCallback } from "react";
import type {
  ChatMessage,
  ConnectionStatus,
  RoomConnectionConfig,
} from "../types/chat.ts";
import type {
  ServerMessage,
  JoinedEvent,
  RelayedMessageEvent,
} from "../../types/contracts.ts";
import { cryptoService } from "../services/crypto-service.ts";

export function useChatSession() {
  const [roomId, setRoomId] = useState("");
  const [password, setPassword] = useState("");
  const [userName, setUserName] = useState("");
  const [myPeerId, setMyPeerId] = useState("");
  const [peerCount, setPeerCount] = useState(1);
  const [status, setStatus] = useState<ConnectionStatus>("disconnected");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [systemNotice, setSystemNotice] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const encryptionKeyRef = useRef<CryptoKey | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const sequenceRef = useRef(1);
  const isBurnedRef = useRef(false);
  const isExplicitLeaveRef = useRef(false);
  const userIdRef = useRef<string>("");
  const activeConfigRef = useRef<RoomConnectionConfig | null>(null);
  const heartbeatTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttemptsRef = useRef(0);

  const showSystemNotice = useCallback((text: string, durationMs = 3500) => {
    setSystemNotice(text);
    setTimeout(() => {
      setSystemNotice((curr) => (curr === text ? null : curr));
    }, durationMs);
  }, []);

  const connectAndJoin = useCallback(
    async (config: RoomConnectionConfig) => {
      setStatus("connecting");
      setErrorMessage(null);
      isBurnedRef.current = false;
      isExplicitLeaveRef.current = false;
      userIdRef.current = config.userId;
      activeConfigRef.current = config;

      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }

      try {
        setRoomId(config.roomId);
        setPassword(config.password);
        setUserName(config.userName);

        // 1. Derive encryption key and zero-knowledge auth proof
        const derivation = await cryptoService.deriveKey(config.password, config.roomId);
        encryptionKeyRef.current = derivation.encryptionKey;

        // 2. Open WebSocket
        const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
        const wsUrl = `${protocol}//${window.location.host}/ws`;

        // If an existing socket is open, clean it up
        if (wsRef.current) {
          try {
            wsRef.current.onclose = null;
            wsRef.current.onerror = null;
            wsRef.current.close();
          } catch {
            // ignore
          }
        }

        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          reconnectAttemptsRef.current = 0;
          ws.send(
            JSON.stringify({
              type: "join",
              roomId: config.roomId,
              authProof: derivation.authProof,
            })
          );

          // Start client-side heartbeat to keep NAT / proxies / mobile radios alive
          if (heartbeatTimerRef.current) {
            clearInterval(heartbeatTimerRef.current);
          }
          heartbeatTimerRef.current = setInterval(() => {
            if (ws.readyState === WebSocket.OPEN) {
              try {
                ws.send(JSON.stringify({ type: "ping" }));
              } catch {
                // ignore
              }
            }
          }, 15000);
        };

        ws.onmessage = async (event) => {
          try {
            const msg = JSON.parse(event.data.toString()) as ServerMessage;

            switch (msg.type) {
              case "ping": {
                // Server heartbeat ping -> respond with pong immediately
                if (ws.readyState === WebSocket.OPEN) {
                  ws.send(JSON.stringify({ type: "pong", timestamp: Date.now() }));
                }
                break;
              }

              case "pong": {
                // Server acknowledged heartbeat
                break;
              }

              case "joined": {
                const joined = msg as JoinedEvent;
                setMyPeerId(joined.peerId);
                setPeerCount(joined.peerCount);
                setStatus("connected");
                reconnectAttemptsRef.current = 0;

                // Decrypt restored past messages from SQLite (reload recovery)
                if (joined.history && joined.history.length > 0 && encryptionKeyRef.current) {
                  const restoredList: ChatMessage[] = [];
                  for (const item of joined.history) {
                    try {
                      const payload = await cryptoService.decrypt(
                        encryptionKeyRef.current,
                        item.iv,
                        item.ciphertext
                      );

                      // Match persistent user UUID across page reloads
                      const isMe = payload.senderUserId
                        ? payload.senderUserId === config.userId
                        : item.senderId === joined.peerId;

                      restoredList.push({
                        id: item.id,
                        senderId: item.senderId,
                        senderUserId: payload.senderUserId,
                        senderName: isMe ? config.userName : (payload.senderName || "Peer"),
                        text: payload.text,
                        timestamp: item.timestamp,
                        isMe,
                        restored: true,
                      });
                    } catch {
                      // Decryption failed for tampered message
                    }
                  }

                  // Strictly sort messages chronologically
                  restoredList.sort((a, b) => a.timestamp - b.timestamp);
                  setMessages(restoredList);

                  if (restoredList.length > 0) {
                    showSystemNotice(`Restored ${restoredList.length} previous messages`);
                  }
                }
                break;
              }

              case "message": {
                const rel = msg as RelayedMessageEvent;
                if (!encryptionKeyRef.current) return;
                try {
                  const payload = await cryptoService.decrypt(
                    encryptionKeyRef.current,
                    rel.iv,
                    rel.ciphertext
                  );

                  const isMe = payload.senderUserId
                    ? payload.senderUserId === userIdRef.current
                    : rel.senderId === myPeerId;

                  setMessages((prev) => {
                    const next = [
                      ...prev,
                      {
                        id: "msg_" + Date.now() + "_" + Math.random().toString(36).slice(2, 7),
                        senderId: rel.senderId,
                        senderUserId: payload.senderUserId,
                        senderName: isMe ? userName : (payload.senderName || "Peer"),
                        text: payload.text,
                        timestamp: rel.timestamp,
                        isMe,
                      },
                    ];
                    return next.sort((a, b) => a.timestamp - b.timestamp);
                  });
                } catch {
                  console.error("Failed to decrypt incoming message");
                }
                break;
              }

              case "peer_joined": {
                setPeerCount(msg.peerCount);
                showSystemNotice("A peer connected");
                break;
              }

              case "peer_left": {
                setPeerCount(msg.peerCount);
                showSystemNotice("A peer left the room");
                break;
              }

              case "burned": {
                isBurnedRef.current = true;
                activeConfigRef.current = null;
                setStatus("burned");
                setMessages([]);
                setRoomId("");
                setPassword("");
                encryptionKeyRef.current = null;
                if (typeof window !== "undefined" && window.history?.replaceState) {
                  window.history.replaceState(null, "", window.location.pathname);
                }
                window.location.hash = "";
                setErrorMessage(
                  "This room was permanently burned and deleted. The room ID and password are invalid."
                );
                showSystemNotice("This room and its encrypted data were permanently eradicated", 5000);
                break;
              }

              case "error": {
                console.warn("WebSocket notice:", msg.code, msg.message);

                if (msg.code === "ROOM_BURNED") {
                  isBurnedRef.current = true;
                  activeConfigRef.current = null;
                  setStatus("burned");
                  setMessages([]);
                  setRoomId("");
                  setPassword("");
                  encryptionKeyRef.current = null;
                  if (typeof window !== "undefined" && window.history?.replaceState) {
                    window.history.replaceState(null, "", window.location.pathname);
                  }
                  window.location.hash = "";
                  setErrorMessage(
                    "This room was permanently burned and deleted. The room ID and password are invalid."
                  );
                  showSystemNotice(
                    "This room was permanently burned and deleted. The room ID and password are invalid.",
                    5000
                  );
                  break;
                }

                showSystemNotice(msg.message || "Relay notice");

                // Only fail hard on unrecoverable initial room join errors
                if (
                  status === "connecting" &&
                  (msg.code === "ROOM_NOT_FOUND" ||
                    msg.code === "UNAUTHORIZED" ||
                    msg.code === "ROOM_FULL")
                ) {
                  setErrorMessage(msg.message || "Failed to join room");
                  setStatus("error");
                  activeConfigRef.current = null;
                }
                break;
              }
            }
          } catch (e) {
            console.error("WebSocket message parse error:", e);
          }
        };

        ws.onclose = (event) => {
          if (heartbeatTimerRef.current) {
            clearInterval(heartbeatTimerRef.current);
            heartbeatTimerRef.current = null;
          }

          if (isBurnedRef.current) {
            setStatus("burned");
            return;
          }

          if (isExplicitLeaveRef.current) {
            setStatus("disconnected");
            return;
          }

          // Unexpected socket closure (inactivity, mobile sleep, network flap).
          // Do NOT kick user out! Remain in connecting state and auto-reconnect.
          console.log(`[useChatSession] Socket closed (code=${event.code}). Auto-reconnecting...`);
          setStatus("connecting");

          if (reconnectTimerRef.current) {
            clearTimeout(reconnectTimerRef.current);
          }

          const delay = Math.min(1000 * Math.pow(1.5, reconnectAttemptsRef.current), 6000);
          reconnectAttemptsRef.current += 1;

          reconnectTimerRef.current = setTimeout(() => {
            if (activeConfigRef.current && !isExplicitLeaveRef.current && !isBurnedRef.current) {
              connectAndJoin(activeConfigRef.current);
            }
          }, delay);
        };

        ws.onerror = () => {
          console.warn("[useChatSession] WebSocket error detected. Will reconnect on close.");
        };
      } catch (err: any) {
        setErrorMessage(err.message || "Failed to establish secure session");
        setStatus("error");
      }
    },
    [showSystemNotice, myPeerId, userName, status]
  );

  // Resume connection immediately when user unlocks screen, wakes device, or returns to tab
  useEffect(() => {
    const handleResume = () => {
      if (
        document.visibilityState === "visible" &&
        activeConfigRef.current &&
        !isExplicitLeaveRef.current &&
        !isBurnedRef.current
      ) {
        const ws = wsRef.current;
        if (!ws || ws.readyState === WebSocket.CLOSED || ws.readyState === WebSocket.CLOSING) {
          console.log("[useChatSession] Tab resumed from background. Reconnecting immediately...");
          connectAndJoin(activeConfigRef.current);
        }
      }
    };

    document.addEventListener("visibilitychange", handleResume);
    window.addEventListener("online", handleResume);

    return () => {
      document.removeEventListener("visibilitychange", handleResume);
      window.removeEventListener("online", handleResume);
    };
  }, [connectAndJoin]);

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || !encryptionKeyRef.current || !wsRef.current) return;

      try {
        const timestamp = Date.now();
        const payload = {
          text: trimmed,
          senderName: userName || "Me",
          senderUserId: userIdRef.current, // Embed persistent client UUID
          timestamp,
        };

        const packet = await cryptoService.encrypt(encryptionKeyRef.current, payload);
        sequenceRef.current += 1;

        wsRef.current.send(
          JSON.stringify({
            type: "message",
            roomId,
            iv: packet.iv,
            ciphertext: packet.ciphertext,
            timestamp: packet.timestamp,
            sequence: sequenceRef.current,
          })
        );

        setMessages((prev) => {
          const next = [
            ...prev,
            {
              id: "msg_" + timestamp + "_" + Math.random().toString(36).slice(2, 7),
              senderId: myPeerId,
              senderUserId: userIdRef.current,
              senderName: userName || "Me",
              text: trimmed,
              timestamp: packet.timestamp,
              isMe: true,
            },
          ];
          return next.sort((a, b) => a.timestamp - b.timestamp);
        });
      } catch (err) {
        console.error("Encryption error:", err);
      }
    },
    [roomId, userName, myPeerId]
  );

  const burnRoom = useCallback(() => {
    if (!wsRef.current || !roomId) return;
    isBurnedRef.current = true;
    activeConfigRef.current = null;
    try {
      wsRef.current.send(
        JSON.stringify({
          type: "burn",
          roomId,
        })
      );
    } catch (e) {
      console.error("Failed to send burn frame:", e);
    }
    if (typeof window !== "undefined" && window.history?.replaceState) {
      window.history.replaceState(null, "", window.location.pathname);
    }
    window.location.hash = "";
    setErrorMessage("This room was permanently burned and deleted. The room ID and password are invalid.");
    setMessages([]);
    setRoomId("");
    setPassword("");
    setStatus("burned");
  }, [roomId]);

  const leaveRoom = useCallback(() => {
    isExplicitLeaveRef.current = true;
    activeConfigRef.current = null;

    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    if (heartbeatTimerRef.current) {
      clearInterval(heartbeatTimerRef.current);
      heartbeatTimerRef.current = null;
    }

    if (wsRef.current) {
      if (wsRef.current.readyState === WebSocket.OPEN && roomId) {
        try {
          wsRef.current.send(JSON.stringify({ type: "leave", roomId }));
        } catch {
          // ignore
        }
      }
      wsRef.current.close();
      wsRef.current = null;
    }

    encryptionKeyRef.current = null;
    window.location.hash = "";
    setStatus("disconnected");
    setMessages([]);
    setRoomId("");
    setPassword("");
  }, [roomId]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (heartbeatTimerRef.current) {
        clearInterval(heartbeatTimerRef.current);
      }
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

  return {
    roomId,
    password,
    userName,
    myPeerId,
    peerCount,
    status,
    messages,
    systemNotice,
    errorMessage,
    connectAndJoin,
    sendMessage,
    burnRoom,
    leaveRoom,
  };
}
