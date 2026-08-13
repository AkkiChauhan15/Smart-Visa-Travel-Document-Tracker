import { randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { chmod, mkdir, stat, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { getConfig } from '../config/env.js';
import { HttpError } from '../utils/http-error.js';

const supportedFiles = [
  {
    mimeType: 'application/pdf',
    extension: '.pdf',
    matches: (buffer) => buffer.subarray(0, 5).toString('ascii') === '%PDF-',
  },
  {
    mimeType: 'image/jpeg',
    extension: '.jpg',
    matches: (buffer) => buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff,
  },
  {
    mimeType: 'image/png',
    extension: '.png',
    matches: (buffer) =>
      buffer.length >= 8 &&
      buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  },
];

function safeStoragePath(fileReference) {
  if (!/^[0-9a-f-]{36}\.(pdf|jpg|png)$/.test(fileReference)) {
    throw new HttpError(404, 'Stored file not found');
  }

  const { uploadDirectory } = getConfig();
  const resolvedPath = path.resolve(uploadDirectory, fileReference);
  if (path.dirname(resolvedPath) !== uploadDirectory) {
    throw new HttpError(404, 'Stored file not found');
  }
  return resolvedPath;
}

function sanitizeOriginalName(name) {
  const sanitized = path.basename(name).replace(/[\u0000-\u001f\u007f"\\]/g, '_').trim();
  return (sanitized || 'document').slice(0, 255);
}

export async function storeUpload(file) {
  if (!file?.buffer?.length) {
    throw new HttpError(422, 'A PDF, JPG, or PNG file is required');
  }

  const detected = supportedFiles.find((type) => type.matches(file.buffer));
  if (!detected || file.mimetype !== detected.mimeType) {
    throw new HttpError(415, 'Only genuine PDF, JPG, and PNG files are accepted');
  }

  const { uploadDirectory } = getConfig();
  await mkdir(uploadDirectory, { recursive: true, mode: 0o700 });
  await chmod(uploadDirectory, 0o700);

  const fileReference = `${randomUUID()}${detected.extension}`;
  await writeFile(safeStoragePath(fileReference), file.buffer, { flag: 'wx', mode: 0o600 });

  return {
    fileReference,
    originalFileName: sanitizeOriginalName(file.originalname),
    fileMimeType: detected.mimeType,
    fileSize: file.size,
  };
}

export async function removeStoredFile(fileReference) {
  try {
    await unlink(safeStoragePath(fileReference));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}

export async function openStoredFile(fileReference) {
  const filePath = safeStoragePath(fileReference);
  try {
    const fileStat = await stat(filePath);
    if (!fileStat.isFile()) throw new Error('Not a file');
    return { stream: createReadStream(filePath), size: fileStat.size };
  } catch (error) {
    if (error.code === 'ENOENT') throw new HttpError(404, 'Stored file not found');
    throw error;
  }
}

