import type { ServerEvent } from '@arbiter/shared';
import { AnimatePresence, motion } from 'framer-motion';
import { Bot, CircleDollarSign, FileCheck2, FilePlus2, Radio, ScrollText, ShieldAlert, Webhook } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { clock, titleCase } from '../../lib/format';
import { useLiveEvents } from '../../lib/liveEvents';
import { cn } from '../../lib/cn';

function describe(e: ServerEvent): { icon: ReactNode; text: ReactNode; tone: string; href?: string } | null {
  switch (e.type) {
    case 'milestone.updated':
      return {
        icon: <FileCheck2 className="size-3.5" />,
        text: (
          <>
            <b className="font-medium text-ink-100">{e.title}</b> → {titleCase(e.status)}
          </>
        ),
        tone: e.status === 'PAID' || e.status === 'APPROVED' ? 'text-mint-300' : e.status === 'REJECTED' ? 'text-rose-300' : e.status === 'ESCALATED' || e.status === 'DISPUTED' ? 'text-amber-300' : 'text-sky-300',
        href: `/milestones/${e.milestoneId}`,
      };
    case 'payment.updated':
      return { icon: <CircleDollarSign className="size-3.5" />, text: <>PayPal {titleCase(e.kind)} · {titleCase(e.status)}</>, tone: 'text-mint-300', href: `/milestones/${e.milestoneId}` };
    case 'webhook.received':
      return {
        icon: <Webhook className="size-3.5" />,
        text: (
          <>
            <span className="font-mono text-[11px]">{e.eventType}</span>{' '}
            {e.duplicate ? <span className="text-ink-400">· duplicate ignored</span> : e.verified ? <span className="text-mint-300">· verified</span> : <span className="text-rose-300">· signature rejected</span>}
          </>
        ),
        tone: e.verified ? 'text-iris-300' : 'text-rose-300',
      };
    case 'decision.created':
      return { icon: <ScrollText className="size-3.5" />, text: <>Decision #{e.seq} · {titleCase(e.action)}{e.verdict ? ` · ${titleCase(e.verdict)}` : ''}</>, tone: 'text-ink-300' };
    case 'inspection.created':
      return {
        icon: e.injectionFlag ? <ShieldAlert className="size-3.5" /> : <FileCheck2 className="size-3.5" />,
        text: e.injectionFlag ? <span className="text-rose-200">Prompt injection flagged</span> : <>{e.count} inspection result{e.count === 1 ? '' : 's'} recorded</>,
        tone: e.injectionFlag ? 'text-rose-300' : 'text-ink-300',
        href: `/milestones/${e.milestoneId}`,
      };
    case 'agent.step':
      return { icon: <Bot className="size-3.5" />, text: e.detail, tone: 'text-iris-300', href: `/milestones/${e.milestoneId}` };
    case 'contract.created':
      return { icon: <FilePlus2 className="size-3.5" />, text: <>Contract created · {e.title}</>, tone: 'text-sky-300', href: `/contracts/${e.contractId}` };
    default:
      return null;
  }
}

export function LiveFeed({ className }: { className?: string }) {
  const events = useLiveEvents();
  const items = events.map((e) => ({ e, d: describe(e) })).filter((x) => x.d !== null).slice(0, 40);
  return (
    <aside className={cn('glass flex flex-col overflow-hidden rounded-3xl', className)} aria-label="Live event feed">
      <div className="flex items-center gap-2 border-b border-white/[0.06] px-4 py-3">
        <Radio className="size-4 text-mint-300" />
        <h3 className="text-sm font-semibold text-white">Live feed</h3>
        <span className="ml-auto text-[11px] text-ink-400">SSE · webhooks · agent</span>
      </div>
      <ol data-lenis-prevent className="scrollbar-thin flex-1 overflow-y-auto p-2" aria-live="polite">
        {items.length === 0 ? (
          <li className="px-3 py-10 text-center text-sm text-ink-400">Waiting for events… fund a milestone or run the demo scenario.</li>
        ) : null}
        <AnimatePresence initial={false}>
          {items.map(({ e, d }) => (
            <motion.li
              key={e.id}
              layout
              initial={{ opacity: 0, x: 16, scale: 0.98 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={{ type: 'spring', stiffness: 380, damping: 32 }}
            >
              {d!.href ? (
                <Link to={d!.href} className="flex gap-2.5 rounded-xl px-2.5 py-2 hover:bg-white/[0.04]">
                  <FeedRow time={e.at} icon={d!.icon} tone={d!.tone} text={d!.text} />
                </Link>
              ) : (
                <div className="flex gap-2.5 rounded-xl px-2.5 py-2">
                  <FeedRow time={e.at} icon={d!.icon} tone={d!.tone} text={d!.text} />
                </div>
              )}
            </motion.li>
          ))}
        </AnimatePresence>
      </ol>
    </aside>
  );
}

function FeedRow({ time, icon, tone, text }: { time: string; icon: ReactNode; tone: string; text: ReactNode }) {
  return (
    <>
      <span className={cn('mt-0.5 grid size-6 shrink-0 place-items-center rounded-lg bg-white/5', tone)}>{icon}</span>
      <span className="min-w-0 flex-1 text-[12.5px] leading-snug text-ink-300">
        {text}
        <span className="block font-mono text-[10.5px] text-ink-500">{clock(time)}</span>
      </span>
    </>
  );
}
