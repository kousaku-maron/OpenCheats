import { useState } from 'preact/hooks';
import { BadgeCheck, ChevronDown, ChevronUp, CircleAlert, KeyRound, Trash2 } from 'lucide-preact';
import openaiIcon from '@lobehub/icons-static-svg/icons/openai.svg?url';
import nanobananaIcon from '@lobehub/icons-static-svg/icons/nanobanana.svg?url';
import klingIcon from '@lobehub/icons-static-svg/icons/kling.svg?url';

type ProviderSummary = {
  provider: 'openai' | 'google' | 'klingai';
  configured: boolean;
  key_hint: string | null;
  updated_at: string | Date | null;
};

type ProviderStatusTone = 'muted' | 'success' | 'error';

type ProviderStatus = {
  tone: ProviderStatusTone;
  message: string;
};

type ProviderDraft = {
  access_key: string;
  secret_key: string;
};

type Props = {
  initialSummaries: ProviderSummary[];
};

const providerDetails = {
  openai: {
    name: 'OpenAI',
    iconUrl: openaiIcon,
    accessLabel: 'API Key',
    accessPlaceholder: 'sk-...',
    secretLabel: null,
    secretPlaceholder: '',
  },
  google: {
    name: 'Nano Banana',
    iconUrl: nanobananaIcon,
    accessLabel: 'API Key',
    accessPlaceholder: 'AIza...',
    secretLabel: null,
    secretPlaceholder: '',
  },
  klingai: {
    name: 'Kling',
    iconUrl: klingIcon,
    accessLabel: 'Access Key',
    accessPlaceholder: 'KlingAI Access Key',
    secretLabel: 'Secret Key',
    secretPlaceholder: 'KlingAI Secret Key',
  },
} as const;

function createEmptyDrafts(): Record<ProviderSummary['provider'], ProviderDraft> {
  return {
    openai: { access_key: '', secret_key: '' },
    google: { access_key: '', secret_key: '' },
    klingai: { access_key: '', secret_key: '' },
  };
}

function createInitialStatuses(): Record<ProviderSummary['provider'], ProviderStatus> {
  return {
    openai: { tone: 'muted', message: 'Connection not tested.' },
    google: { tone: 'muted', message: 'Connection not tested.' },
    klingai: { tone: 'muted', message: 'Connection not tested.' },
  };
}

function getInitialExpandedProvider(summaries: ProviderSummary[]) {
  return summaries.find((summary) => !summary.configured)?.provider ?? summaries[0]?.provider ?? null;
}

function maskStoredValue(value: string | null, fallback = '••••••••') {
  if (!value) {
    return fallback;
  }

  const parts = value.split('...');
  if (parts.length === 2 && parts[0] && parts[1]) {
    return `${parts[0]}••••••${parts[1]}`;
  }

  return `${'•'.repeat(Math.max(4, value.length - 2))}${value.slice(-2)}`;
}

