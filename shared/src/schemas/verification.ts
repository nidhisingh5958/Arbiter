import { z } from 'zod';

const trimmedList = (max: number) => z.array(z.string().trim().min(1).max(300)).max(max);

export const GithubPrParamsSchema = z.object({
  repo: z
    .string()
    .trim()
    .regex(/^[\w.-]+\/[\w.-]+$/, { message: 'repo must look like "owner/name"' }),
  baseBranch: z.string().trim().min(1).max(100).default('main'),
  requiredChecks: trimmedList(20).default([]),
  expectedPaths: trimmedList(30).default([]),
  requireMerged: z.boolean().default(false),
});
export type GithubPrParams = z.infer<typeof GithubPrParamsSchema>;

export const UrlParamsSchema = z.object({
  url: z.url({ protocol: /^https?$/ }).optional(),
  requiredText: trimmedList(20).default([]),
  requiredSelectors: trimmedList(20).default([]),
  maxResponseMs: z.number().int().positive().max(30_000).default(5_000),
});
export type UrlParams = z.infer<typeof UrlParamsSchema>;

export const FileParamsSchema = z.object({
  allowedExtensions: z
    .array(z.string().trim().regex(/^\.[a-z0-9]+$/i, { message: 'extensions look like ".md"' }))
    .max(20)
    .default(['.md', '.txt', '.json', '.csv', '.html', '.pdf', '.zip']),
  maxSizeKb: z.number().int().positive().max(2048).default(512),
  requiredText: trimmedList(20).default([]),
});
export type FileParams = z.infer<typeof FileParamsSchema>;

export const VerificationSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('GITHUB_PR'), params: GithubPrParamsSchema }),
  z.object({ type: z.literal('URL'), params: UrlParamsSchema }),
  z.object({ type: z.literal('FILE'), params: FileParamsSchema }),
]);
export type Verification = z.infer<typeof VerificationSchema>;

export function defaultVerification(type: Verification['type']): Verification {
  switch (type) {
    case 'GITHUB_PR':
      return { type, params: GithubPrParamsSchema.parse({ repo: 'owner/repo' }) };
    case 'URL':
      return { type, params: UrlParamsSchema.parse({}) };
    case 'FILE':
      return { type, params: FileParamsSchema.parse({}) };
  }
}
