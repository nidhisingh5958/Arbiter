import path from 'node:path';
import type { FileParams } from '@arbiter/shared';
import type { UntrustedSource } from '../../llm/prompts';
import { fail, pass, warn, type CheckResult, type VerifierOutput } from './types';

const TEXT_EXTENSIONS = new Set(['.md', '.txt', '.json', '.csv', '.html', '.htm', '.xml', '.yaml', '.yml']);

export interface SubmittedFile {
  name: string;
  sizeBytes: number;
  sha256: string;
  contentBase64: string | null;
}

/** Artifact verifier for uploaded files: extension, size, integrity hash, parseability and required text. */
export function verifyFile(params: FileParams, file: SubmittedFile): VerifierOutput {
  const checks: CheckResult[] = [];
  const untrusted: UntrustedSource[] = [];
  const ext = path.extname(file.name).toLowerCase();
  const allowed = params.allowedExtensions.map((e) => e.toLowerCase());

  checks.push(
    allowed.length === 0 || allowed.includes(ext)
      ? pass('file_extension', `File type ${ext || '(none)'} is allowed`)
      : fail('file_extension', 'medium', `File type ${ext || '(none)'} is not in the allowed list (${allowed.join(', ')})`),
  );
  checks.push(
    file.sizeBytes <= params.maxSizeKb * 1024
      ? pass('file_size', `File size ${(file.sizeBytes / 1024).toFixed(1)} KB is within ${params.maxSizeKb} KB`)
      : fail('file_size', 'medium', `File is ${(file.sizeBytes / 1024).toFixed(1)} KB, over the ${params.maxSizeKb} KB limit`),
  );
  checks.push(pass('file_integrity', `SHA-256 recorded for the audit trail`, { sha256: file.sha256 }));

  const isText = TEXT_EXTENSIONS.has(ext);
  const text = isText && file.contentBase64 ? Buffer.from(file.contentBase64, 'base64').toString('utf8') : null;

  if (ext === '.json' && text !== null) {
    try {
      JSON.parse(text);
      checks.push(pass('file_parse', 'JSON parses successfully'));
    } catch {
      checks.push(fail('file_parse', 'medium', 'File has a .json extension but is not valid JSON'));
    }
  }

  for (const required of params.requiredText) {
    if (text === null) {
      checks.push(warn(`required_text:${required}`, `Cannot search a binary file for "${required}" — needs human review`));
    } else {
      checks.push(
        text.toLowerCase().includes(required.toLowerCase())
          ? pass(`required_text:${required}`, `File contains "${required}"`)
          : fail(`required_text:${required}`, 'medium', `File does not contain "${required}"`),
      );
    }
  }

  if (text !== null) untrusted.push({ label: 'file_content', content: text.slice(0, 12_000) });
  untrusted.push({ label: 'file_name', content: file.name });

  return { checks, untrusted, facts: { extension: ext, sizeBytes: file.sizeBytes, textual: isText } };
}
