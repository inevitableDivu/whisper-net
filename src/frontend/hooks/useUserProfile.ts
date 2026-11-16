import { useIdb } from "@inevitable_divu/use-idb";
import { useMemo, useEffect } from "react";
import type { UserProfile } from "../types/chat.ts";
import { safeRandomUUID } from "../../crypto/client-crypto.ts";

const AVATAR_COLORS = [
  "oklch(0.508 0.118 165.612)", // Theme emerald
  "oklch(0.55 0.18 250)",       // Blue
  "oklch(0.58 0.20 300)",       // Purple
  "oklch(0.62 0.18 350)",       // Rose
  "oklch(0.65 0.18 50)",        // Orange
  "oklch(0.60 0.16 200)",       // Cyan
  "oklch(0.56 0.15 140)",       // Green
  "oklch(0.58 0.17 280)",       // Indigo
];

function pickAvatarColor(name: string): string {
  if (!name) return AVATAR_COLORS[0]!;
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % AVATAR_COLORS.length;
  return AVATAR_COLORS[index]!;
}

/**
 * Reactive User Profile Hook backed by IndexedDB (@inevitable_divu/use-idb).
 * Ensures zero data loss on reloads, persistent UUID generation, and multi-tab synchronization.
 */
export function useUserProfile() {
  const {
    value: storedUserId,
    setValue: setStoredUserId,
    loading: isLoadingId,
  } = useIdb<string>("secure_chat_user_uuid", {
    defaultValue: "",
  });

  const {
    value: storedName,
    setValue: setStoredName,
    loading: isLoadingName,
  } = useIdb<string>("secure_chat_username", {
    defaultValue: "",
  });

  const {
    value: storedTheme,
    setValue: setStoredTheme,
  } = useIdb<"dark" | "light">("secure_chat_theme", {
    defaultValue: "dark",
  });

  // Ensure persistent user UUID exists
  useEffect(() => {
    if (!isLoadingId && (!storedUserId || storedUserId.trim().length === 0)) {
      const generatedUuid = safeRandomUUID();
      setStoredUserId(generatedUuid);
    }
  }, [storedUserId, isLoadingId, setStoredUserId]);

  // Synchronize dark/light theme class on root element
  const theme = storedTheme ?? "dark";
  useEffect(() => {
    if (theme === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }, [theme]);

  const toggleTheme = async () => {
    const next = theme === "dark" ? "light" : "dark";
    await setStoredTheme(next);
  };

  const userId = storedUserId || "pending_uuid";
  const userName = storedName ?? "";
  const hasName = userName.trim().length > 0;

  const avatarColor = useMemo(() => {
    return pickAvatarColor(userName || userId);
  }, [userName, userId]);

  const profile: UserProfile = {
    id: userId,
    name: userName,
    avatarColor,
  };

  const updateName = async (newName: string) => {
    const trimmed = newName.trim();
    if (trimmed.length > 0) {
      await setStoredName(trimmed);
    }
  };

  return {
    profile,
    userId,
    userName,
    hasName,
    isLoading: isLoadingName || isLoadingId,
    theme,
    toggleTheme,
    updateName,
  };
}
