import type { MilestoneDTO, SubmissionDTO, SubmissionInput, UserDTO } from '@arbiter/shared';
import type { SubmissionsTable } from '../db/types';
import { newId, sha256Hex } from '../lib/crypto';
import { badRequest, conflict, forbidden, notFound } from '../lib/errors';
import { nowIso } from '../lib/time';
import type { Repositories } from '../repositories';
import { toSubmissionDTO } from '../repositories/mappers';
import { isContractorOf } from './access';
import type { MilestoneTransitions } from './transitions';
import type { VerificationService } from './verification';

const MAX_FILE_BYTES = 2 * 1024 * 1024;
const MAX_STORED_BYTES = 512 * 1024;
const SUBMITTABLE = ['FUNDED', 'REJECTED', 'ESCALATED'];

export class SubmissionService {
  constructor(
    private readonly repos: Repositories,
    private readonly transitions: MilestoneTransitions,
    private readonly verification: VerificationService,
  ) {}

  async submit(
    user: UserDTO,
    milestoneId: string,
    input: SubmissionInput,
    opts: { waitForVerification?: boolean } = {},
  ): Promise<{ submission: SubmissionDTO; milestone: MilestoneDTO }> {
    const m = await this.repos.milestones.getRow(milestoneId);
    if (!m) throw notFound('Milestone');
    const c = await this.repos.contracts.getRow(m.contract_id);
    if (!c) throw notFound('Contract');
    if (!isContractorOf(user, c)) throw forbidden('Only the contractor on this contract can submit deliverables');
    if (!SUBMITTABLE.includes(m.status)) {
      throw conflict(
        m.status === 'FUNDING_REQUIRED' || m.status === 'PENDING'
          ? 'This milestone is not funded yet — submissions open once the buyer funds it'
          : `This milestone is ${m.status} and is not accepting submissions`,
      );
    }
    const verification = JSON.parse(m.verification) as { type: string };
    if (verification.type !== input.kind) {
      throw badRequest(`This milestone is verified by ${verification.type.replace('_', ' ')}; submit that kind of deliverable`);
    }

    const row: SubmissionsTable = {
      id: newId('sub'),
      milestone_id: m.id,
      contractor_id: user.id,
      kind: input.kind,
      url: input.kind === 'FILE' ? null : input.url,
      notes: input.notes ?? null,
      file_name: null,
      file_sha256: null,
      file_size_bytes: null,
      file_content: null,
      created_at: nowIso(),
    };
    if (input.kind === 'FILE') {
      const buf = Buffer.from(input.fileContentBase64, 'base64');
      if (buf.byteLength === 0) throw badRequest('The uploaded file is empty');
      if (buf.byteLength > MAX_FILE_BYTES) throw badRequest('Files are limited to 2 MB');
      row.file_name = input.fileName.replace(/[^\w.\- ]/g, '_').slice(0, 200);
      row.file_sha256 = sha256Hex(buf);
      row.file_size_bytes = buf.byteLength;
      row.file_content = buf.byteLength <= MAX_STORED_BYTES ? input.fileContentBase64 : null;
    }
    await this.repos.submissions.insert(row);
    await this.transitions.transition(m.id, 'SUBMITTED', {
      patch: {
        submitted_at: row.created_at,
        decision_verdict: null,
        decision_confidence: null,
        decision_summary: null,
        injection_flag: 0,
        release_at: null,
      },
      actorId: user.id,
      actorRole: user.role,
      reason: `Deliverable submitted (${input.kind})`,
    });

    if (opts.waitForVerification) await this.verification.verify(row.id);
    else this.verification.verifyInBackground(row.id);

    const milestone = await this.repos.milestones.getDTO(m.id);
    if (!milestone) throw notFound('Milestone');
    return { submission: toSubmissionDTO(row), milestone };
  }
}
