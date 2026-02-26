'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Copy } from 'lucide-react';
import { generateApiKeyAction, revokeApiKeyAction } from '@/app/actions/api-access';
import { formatDateTime } from '@/lib/format';

type ApiKeyRow = {
  id: string;
  name: string;
  keyPrefix: string;
  permissions: string[];
  usageCountToday: number;
  createdAt: string;
  lastUsedAt: string | null;
  isActive: boolean;
};

export default function ApiKeysSettingsClient({ rows, canEdit }: { rows: ApiKeyRow[]; canEdit: boolean }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [name, setName] = useState('');
  const [permission, setPermission] = useState<'read' | 'commands' | 'full'>('read');
  const [showModal, setShowModal] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [rawKey, setRawKey] = useState<string | null>(null);

  const totalRequestsToday = useMemo(() => rows.reduce((sum, row) => sum + row.usageCountToday, 0), [rows]);

  const generate = () => {
    setErrorMessage(null);
    setSuccessMessage(null);

    startTransition(async () => {
      const result = await generateApiKeyAction({ name, permission });
      if (!result.ok) {
        setErrorMessage(result.error ?? 'Failed to generate API key');
        return;
      }
      setRawKey(result.rawKey);
      setSuccessMessage('API key created. Copy it now, it will not be shown again.');
      setName('');
      setPermission('read');
      router.refresh();
    });
  };

  const revoke = (keyId: string) => {
    setErrorMessage(null);
    setSuccessMessage(null);

    startTransition(async () => {
      const result = await revokeApiKeyAction({ keyId });
      if (!result.ok) {
        setErrorMessage(result.error ?? 'Failed to revoke key');
        return;
      }
      setSuccessMessage('API key revoked.');
      router.refresh();
    });
  };

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-slate-900">API Key Management</h2>
            <p className="text-sm text-slate-600">Manage integration keys for enterprise clients.</p>
            <p className="mt-1 text-xs font-semibold text-slate-500">Requests today: {totalRequestsToday}</p>
          </div>
          <button
            type="button"
            disabled={!canEdit}
            onClick={() => {
              if (!canEdit) return;
              setShowModal(true);
              setRawKey(null);
              setErrorMessage(null);
              setSuccessMessage(null);
            }}
            className="inline-flex h-12 items-center rounded-lg bg-[#0D2B4E] px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            + Generate Key
          </button>
        </div>
        {!canEdit ? (
          <p className="mt-2 text-xs font-semibold text-amber-700">
            Read-only access. Admin or manager permissions are required to create or revoke keys.
          </p>
        ) : null}
      </section>

      {successMessage ? <p className="text-sm font-semibold text-emerald-700">{successMessage}</p> : null}
      {errorMessage ? <p className="text-sm font-semibold text-red-700">{errorMessage}</p> : null}

      <section className="overflow-x-auto rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-slate-500">
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Prefix</th>
              <th className="px-3 py-2">Permissions</th>
              <th className="px-3 py-2">Created</th>
              <th className="px-3 py-2">Last Used</th>
              <th className="px-3 py-2">Usage Today</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Action</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b border-slate-100">
                <td className="px-3 py-2 font-medium text-slate-900">{row.name}</td>
                <td className="px-3 py-2 font-mono text-xs text-slate-700">{row.keyPrefix}</td>
                <td className="px-3 py-2 text-slate-600">{row.permissions.join(', ')}</td>
                <td className="px-3 py-2 text-slate-600">{formatDateTime(row.createdAt)}</td>
                <td className="px-3 py-2 text-slate-600">{formatDateTime(row.lastUsedAt)}</td>
                <td className="px-3 py-2 text-slate-600">{row.usageCountToday}</td>
                <td className="px-3 py-2">
                  <span className={`rounded-full px-2 py-1 text-xs font-semibold ${row.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-700'}`}>
                    {row.isActive ? 'active' : 'revoked'}
                  </span>
                </td>
                <td className="px-3 py-2">
                  <button
                    type="button"
                    disabled={!canEdit || !row.isActive || isPending}
                    onClick={() => revoke(row.id)}
                    className="h-10 rounded-lg border border-slate-300 px-3 text-xs font-semibold text-slate-700 disabled:opacity-50"
                  >
                    Revoke
                  </button>
                </td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td className="px-3 py-4 text-slate-500" colSpan={8}>
                  No API keys created yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>

      {showModal ? (
        <>
          <div className="fixed inset-0 z-40 bg-black/35" onClick={() => setShowModal(false)} />
          <section className="fixed inset-x-0 bottom-0 z-50 rounded-t-2xl border border-slate-200 bg-white p-5 shadow-xl md:inset-auto md:bottom-8 md:left-1/2 md:w-full md:max-w-lg md:-translate-x-1/2 md:rounded-2xl">
            <h3 className="text-base font-semibold text-slate-900">Generate API Key</h3>

            {!rawKey ? (
              <div className="mt-4 space-y-3">
                <label className="block text-sm font-medium text-slate-700">
                  Name
                  <input
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    className="mt-1 h-12 w-full rounded-lg border border-slate-300 px-3 text-sm"
                  />
                </label>

                <label className="block text-sm font-medium text-slate-700">
                  Permissions
                  <select
                    value={permission}
                    onChange={(event) => setPermission(event.target.value as 'read' | 'commands' | 'full')}
                    className="mt-1 h-12 w-full rounded-lg border border-slate-300 px-3 text-sm"
                  >
                    <option value="read">Read Only</option>
                    <option value="commands">Read + Commands</option>
                    <option value="full">Full Access</option>
                  </select>
                </label>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={generate}
                    disabled={isPending || !canEdit}
                    className="inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-[#0D2B4E] px-4 text-sm font-semibold text-white disabled:opacity-60"
                  >
                    {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    Generate
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowModal(false)}
                    className="inline-flex h-12 items-center justify-center rounded-lg border border-slate-300 px-4 text-sm font-semibold text-slate-700"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="mt-4 space-y-3">
                <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                  This key will not be shown again. Copy it now and store it securely.
                </p>
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <p className="break-all font-mono text-sm text-slate-900">{rawKey}</p>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(rawKey);
                      } catch {
                        // noop
                      }
                    }}
                    className="inline-flex h-12 items-center gap-2 rounded-lg border border-slate-300 px-4 text-sm font-semibold text-slate-700"
                  >
                    <Copy className="h-4 w-4" />
                    Copy
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowModal(false)}
                    className="inline-flex h-12 items-center rounded-lg bg-[#0D2B4E] px-4 text-sm font-semibold text-white"
                  >
                    Done
                  </button>
                </div>
              </div>
            )}
          </section>
        </>
      ) : null}
    </div>
  );
}
