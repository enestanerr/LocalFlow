import { zip } from 'fflate';
import { uniqueFilename } from './recipe';

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export async function createArchive(
  files: { name: string; blob: Blob }[],
): Promise<Blob> {
  if (!files.length)
    throw new Error('There are no processed files to download.');
  const entries: Record<string, Uint8Array> = Object.create(null);
  const used = new Set<string>();
  for (const file of files)
    entries[uniqueFilename(file.name, used)] = new Uint8Array(
      await file.blob.arrayBuffer(),
    );
  // Images are already compressed. Store them without a second compression pass.
  const bytes = await new Promise<Uint8Array>((resolve, reject) =>
    zip(entries, { level: 0 }, (error, data) =>
      error ? reject(error) : resolve(data),
    ),
  );
  return new Blob([new Uint8Array(bytes)], { type: 'application/zip' });
}
