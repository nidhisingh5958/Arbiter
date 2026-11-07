import { z } from 'zod';
import { VerificationSchema } from './verification';
import { formatMoney } from '../money';

export const CurrencySchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{3}$/, { message: 'currency must be an ISO 4217 code like USD' });

export const IsoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, { message: 'deadline must be YYYY-MM-DD' })
  .refine((s) => !Number.isNaN(Date.parse(`${s}T00:00:00Z`)), { message: 'deadline is not a real date' });

export const MilestoneDraftSchema = z.object({
  title: z.string().trim().min(3, { message: 'title is too short' }).max(120),
  description: z.string().trim().max(2000).default(''),
  acceptanceCriteria: z
    .array(z.string().trim().min(3, { message: 'criterion is too short' }).max(500))
    .min(1, { message: 'add at least one acceptance criterion' })
    .max(12),
  amountCents: z
    .number()
    .int({ message: 'amount must be whole cents' })
    .positive({ message: 'amount must be greater than zero' })
    .max(10_000_000, { message: 'amount exceeds the 100,000 demo limit' }),
  currency: CurrencySchema,
  deadline: IsoDateSchema,
  verification: VerificationSchema,
});
export type MilestoneDraft = z.infer<typeof MilestoneDraftSchema>;

const ContractDraftBase = z.object({
  title: z.string().trim().min(3).max(140),
  summary: z.string().trim().max(1000).default(''),
  currency: CurrencySchema,
  totalCents: z.number().int().positive().max(100_000_000),
  milestones: z.array(MilestoneDraftSchema).min(1, { message: 'a contract needs at least one milestone' }).max(10),
});

/** Strict contract draft: milestone amounts must sum exactly to the contract total. */
export const ContractDraftSchema = ContractDraftBase.superRefine((c, ctx) => {
  const sum = c.milestones.reduce((s, m) => s + m.amountCents, 0);
  if (sum !== c.totalCents) {
    ctx.addIssue({
      code: 'custom',
      path: ['milestones'],
      message: `Milestone amounts sum to ${formatMoney(sum, c.currency)} but the contract total is ${formatMoney(
        c.totalCents,
        c.currency,
      )}`,
    });
  }
  c.milestones.forEach((m, i) => {
    if (m.currency !== c.currency) {
      ctx.addIssue({
        code: 'custom',
        path: ['milestones', i, 'currency'],
        message: `Milestone currency ${m.currency} differs from contract currency ${c.currency}`,
      });
    }
  });
});
export type ContractDraft = z.infer<typeof ContractDraftSchema>;

export const PolicyInputSchema = z.object({
  maxAutoReleaseCents: z.number().int().nonnegative(),
  minConfidence: z.number().min(0).max(1),
  dailyPayoutCapCents: z.number().int().nonnegative(),
  humanApprovalAboveCents: z.number().int().nonnegative(),
  disputeWindowSeconds: z.number().int().min(0).max(30 * 24 * 3600),
});
export type PolicyInput = z.infer<typeof PolicyInputSchema>;

export const CreateContractSchema = z.object({
  draft: ContractDraftSchema,
  contractorId: z.string().min(1),
  sowText: z.string().max(20_000).default(''),
  policy: PolicyInputSchema.optional(),
});
export type CreateContractInput = z.infer<typeof CreateContractSchema>;

export const ExtractRequestSchema = z.object({
  sowText: z.string().trim().min(40, { message: 'paste a statement of work (at least 40 characters)' }).max(20_000),
  currencyHint: CurrencySchema.optional(),
});
export type ExtractRequest = z.infer<typeof ExtractRequestSchema>;
