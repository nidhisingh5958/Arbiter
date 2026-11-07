import type { Severity } from '@arbiter/shared';
import type { UntrustedSource } from '../../llm/prompts';

export interface InjectionRule {
  id: string;
  description: string;
  weight: number;
  pattern: RegExp;
}

/**
 * Pattern rules for instructions aimed at automated reviewers. Weights combine as
 * independent signals: score = 1 − Π(1 − w) over matched rules.
 */
export const INJECTION_RULES: InjectionRule[] = [
  {
    id: 'ignore_instructions',
    description: 'Tells the model to ignore or override its instructions',
    weight: 0.6,
    pattern: /\b(ignore|disregard|forget|override)\b[^.\n]{0,40}\b(previous|prior|above|earlier|all|any|system|your)\b[^.\n]{0,25}\b(instructions?|prompts?|rules?|directives?|criteria)\b/i,
  },
  {
    id: 'approval_command',
    description: 'Commands the reviewer to mark work as approved/complete',
    weight: 0.55,
    pattern: /\b(mark|set|flag|treat|consider)\b[^.\n]{0,40}\b(milestone|submission|pr|pull request|task|deliverable|criteria|criterion)\b[^.\n]{0,40}\b(complete[d]?|approved?|done|passed|accepted|satisfied|verified)\b/i,
  },
  {
    id: 'payment_command',
    description: 'Asks to release or send money',
    weight: 0.55,
    pattern: /\b(release|send|transfer|issue|trigger|pay out|disburse)\b[^.\n]{0,30}\b(the\s+)?(payment|payout|funds|money|escrow)\b/i,
  },
  {
    id: 'verdict_injection',
    description: 'Embeds a verdict or confidence value for the model to copy',
    weight: 0.6,
    pattern: /["']?verdict["']?\s*[:=]\s*["']?approve|\bverdict\s+approve\b|\bconfidence\b[^.\n]{0,20}\b(1(\.0+)?|100\s*%)/i,
  },
  {
    id: 'ai_addressing',
    description: 'Directly addresses an AI reviewer/grader',
    weight: 0.35,
    pattern: /\b(note to|attention|dear|hey|instructions? (for|to))\s+(the\s+)?(ai|llm|assistant|model|agent|bot|reviewer bot|automated reviewer)\b|\b(ai|llm|automated)\s+(reviewer|grader|judge|verifier)s?\b/i,
  },
  {
    id: 'role_hijack',
    description: 'Attempts to change the model role',
    weight: 0.35,
    pattern: /\b(you are now|act as|pretend to be|from now on,? you|new instructions:)\b/i,
  },
  {
    id: 'fake_system_message',
    description: 'Fake system/assistant message markers',
    weight: 0.45,
    pattern: /<\/?\s*(system|assistant|instructions?)\s*>|\[\s*(system|inst)\s*\]|(^|\n)\s*(system|assistant)\s*:/i,
  },
  {
    id: 'policy_bypass',
    description: 'Asks to skip checks, tests or policy',
    weight: 0.4,
    pattern: /\b(bypass|skip|disable|ignore)\b[^.\n]{0,30}\b(policy|checks?|verification|review|tests?|ci|limits?)\b/i,
  },
  {
    id: 'tool_invocation',
    description: 'Names internal agent tools',
    weight: 0.5,
    pattern: /\b(create_payout|capture_order|hold_milestone|create_order|refund_capture|tool_call|function_call)\b/i,
  },
  {
    id: 'concealment',
    description: 'Asks the model to hide the instruction',
    weight: 0.3,
    pattern: /\b(do not|don't|never)\s+(mention|reveal|disclose|report)\b[^.\n]{0,30}\b(this|note|instruction|message)\b/i,
  },
  { id: 'zero_width', description: 'Zero-width characters (hidden text)', weight: 0.25, pattern: /[\u200B-\u200D\u2060\uFEFF]/ },
  { id: 'bidi_override', description: 'Bidirectional override characters', weight: 0.35, pattern: /[\u202A-\u202E\u2066-\u2069]/ },
];

export interface HeuristicMatch {
  ruleId: string;
  description: string;
  weight: number;
  source: string;
  excerpt: string;
}

export interface HeuristicReport {
  score: number;
  severity: Severity;
  matches: HeuristicMatch[];
}

export function severityForScore(score: number): Severity {
  if (score >= 0.85) return 'critical';
  if (score >= 0.6) return 'high';
  if (score >= 0.35) return 'medium';
  if (score > 0) return 'low';
  return 'info';
}

export function scanHeuristics(sources: UntrustedSource[]): HeuristicReport {
  const matches: HeuristicMatch[] = [];
  for (const src of sources) {
    for (const rule of INJECTION_RULES) {
      const m = rule.pattern.exec(src.content);
      if (!m) continue;
      const start = Math.max(0, m.index - 60);
      const end = Math.min(src.content.length, m.index + m[0].length + 80);
      matches.push({
        ruleId: rule.id,
        description: rule.description,
        weight: rule.weight,
        source: src.label,
        excerpt: src.content.slice(start, end).replace(/\s+/g, ' ').trim(),
      });
    }
  }
  // Each rule counts once regardless of how many sources it appears in.
  const weights = new Map<string, number>();
  for (const m of matches) weights.set(m.ruleId, m.weight);
  const score = 1 - [...weights.values()].reduce((p, w) => p * (1 - w), 1);
  const rounded = Math.round(score * 1000) / 1000;
  return { score: rounded, severity: severityForScore(rounded), matches };
}
