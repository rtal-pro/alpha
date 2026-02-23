'use client';

import { useEffect, useState } from 'react';

// ---------------------------------------------------------------------------
// Credential definitions — grouped by service
// ---------------------------------------------------------------------------

interface CredentialDef {
  key: string;
  label: string;
  placeholder: string;
  helpUrl: string;
  helpText: string;
}

interface CredentialGroup {
  name: string;
  description: string;
  scrapers: string[];
  credentials: CredentialDef[];
}

const CREDENTIAL_GROUPS: CredentialGroup[] = [
  {
    name: 'Reddit',
    description: 'Access Reddit posts, comments, and subreddit data',
    scrapers: ['Reddit'],
    credentials: [
      {
        key: 'REDDIT_CLIENT_ID',
        label: 'Client ID',
        placeholder: 'e.g., aB3xY9...',
        helpUrl: 'https://www.reddit.com/prefs/apps',
        helpText: 'Create a "script" app at reddit.com/prefs/apps',
      },
      {
        key: 'REDDIT_CLIENT_SECRET',
        label: 'Client Secret',
        placeholder: 'e.g., kL8mN2...',
        helpUrl: 'https://www.reddit.com/prefs/apps',
        helpText: 'Found under your Reddit app settings',
      },
    ],
  },
  {
    name: 'GitHub',
    description: 'Access repositories, stars, and trending projects',
    scrapers: ['GitHub'],
    credentials: [
      {
        key: 'GITHUB_TOKEN',
        label: 'Personal Access Token',
        placeholder: 'ghp_...',
        helpUrl: 'https://github.com/settings/tokens',
        helpText: 'Generate a classic token with "public_repo" scope',
      },
    ],
  },
  {
    name: 'Product Hunt',
    description: 'Access product launches and upvotes',
    scrapers: ['Product Hunt', 'Job Boards (partial)'],
    credentials: [
      {
        key: 'PRODUCTHUNT_API_TOKEN',
        label: 'API Token',
        placeholder: 'e.g., ey...',
        helpUrl: 'https://api.producthunt.com/v2/docs',
        helpText: 'Create a developer application on Product Hunt',
      },
    ],
  },
  {
    name: 'Twitter / X',
    description: 'Access tweets and trending topics',
    scrapers: ['Twitter/X'],
    credentials: [
      {
        key: 'TWITTER_BEARER_TOKEN',
        label: 'Bearer Token',
        placeholder: 'AAAA...',
        helpUrl: 'https://developer.twitter.com/en/portal/dashboard',
        helpText: 'Requires a Twitter Developer account (v2 API)',
      },
    ],
  },
  {
    name: 'SerpAPI',
    description: 'Powers Google Trends, G2 Reviews, Capterra, SimilarWeb, and SERP results',
    scrapers: ['Google Trends', 'G2 Reviews', 'Capterra', 'SimilarWeb', 'SerpAPI SERP'],
    credentials: [
      {
        key: 'SERPAPI_KEY',
        label: 'API Key',
        placeholder: 'e.g., abc123...',
        helpUrl: 'https://serpapi.com/manage-api-key',
        helpText: 'One key powers 5 scrapers. Free tier: 100 searches/month',
      },
    ],
  },
  {
    name: 'Stack Overflow',
    description: 'Access questions, answers, and trending tags',
    scrapers: ['Stack Overflow'],
    credentials: [
      {
        key: 'STACKOVERFLOW_API_KEY',
        label: 'API Key',
        placeholder: 'e.g., xYz...',
        helpUrl: 'https://stackapps.com/',
        helpText: 'Register an app on Stack Apps to get an API key',
      },
    ],
  },
  {
    name: 'Crunchbase',
    description: 'Access startup funding data and company profiles',
    scrapers: ['Crunchbase'],
    credentials: [
      {
        key: 'CRUNCHBASE_API_KEY',
        label: 'API Key',
        placeholder: 'e.g., abc123...',
        helpUrl: 'https://data.crunchbase.com/docs/using-the-api',
        helpText: 'Requires Crunchbase Pro or Enterprise plan',
      },
    ],
  },
  {
    name: 'BuiltWith',
    description: 'Access technology usage data across websites',
    scrapers: ['BuiltWith'],
    credentials: [
      {
        key: 'BUILTWITH_API_KEY',
        label: 'API Key',
        placeholder: 'e.g., abc123...',
        helpUrl: 'https://builtwith.com/api',
        helpText: 'Sign up for a BuiltWith API plan',
      },
    ],
  },
  {
    name: 'Legifrance (PISTE)',
    description: 'Access French legal texts and regulations',
    scrapers: ['Legifrance'],
    credentials: [
      {
        key: 'LEGIFRANCE_API_KEY',
        label: 'API Key',
        placeholder: 'e.g., abc123...',
        helpUrl: 'https://piste.gouv.fr/',
        helpText: 'Register on PISTE (French government API platform)',
      },
    ],
  },
  {
    name: 'INSEE SIRENE',
    description: 'Access French company registry data',
    scrapers: ['INSEE'],
    credentials: [
      {
        key: 'SIRENE_API_KEY',
        label: 'API Key',
        placeholder: 'e.g., abc123...',
        helpUrl: 'https://api.insee.fr/catalogue/',
        helpText: 'Register on INSEE API portal for SIRENE access',
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SettingState {
  masked_value: string;
  is_set: boolean;
  updated_at: string | null;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function SettingsPage() {
  const [settings, setSettings] = useState<Record<string, SettingState>>({});
  const [values, setValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Load current settings
  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/settings');
        if (!res.ok) throw new Error('Failed to load settings');
        const data = await res.json();
        const map: Record<string, SettingState> = {};
        for (const s of data.settings) {
          map[s.key] = s;
        }
        setSettings(map);
      } catch {
        setMessage({ type: 'error', text: 'Failed to load settings' });
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);

    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credentials: values }),
      });

      if (!res.ok) throw new Error('Failed to save');
      const data = await res.json();

      setMessage({ type: 'success', text: `Saved ${data.saved} credential${data.saved !== 1 ? 's' : ''}` });
      setValues({});

      // Reload settings
      const reload = await fetch('/api/settings');
      const reloadData = await reload.json();
      const map: Record<string, SettingState> = {};
      for (const s of reloadData.settings) {
        map[s.key] = s;
      }
      setSettings(map);
    } catch {
      setMessage({ type: 'error', text: 'Failed to save credentials' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (key: string) => {
    try {
      const res = await fetch(`/api/settings?key=${key}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete');

      setSettings((prev) => ({
        ...prev,
        [key]: { masked_value: '', is_set: false, updated_at: null },
      }));
      setMessage({ type: 'success', text: `Removed ${key}` });
    } catch {
      setMessage({ type: 'error', text: `Failed to remove ${key}` });
    }
  };

  const configuredCount = Object.values(settings).filter((s) => s.is_set).length;
  const totalKeys = CREDENTIAL_GROUPS.reduce((sum, g) => sum + g.credentials.length, 0);

  return (
    <div className="p-8 max-w-4xl">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-zinc-100 mb-2">Settings</h1>
        <p className="text-zinc-400">
          Configure API credentials for scrapers that require authentication.
          Credentials are stored encrypted in your local database.
        </p>
      </div>

      {/* Status bar */}
      <div className="mb-8 p-4 rounded-xl bg-zinc-900 border border-zinc-800">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-600/10 flex items-center justify-center">
              <svg className="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-medium text-zinc-200">
                {configuredCount} / {totalKeys} credentials configured
              </p>
              <p className="text-xs text-zinc-500">
                25 scrapers work without keys. {totalKeys - configuredCount} keys needed to unlock the remaining 15.
              </p>
            </div>
          </div>
          <div className="w-32 h-2 rounded-full bg-zinc-800">
            <div
              className="h-2 rounded-full bg-blue-500 transition-all"
              style={{ width: `${totalKeys > 0 ? (configuredCount / totalKeys) * 100 : 0}%` }}
            />
          </div>
        </div>
      </div>

      {/* Message */}
      {message && (
        <div
          className={`mb-6 p-4 rounded-xl border text-sm ${
            message.type === 'success'
              ? 'bg-green-900/20 border-green-800 text-green-300'
              : 'bg-red-900/20 border-red-800 text-red-300'
          }`}
        >
          {message.text}
        </div>
      )}

      {/* Loading */}
      {loading ? (
        <div className="flex items-center justify-center py-24">
          <div className="w-8 h-8 border-2 border-zinc-600 border-t-blue-500 rounded-full animate-spin" />
        </div>
      ) : (
        <>
          {/* Credential Groups */}
          <div className="space-y-6">
            {CREDENTIAL_GROUPS.map((group) => (
              <div
                key={group.name}
                className="rounded-xl border border-zinc-800 overflow-hidden"
              >
                {/* Group Header */}
                <div className="px-6 py-4 bg-zinc-900 border-b border-zinc-800">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-semibold text-zinc-100">{group.name}</h3>
                      <p className="text-xs text-zinc-500 mt-0.5">{group.description}</p>
                    </div>
                    <div className="flex gap-1.5">
                      {group.scrapers.map((s) => (
                        <span
                          key={s}
                          className="px-2 py-0.5 text-[10px] font-medium rounded-full bg-zinc-800 text-zinc-400 border border-zinc-700"
                        >
                          {s}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Credential Fields */}
                <div className="px-6 py-4 space-y-4">
                  {group.credentials.map((cred) => {
                    const state = settings[cred.key];
                    const isSet = state?.is_set ?? false;
                    const currentValue = values[cred.key] ?? '';

                    return (
                      <div key={cred.key}>
                        <div className="flex items-center justify-between mb-1.5">
                          <label className="text-sm font-medium text-zinc-300">
                            {cred.label}
                            <span className="ml-2 text-[10px] font-mono text-zinc-600">{cred.key}</span>
                          </label>
                          <div className="flex items-center gap-2">
                            {isSet && (
                              <>
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium rounded-full bg-green-500/10 text-green-400 border border-green-500/20">
                                  <span className="w-1 h-1 rounded-full bg-green-400" />
                                  Configured
                                </span>
                                <button
                                  onClick={() => handleDelete(cred.key)}
                                  className="text-[10px] text-red-400 hover:text-red-300 transition-colors"
                                >
                                  Remove
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <input
                            type="password"
                            value={currentValue}
                            onChange={(e) =>
                              setValues((prev) => ({ ...prev, [cred.key]: e.target.value }))
                            }
                            placeholder={isSet ? state.masked_value : cred.placeholder}
                            className="flex-1 px-3 py-2 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-200 text-sm placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent"
                          />
                          <a
                            href={cred.helpUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-3 py-2 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-400 text-sm hover:text-zinc-200 hover:bg-zinc-700 transition-colors flex items-center"
                            title={cred.helpText}
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                            </svg>
                          </a>
                        </div>
                        <p className="mt-1 text-[11px] text-zinc-600">{cred.helpText}</p>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          {/* Save button */}
          <div className="mt-8 flex justify-end">
            <button
              onClick={handleSave}
              disabled={saving || Object.keys(values).length === 0}
              className="px-6 py-2.5 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? 'Saving...' : 'Save Credentials'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
