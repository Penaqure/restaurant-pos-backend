const { execFile } = require("child_process");
const { promisify } = require("util");
const fs = require("fs/promises");
const path = require("path");
const logger = require("../utils/logger");

const execFileAsync = promisify(execFile);

const BACKUP_DIR = path.join(__dirname, "..", "backups");
const DAY_MS = 24 * 60 * 60 * 1000;

function backupFilename(date = new Date()) {
  // Sortable and filesystem-safe: 2026-10-08T07-30-00.
  const stamp = date.toISOString().replace(/:/g, "-").split(".")[0];
  return `restaurant_billing-${stamp}.dump`;
}

// Deletes backups beyond the configured retention count, oldest first --
// mirrors the fixed-count rotation winston already does for the app's own
// logs (see utils/logger.js) rather than a time-based retention window.
async function pruneOldBackups(keepCount) {
  const files = (await fs.readdir(BACKUP_DIR)).filter((f) => f.endsWith(".dump")).sort();
  const toDelete = files.slice(0, Math.max(0, files.length - keepCount));
  await Promise.all(toDelete.map((f) => fs.unlink(path.join(BACKUP_DIR, f)).catch(() => {})));
  if (toDelete.length > 0) {
    logger.info("backup.pruned", { deleted: toDelete.length, kept: files.length - toDelete.length });
  }
}

// pg_dump's custom format (-F c) is compressed and restorable with
// pg_restore (including selectively, or into a differently-named database),
// unlike a plain .sql dump -- the standard choice for a backup meant to
// actually be restored from, not just inspected.
async function runBackup() {
  await fs.mkdir(BACKUP_DIR, { recursive: true });
  const outPath = path.join(BACKUP_DIR, backupFilename());
  try {
    await execFileAsync("pg_dump", [process.env.DATABASE_URL, "-F", "c", "-f", outPath], {
      timeout: 5 * 60 * 1000,
    });
    const { size } = await fs.stat(outPath);
    logger.info("backup.completed", { file: outPath, bytes: size });
  } catch (err) {
    logger.error("backup.failed", { error: err.message });
    // A failed dump can leave a truncated/empty file behind -- remove it so
    // pruneOldBackups' count-based rotation doesn't count a broken backup
    // as a real one, and so it's never mistaken for a valid restore point.
    await fs.unlink(outPath).catch(() => {});
  }
  const keepCount = Number(process.env.BACKUP_RETENTION_COUNT) || 7;
  await pruneOldBackups(keepCount);
}

let intervalHandle = null;

function scheduleBackups() {
  if (process.env.BACKUP_ENABLED === "false") {
    logger.info("backup.disabled");
    return;
  }
  runBackup();
  intervalHandle = setInterval(runBackup, DAY_MS);
  intervalHandle.unref(); // don't keep the process alive just for this
}

function stopBackups() {
  if (intervalHandle) clearInterval(intervalHandle);
  intervalHandle = null;
}

module.exports = { scheduleBackups, stopBackups, runBackup, pruneOldBackups, BACKUP_DIR };
