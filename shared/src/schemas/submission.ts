import { z } from 'zod';

const notes = z.string().trim().max(2000).optional();

export const SubmissionInputSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('GITHUB_PR'), url: z.url({ protocol: /^https$/ }), notes }),
  z.object({ kind: z.literal('URL'), url: z.url({ protocol: /^https?$/ }), notes }),
  z.object({
    kind: z.literal('FILE'),
    fileName: z.string().trim().min(1).max(200),
    fileContentBase64: z.string().min(1).max(3_000_000, { message: 'file is too large (max ~2 MB)' }),
    notes,
  }),
]);
export type SubmissionInput = z.infer<typeof SubmissionInputSchema>;

export const DisputeInputSchema = z.object({
  reason: z.string().trim().min(10, { message: 'explain the dispute in at least 10 characters' }).max(2000),
});

export const ResolveInputSchema = z.object({
  action: z.enum(['APPROVE', 'REJECT']),
  note: z.string().trim().min(3, { message: 'add a short note for the audit trail' }).max(2000),
});

export const RefundInputSchema = z.object({
  reason: z.string().trim().min(3).max(2000),
});

export const CaptureFundingSchema = z.object({
  orderId: z.string().trim().min(3).max(64),
});

export const UpdateMeSchema = z.object({
  paypalEmail: z.email().max(200),
});
