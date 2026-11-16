import { existsSync, unlinkSync } from "fs";
import { join } from "path";
import { config } from "../src/config.ts";

/**
 * Reset local development SQLite database
 */
export function resetDatabase(): void {
  const dbPath = join(process.cwd(), config.db.path);
  const walPath = `${dbPath}-wal`;
  const shmPath = `${dbPath}-shm`;

  console.log(`[DB Reset] Resetting database at: ${dbPath}`);

  for (const file of [dbPath, walPath, shmPath]) {
    if (existsSync(file)) {
      unlinkSync(file);
      console.log(`   - Deleted: ${file}`);
    }
  }

  console.log(`✅ SQLite database successfully reset.`);
}

if (import.meta.main) {
  resetDatabase();
}