export function ProviderSettingsForm({ initialSummaries }: Props) {
  const [summaries, setSummaries] = useState(initialSummaries);
  const [expandedProvider, setExpandedProvider] = useState<ProviderSummary['provider'] | null>(
    getInitialExpandedProvider(initialSummaries),
  );
  const [drafts, setDrafts] = useState(createEmptyDrafts);
  const [statuses, setStatuses] = useState(createInitialStatuses);
  const [loadingProvider, setLoadingProvider] = useState<ProviderSummary['provider'] | null>(null);

  const updateDraft = (
    provider: ProviderSummary['provider'],
    field: keyof ProviderDraft,
    value: string,
  ) => {
    setDrafts((current) => ({
      ...current,
      [provider]: {
        ...current[provider],
        [field]: value,
      },
    }));
  };

  const updateStatus = (
    provider: ProviderSummary['provider'],
    tone: ProviderStatusTone,
    message: string,
  ) => {
    setStatuses((current) => ({
      ...current,
      [provider]: { tone, message },
    }));
  };

  const handleSubmit = async (provider: ProviderSummary['provider']) => {
    const draft = drafts[provider];

    setLoadingProvider(provider);
    updateStatus(provider, 'muted', 'Testing connection...');

    try {
      const response = await fetch('/api/provider-credentials', {
        method: 'PUT',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          provider,
          access_key: draft.access_key,
          secret_key: draft.secret_key || undefined,
        }),
      });

      const json = await response.json();
      if (!response.ok || !json.success) {
        throw new Error(json.error ?? 'Test & Save failed');
      }

      setSummaries(json.data);
      setDrafts((current) => ({
        ...current,
        [provider]: { access_key: '', secret_key: '' },
      }));
      updateStatus(provider, 'success', json.message ?? 'Connection verified and saved.');
    } catch (error) {
      updateStatus(provider, 'error', error instanceof Error ? error.message : 'Test & Save failed');
    } finally {
      setLoadingProvider(null);
    }
  };

  const handleDelete = async (provider: ProviderSummary['provider']) => {
    setLoadingProvider(provider);
    updateStatus(provider, 'muted', 'Deleting...');

    try {
      const response = await fetch('/api/provider-credentials', {
        method: 'DELETE',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ provider }),
      });

      const json = await response.json();
      if (!response.ok || !json.success) {
        throw new Error(json.error ?? 'Delete failed');
      }

      setSummaries(json.data);
      setDrafts((current) => ({
        ...current,
        [provider]: { access_key: '', secret_key: '' },
      }));
      updateStatus(provider, 'muted', 'Removed.');
    } catch (error) {
      updateStatus(provider, 'error', error instanceof Error ? error.message : 'Delete failed');
    } finally {
      setLoadingProvider(null);
    }
  };

  return (
    <section className="stack-md">
      <div className="prompt-list-header">
        <div>
          <h1 className="section-title section-title-xl">AI Models</h1>
        </div>
      </div>

      <div className="provider-model-list">
        {summaries.map((summary) => {
          const detail = providerDetails[summary.provider];
          const draft = drafts[summary.provider];
          const status = statuses[summary.provider];
          const isExpanded = expandedProvider === summary.provider;
          const isLoading = loadingProvider === summary.provider;

          return (
            <section
              key={summary.provider}
              className={`panel provider-model-card${isExpanded ? ' is-expanded' : ''}`}
            >
              <button
                type="button"
                className="provider-model-card-header"
                onClick={() =>
                  setExpandedProvider((current) =>
                    current === summary.provider ? null : summary.provider,
                  )
                }
                aria-expanded={isExpanded}
              >
                <div className="provider-model-card-main">
                  <div
                    className={`provider-model-icon-frame provider-model-icon-frame-${summary.provider}`}
                    aria-hidden="true"
                  >
                    <img
                      src={detail.iconUrl}
                      alt=""
                      className={`provider-model-icon-image provider-model-icon-image-${summary.provider}`}
                      loading="lazy"
                      decoding="async"
                    />
                  </div>

                  <div className="provider-model-copy">
                    <h2 className="section-title provider-model-name">{detail.name}</h2>
                    {summary.configured ? (
                      <p className="provider-model-tested">
                        <BadgeCheck size={16} aria-hidden="true" />
                        <span>Connection tested</span>
                      </p>
                    ) : null}
                  </div>
                </div>

                <span className="provider-model-chevron" aria-hidden="true">
                  {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                </span>
              </button>

              {isExpanded ? (
                <div className="provider-model-editor stack-md">
                  <div className="provider-model-field-grid">
                    <div className="stack-sm">
                      <label className="field-label" htmlFor={`provider-access-${summary.provider}`}>
                        {detail.accessLabel}
                      </label>
                      <input
                        id={`provider-access-${summary.provider}`}
                        name="access_key"
                        className="text-input"
                        type="password"
                        autoComplete="off"
                        value={draft.access_key}
                        onInput={(event) =>
                          updateDraft(summary.provider, 'access_key', event.currentTarget.value)
                        }
                        placeholder={
                          summary.configured
                            ? maskStoredValue(summary.key_hint, detail.accessPlaceholder)
                            : detail.accessPlaceholder
                        }
                      />
                      {summary.configured && !draft.access_key ? (
                        <p className="provider-model-field-note">
                          Saved key: {maskStoredValue(summary.key_hint)}
                        </p>
                      ) : null}
                    </div>

                    {detail.secretLabel ? (
                      <div className="stack-sm">
                        <label className="field-label" htmlFor={`provider-secret-${summary.provider}`}>
                          {detail.secretLabel}
                        </label>
                        <input
                          id={`provider-secret-${summary.provider}`}
                          name="secret_key"
                          className="text-input"
                          type="password"
                          autoComplete="off"
                          value={draft.secret_key}
                          onInput={(event) =>
                            updateDraft(summary.provider, 'secret_key', event.currentTarget.value)
                          }
                          placeholder={summary.configured ? '••••••••••••' : detail.secretPlaceholder}
                        />
                        {summary.configured && !draft.secret_key ? (
                          <p className="provider-model-field-note">Saved secret: ••••••••••••</p>
                        ) : null}
                      </div>
                    ) : null}
                  </div>

                  <div className="provider-model-footer">
                    <p className={`provider-model-status is-${status.tone}`}>
                      {status.tone === 'error' ? (
                        <CircleAlert size={16} aria-hidden="true" />
                      ) : status.tone === 'success' ? (
                        <BadgeCheck size={16} aria-hidden="true" />
                      ) : (
                        <KeyRound size={16} aria-hidden="true" />
                      )}
                      <span>{status.message}</span>
                    </p>

                    <div className="page-actions">
                      {summary.configured ? (
                        <button
                          type="button"
                          className="btn-ghost-danger button-with-icon"
                          disabled={isLoading}
                          onClick={() => void handleDelete(summary.provider)}
                        >
                          <span className="button-icon" aria-hidden="true">
                            <Trash2 />
                          </span>
                          Delete
                        </button>
                      ) : null}

                      <button
                        type="button"
                        className="btn-primary"
                        disabled={isLoading}
                        onClick={() => void handleSubmit(summary.provider)}
                      >
                        {isLoading ? 'Testing...' : 'Test & Save'}
                      </button>
                    </div>
                  </div>
                </div>
              ) : null}
            </section>
          );
        })}
      </div>
    </section>
  );
}
