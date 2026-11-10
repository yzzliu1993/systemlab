import { useId, useState } from 'react';
import clsx from 'clsx';
import { validateSettings } from '@/domain/simulation/rateLimit';
import type {
  LimiterConfig,
  LimiterScope,
  RetryConfig,
  Settings,
} from '@/domain/simulation/rateLimit';
import { buttonClass, fieldClass } from '@/features/simulation/parts';
import {
  LIMITER_ALGORITHMS,
  RETRY_MODES,
  SCOPES,
  limiterDefault,
  retryDefault,
} from '@/features/simulation/rateLimitSettings';
import { useT } from '@/stores/language';

const MAX_CLIENTS = 20;

type Draft = {
  algorithm: LimiterConfig['algorithm'];
  scope: LimiterScope;
  p1: string;
  p2: string;
  clients: string;
  firstRate: string;
  otherRate: string;
  retryMode: RetryConfig['mode'];
  attempts: string;
  baseDelay: string;
  maxDelay: string;
  concurrency: string;
  processing: string;
  maxQueue: string;
  shedding: boolean;
};

function limiterFields(l: LimiterConfig): [string, string] {
  if (l.algorithm === 'tokenBucket')
    return [String(l.capacity), String(l.refillPerTick)];
  if (l.algorithm === 'leakyBucket')
    return [String(l.queueSize), String(l.drainPerTick)];
  return [String(l.limit), String(l.windowTicks)];
}

function toDraft(s: Settings): Draft {
  const [p1, p2] = limiterFields(s.limiter);
  const first = s.clients[0]?.rate ?? 1;
  const r = s.retry;
  const fallback = retryDefault('backoff') as Extract<
    RetryConfig,
    { mode: 'backoff' }
  >;
  return {
    algorithm: s.limiter.algorithm,
    scope: s.scope,
    p1,
    p2,
    clients: String(s.clients.length),
    firstRate: String(first),
    otherRate: String(s.clients[1]?.rate ?? first),
    retryMode: r.mode,
    attempts: String(r.mode === 'none' ? fallback.maxAttempts : r.maxAttempts),
    baseDelay: String(
      r.mode === 'backoff' ? r.baseDelayTicks : fallback.baseDelayTicks,
    ),
    maxDelay: String(
      r.mode === 'backoff' ? r.maxDelayTicks : fallback.maxDelayTicks,
    ),
    concurrency: String(s.server.concurrency),
    processing: String(s.server.processingTicks),
    maxQueue: String(s.server.maxQueue),
    shedding: s.server.loadShedding,
  };
}

const parse = (text: string) => (text.trim() === '' ? NaN : Number(text));

type Result =
  | { settings: Settings; error?: undefined }
  | { error: string; settings?: undefined };

function build(base: Settings, d: Draft, t: (key: string) => string): Result {
  const count = parse(d.clients);
  if (!Number.isInteger(count) || count < 1 || count > MAX_CLIENTS)
    return { error: t('sim.rl.error.clients') };
  const a = parse(d.p1);
  const b = parse(d.p2);
  let limiter: LimiterConfig;
  if (d.algorithm === 'tokenBucket')
    limiter = { algorithm: 'tokenBucket', capacity: a, refillPerTick: b };
  else if (d.algorithm === 'leakyBucket')
    limiter = { algorithm: 'leakyBucket', queueSize: a, drainPerTick: b };
  else limiter = { algorithm: 'fixedWindow', limit: a, windowTicks: b };

  const attempts = parse(d.attempts);
  let retry: RetryConfig;
  if (d.retryMode === 'none') retry = { mode: 'none' };
  else if (d.retryMode === 'immediate')
    retry = { mode: 'immediate', maxAttempts: attempts };
  else
    retry = {
      mode: 'backoff',
      maxAttempts: attempts,
      baseDelayTicks: parse(d.baseDelay),
      maxDelayTicks: parse(d.maxDelay),
    };

  const firstRate = parse(d.firstRate);
  const otherRate = parse(d.otherRate);
  const burst =
    base.burst && base.burst.client < count ? base.burst : undefined;
  const settings: Settings = {
    ...base,
    clients: Array.from({ length: count }, (_v, i) => ({
      rate: i === 0 ? firstRate : otherRate,
    })),
    burst,
    limiter,
    scope: d.scope,
    server: {
      concurrency: parse(d.concurrency),
      processingTicks: parse(d.processing),
      loadShedding: d.shedding,
      maxQueue: parse(d.maxQueue),
    },
    retry,
  };
  try {
    validateSettings(settings);
  } catch {
    return { error: t('sim.rl.error.number') };
  }
  return { settings };
}

