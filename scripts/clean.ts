import { rmSync, existsSync } from "fs";
import { join } from "path";

/**
 * Clean build artifacts and dist directories
 */
export function clean(): void {
  const rootDir = process.cwd();
  const dirs = [
    join(rootDir, "public", "dist"),
    join(rootDir, "dist"),
  ];

  console.log(`[Clean] Cleaning build output directories...`);

  for (const dir of dirs) {
    if (existsSync(dir)) {
      rmSync(dir, { recursive: true, force: true });
      console.log(`   - Removed: ${dir.replace(rootDir, ".")}`);
    }
  }

  console.log(`✅ Build artifacts cleaned.`);
}

if (import.meta.main) {
  clean();
}
