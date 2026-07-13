import fs from 'node:fs/promises';
import path from 'node:path';

/** Ensures the parent directory for a persisted JSON document exists. */
export async function ensureParentDirectory(filePath: string): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
}

/** Reads and parses a JSON document, returning null when it does not exist. */
export async function readJson(filePath: string): Promise<unknown | null> {
  await ensureParentDirectory(filePath);
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8')) as unknown;
  } catch (error) {
    if (isNodeError(error) && error.code === 'ENOENT') return null;
    throw error;
  }
}

/** Writes JSON through a same-directory temporary file and atomic rename. */
export async function writeJsonAtomic(filePath: string, value: unknown): Promise<void> {
  await ensureParentDirectory(filePath);
  const tmpFile = `${filePath}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`;
  try {
    await fs.writeFile(tmpFile, JSON.stringify(value, null, 2));
    await fs.rename(tmpFile, filePath);
  } catch (error) {
    await fs.rm(tmpFile, { force: true }).catch(() => undefined);
    throw error;
  }
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}
