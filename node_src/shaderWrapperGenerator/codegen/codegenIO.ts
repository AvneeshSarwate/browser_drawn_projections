import { promises as fs } from 'node:fs';
import * as path from 'node:path';

export async function readTextFile(filePath: string): Promise<string> {
  return fs.readFile(filePath, 'utf8');
}

export async function writeFileIfChanged(filePath: string, content: string): Promise<boolean> {
  let existing: string | null = null;
  try {
    existing = await fs.readFile(filePath, 'utf8');
  } catch (error: any) {
    if (error?.code !== 'ENOENT') {
      throw error;
    }
  }
  if (existing === content) {
    return false;
  }
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content, 'utf8');
  return true;
}