const PARAM_KEYS: Record<LimiterConfig['algorithm'], [string, string]> = {
  tokenBucket: ['sim.rl.param.capacity', 'sim.rl.param.refill'],
  leakyBucket: ['sim.rl.param.queueSize', 'sim.rl.param.drain'],
  fixedWindow: ['sim.rl.param.limit', 'sim.rl.param.windowTicks'],
};

/**
 * Editable values for section 5. Nothing reaches the run until Apply, and
 * invalid input is refused with a message. Remount (new key) to reload values.
 */
export default function RateLimitSettingsForm({
  settings,
  onApply,
}: {
  settings: Settings;
  onApply: (settings: Settings) => void;
}) {
  const t = useT();
  const uid = useId();
  const [draft, setDraft] = useState(() => toDraft(settings));
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  const apply = () => {
    const result = build(settings, draft, t);
    if (result.error !== undefined) {
      setError(result.error);
      return;
    }
    setError(null);
    onApply(result.settings);
  };

  const number = (id: string, label: string, key: keyof Draft & string) => (
    <div className="flex flex-col gap-1">
      <label htmlFor={`${uid}-${id}`} className="text-sm font-medium">
        {label}
      </label>
      <input
        id={`${uid}-${id}`}
        type="number"
        step="any"
        className={clsx(fieldClass, 'w-28')}
        value={draft[key] as string}
        onChange={(event) => set(key, event.target.value as never)}
      />
    </div>
  );

  const select = <V extends string>(
    id: string,
    label: string,
    value: V,
    options: readonly V[],
    optionLabel: (option: V) => string,
    onChange: (value: V) => void,
  ) => (
    <div className="flex flex-col gap-1">
      <label htmlFor={`${uid}-${id}`} className="text-sm font-medium">
        {label}
      </label>
      <select
        id={`${uid}-${id}`}
        className={fieldClass}
        value={value}
        onChange={(event) => onChange(event.target.value as V)}
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {optionLabel(option)}
          </option>
        ))}
      </select>
    </div>
  );

  const [k1, k2] = PARAM_KEYS[draft.algorithm];

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        apply();
      }}
    >
      <h4 className="font-semibold">{t('sim.rl.settings.title')}</h4>
      <div className="flex flex-wrap items-end gap-3">
        {select(
          'algorithm',
          t('sim.rl.algorithm.label'),
          draft.algorithm,
          LIMITER_ALGORITHMS,
          (a) => t(`sim.rl.algorithm.${a}`),
          (algorithm) => {
            const [p1, p2] = limiterFields(limiterDefault(algorithm));
            setDraft((d) => ({ ...d, algorithm, p1, p2 }));
          },
        )}
        {select(
          'scope',
          t('sim.rl.scope.label'),
          draft.scope,
          SCOPES,
          (s) => t(`sim.rl.scope.${s}`),
          (scope) => set('scope', scope),
        )}
        {number('p1', t(k1), 'p1')}
        {number('p2', t(k2), 'p2')}
      </div>
      <div className="flex flex-wrap items-end gap-3">
        {number('clients', t('sim.rl.clients.count'), 'clients')}
        {number('firstRate', t('sim.rl.rate.first'), 'firstRate')}
        {number('otherRate', t('sim.rl.rate.others'), 'otherRate')}
      </div>
      <div className="flex flex-wrap items-end gap-3">
        {select(
          'retry',
          t('sim.rl.retry.label'),
          draft.retryMode,
          RETRY_MODES,
          (m) => t(`sim.rl.retry.${m}`),
          (retryMode) => set('retryMode', retryMode),
        )}
        {draft.retryMode !== 'none' &&
          number('attempts', t('sim.rl.retry.attempts'), 'attempts')}
        {draft.retryMode === 'backoff' &&
          number('baseDelay', t('sim.rl.retry.baseDelay'), 'baseDelay')}
        {draft.retryMode === 'backoff' &&
          number('maxDelay', t('sim.rl.retry.maxDelay'), 'maxDelay')}
      </div>
      <div className="flex flex-wrap items-end gap-3">
        {number('concurrency', t('sim.rl.server.concurrency'), 'concurrency')}
        {number('processing', t('sim.rl.server.processing'), 'processing')}
        {number('maxQueue', t('sim.rl.server.maxQueue'), 'maxQueue')}
        <label className="flex items-center gap-2 text-sm font-medium">
          <input
            type="checkbox"
            checked={draft.shedding}
            onChange={(event) => set('shedding', event.target.checked)}
          />
          {t('sim.rl.server.shedding')}
        </label>
      </div>
      {error && <p role="alert">{error}</p>}
      <div>
        <button type="submit" className={buttonClass}>
          {t('sim.rl.settings.apply')}
        </button>
      </div>
    </form>
  );
}
