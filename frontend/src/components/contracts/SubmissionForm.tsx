import type { MilestoneDTO, SubmissionInput } from '@arbiter/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { FileUp, Send, Wand2 } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useConfig } from '../../hooks/useConfig';
import { api } from '../../lib/api';
import { fileToBase64 } from '../../lib/format';
import { Button } from '../ui/Button';
import { Field, Input, Textarea, useFieldId } from '../ui/Field';

/** Contractor deliverable form. The kind is fixed by the milestone's verification type. */
export function SubmissionForm({ milestone, onDone }: { milestone: MilestoneDTO; onDone?: () => void }) {
  const id = useFieldId('sub');
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { data: config } = useConfig();
  const kind = milestone.verification.type;
  const [url, setUrl] = useState('');
  const [notes, setNotes] = useState('');
  const [file, setFile] = useState<File | null>(null);

  const submit = useMutation({
    mutationFn: async () => {
      let input: SubmissionInput;
      if (kind === 'FILE') {
        if (!file) throw new Error('Choose a file to upload');
        if (file.size > 2 * 1024 * 1024) throw new Error('Files are limited to 2 MB');
        input = { kind, fileName: file.name, fileContentBase64: await fileToBase64(file), notes: notes || undefined };
      } else {
        input = { kind, url: url.trim(), notes: notes || undefined };
      }
      return api.submit(milestone.id, input);
    },
    onSuccess: () => {
      toast.success('Deliverable submitted', { description: 'The verification agent is checking it now.' });
      void qc.invalidateQueries({ queryKey: ['milestone', milestone.id] });
      void qc.invalidateQueries({ queryKey: ['contract', milestone.contractId] });
      onDone?.();
      navigate(`/milestones/${milestone.id}`);
    },
    onError: (e: Error) => toast.error('Submission failed', { description: e.message }),
  });

  const fixtures = kind === 'GITHUB_PR' ? config?.demoFixtures.githubPrs : kind === 'URL' ? config?.demoFixtures.urls : [];

  return (
    <motion.form
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      className="overflow-hidden"
      onSubmit={(e) => {
        e.preventDefault();
        submit.mutate();
      }}
    >
      <div className="mt-4 space-y-4 rounded-2xl bg-ink-950/50 p-4 ring-1 ring-white/[0.06]">
        {kind === 'FILE' ? (
          <Field label="Deliverable file" htmlFor={`${id}-file`} hint="Up to 2 MB. Text files are read by the agent; binaries are hashed.">
            <label htmlFor={`${id}-file`} className="flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-white/15 px-4 py-4 text-sm text-ink-300 hover:border-iris-400/50">
              <FileUp className="size-5 text-iris-300" />
              {file ? `${file.name} · ${(file.size / 1024).toFixed(1)} KB` : 'Choose a file…'}
            </label>
            <input id={`${id}-file`} type="file" className="sr-only" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </Field>
        ) : (
          <Field label={kind === 'GITHUB_PR' ? 'Pull request URL' : 'Deployed URL'} htmlFor={`${id}-url`}>
            <Input
              id={`${id}-url`}
              type="url"
              required
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder={kind === 'GITHUB_PR' ? 'https://github.com/owner/repo/pull/42' : 'https://your-site.example/launch'}
            />
          </Field>
        )}

        {fixtures && fixtures.length > 0 ? (
          <div>
            <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-ink-400">
              <Wand2 className="size-3" /> Demo fixtures
            </div>
            <div className="flex flex-wrap gap-1.5">
              {fixtures.map((f) => (
                <button
                  type="button"
                  key={f.url}
                  onClick={() => setUrl(f.url)}
                  title={f.expectation}
                  className="rounded-full bg-white/[0.04] px-3 py-1 text-xs text-ink-200 ring-1 ring-inset ring-white/10 hover:bg-iris-500/15 hover:text-white"
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        <Field label="Notes for the reviewer (optional)" htmlFor={`${id}-notes`} hint="Treated as untrusted data by the agent.">
          <Textarea id={`${id}-notes`} value={notes} onChange={(e) => setNotes(e.target.value)} className="min-h-16" />
        </Field>
        <div className="flex justify-end">
          <Button type="submit" variant="agent" loading={submit.isPending} icon={<Send className="size-4" />}>
            Submit for verification
          </Button>
        </div>
      </div>
    </motion.form>
  );
}
