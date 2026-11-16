import { config } from "../config.ts";
import { chatRepository, type ChatRepository } from "../db/chat-repository.ts";
import { roomManager, type RoomManager } from "./room-manager.ts";

export interface CleanupResult {
  purgedMessages: number;
  purgedRooms: number;
  activeRoomsProtected: number;
  timestamp: number;
}

export class CleanupCronService {
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly repository: ChatRepository;
  private readonly manager: RoomManager;
  private isRunning: boolean = false;

  constructor(
    repository: ChatRepository = chatRepository,
    manager: RoomManager = roomManager
  ) {
    this.repository = repository;
    this.manager = manager;
  }

  /**
   * Start the periodic cron job
   */
  public start(intervalMs: number = config.retention.cleanupIntervalMs): void {
    if (this.timer) {
      clearInterval(this.timer);
    }

    this.timer = setInterval(async () => {
      try {
        await this.runCleanup();
      } catch (err) {
        console.error("[CleanupCron] Error executing scheduled cleanup:", err);
      }
    }, intervalMs);

    if (this.timer.unref) {
      this.timer.unref();
    }

    console.log(`[CleanupCron] Scheduled SQLite retention cleanup every ${intervalMs / 1000 / 60} minutes.`);
  }

  /**
   * Execute immediate cleanup of expired messages and rooms.
   *
   * CRITICAL REQUIREMENT:
   * A room with at least 1 active user MUST NOT be purged!
   * Active rooms are fetched and excluded from the purge queries.
   */
  public runCleanup(): CleanupResult {
    if (this.isRunning) {
      return { purgedMessages: 0, purgedRooms: 0, activeRoomsProtected: 0, timestamp: Date.now() };
    }

    this.isRunning = true;
    const now = Date.now();

    try {
      // 1. Identify all rooms that currently have at least 1 active connected user
      const activeRoomIds = this.manager.getActiveRoomIds();

      // 2. Purge only expired messages and rooms NOT belonging to active rooms
      const purgedMessages = this.repository.purgeExpiredMessages(now, activeRoomIds);
      const purgedRooms = this.repository.purgeExpiredRooms(now, activeRoomIds);

      if (purgedMessages > 0 || purgedRooms > 0) {
        // Truncate SQLite WAL file to reclaim space
        this.repository.checkpoint();
        console.log(
          `[CleanupCron] Retention sweep: purged ${purgedMessages} expired messages and ${purgedRooms} expired rooms. (Protected ${activeRoomIds.length} active rooms with connected users)`
        );
      }

      return {
        purgedMessages,
        purgedRooms,
        activeRoomsProtected: activeRoomIds.length,
        timestamp: now,
      };
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Stop the scheduled cron timer
   */
  public stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}

export const cleanupCron = new CleanupCronService();
