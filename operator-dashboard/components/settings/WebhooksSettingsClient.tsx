'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import {
  createWebhookSubscriptionAction,
  retryWebhookDeliveryAction,
  testWebhookSubscriptionAction,
  updateWebhookSubscriptionStatusAction,
} from '@/app/actions/api-access';
import { formatDateTime } from '@/lib/format';

type WebhookSubscriptionRow = {
  id: string;
  url: string;
  events: string[];
  isActive: boolean;
  createdAt: string;
};

type WebhookDeliveryRow = {
  id: string;
  subscriptionId: string;
  event: string | null;
  status: number | null;
  responseBody: string | null;
  attemptCount: number;
  nextRetryAt: string | null;
  createdAt: string;
};

const EVENT_OPTIONS = [
  'machine.offline',
  'machine.too_warm',
  'transaction.completed',
  'inventory.low_stock',
  'restock.completed',
] as const;

export default function WebhooksSettingsClient({
  subscriptions,
  deliveries,
  canEdit,
}: {
  subscriptions: WebhookSubscriptionRow[];
  deliveries: WebhookDeliveryRow[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [url, setUrl] = useState('');
  const [selectedEvents, setSelectedEvents] = useState<string[]>(['transaction.completed']);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const deliveriesBySubscription = useMemo(() => {
    const map = new Map<string, WebhookDeliveryRow[]>();
    for (const delivery of deliveries) {
      const rows = map.get(delivery.subscriptionId) ?? [];
      rows.push(delivery);
      map.set(delivery.subscriptionId, rows);
    }
    return map;
  }, [deliveries]);

  const toggleEvent = (event: string) => {
    setSelectedEvents((current) =>
      current.includes(event) ? current.filter((entry) => entry !== event) : [...current, event]
    );
  };

  const create = () => {
    setErrorMessage(null);
    setSuccessMessage(null);

    startTransition(async () => {
      const response = await createWebhookSubscriptionAction({
        url,
        events: selectedEvents,
      });

      if (!response.ok) {
        setErrorMessage(response.error ?? 'Could not create webhook');
        return;
      }

      setUrl('');
      setSelectedEvents(['transaction.completed']);
      setSuccessMessage('Webhook subscription created.');
      router.refresh();
    });
  };

  const test = (subscriptionId: string) => {
    setErrorMessage(null);
    setSuccessMessage(null);

    startTransition(async () => {
      const response = await testWebhookSubscriptionAction({ subscriptionId });
      if (!response.ok) {
        setErrorMessage(response.error ?? 'Test failed');
        return;
      }
      setSuccessMessage('Webhook test sent.');
      router.refresh();
    });
  };

  const retry = (deliveryId: string) => {
    setErrorMessage(null);
    setSuccessMessage(null);

    startTransition(async () => {
      const response = await retryWebhookDeliveryAction({ deliveryId });
      if (!response.ok) {
        setErrorMessage(response.error ?? 'Retry failed');
        return;
      }
      setSuccessMessage('Retry requested.');
      router.refresh();
    });
  };

  const toggleActive = (subscription: WebhookSubscriptionRow) => {
    setErrorMessage(null);
    setSuccessMessage(null);

    startTransition(async () => {
      const response = await updateWebhookSubscriptionStatusAction({
        subscriptionId: subscription.id,
        isActive: !subscription.isActive,
      });
      if (!response.ok) {
        setErrorMessage(response.error ?? 'Could not update webhook status');
        return;
      }
      setSuccessMessage(subscription.isActive ? 'Webhook disabled.' : 'Webhook enabled.');
      router.refresh();
    });
  };

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-bold text-slate-900">Webhook Subscriptions</h2>
        <p className="text-sm text-slate-600">Register URLs to receive machine, transaction and inventory events.</p>

        <div className="mt-4 space-y-3">
          <label className="block text-sm font-medium text-slate-700">
            Endpoint URL
            <input
              type="url"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              className="mt-1 h-12 w-full rounded-lg border border-slate-300 px-3 text-sm"
            />
          </label>

          <div>
            <p className="mb-2 text-sm font-medium text-slate-700">Events</p>
            <div className="grid gap-2 md:grid-cols-2">
              {EVENT_OPTIONS.map((event) => (
                <label key={event} className="inline-flex min-h-12 items-center gap-2 rounded-lg border border-slate-200 px-3 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={selectedEvents.includes(event)}
                    onChange={() => toggleEvent(event)}
                    className="h-4 w-4"
                  />
                  <span>{event}</span>
                </label>
              ))}
            </div>
          </div>

          <button
            type="button"
            onClick={create}
            disabled={isPending || !canEdit}
            className="inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-[#0D2B4E] px-4 text-sm font-semibold text-white disabled:opacity-60"
          >
            {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Save Webhook
          </button>

          {!canEdit ? (
            <p className="text-xs font-semibold text-amber-700">
              Read-only access. Admin or manager permissions are required to create, test, or retry deliveries.
            </p>
          ) : null}
        </div>
      </section>

      {successMessage ? <p className="text-sm font-semibold text-emerald-700">{successMessage}</p> : null}
      {errorMessage ? <p className="text-sm font-semibold text-red-700">{errorMessage}</p> : null}

      <section className="overflow-x-auto rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-slate-500">
              <th className="px-3 py-2">URL</th>
              <th className="px-3 py-2">Events</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Created</th>
              <th className="px-3 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {subscriptions.map((subscription) => (
              <tr key={subscription.id} className="border-b border-slate-100">
                <td className="max-w-[340px] truncate px-3 py-2 text-slate-700">{subscription.url}</td>
                <td className="px-3 py-2 text-slate-600">{subscription.events.join(', ')}</td>
                <td className="px-3 py-2">
                  <span className={`rounded-full px-2 py-1 text-xs font-semibold ${subscription.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-700'}`}>
                    {subscription.isActive ? 'active' : 'inactive'}
                  </span>
                </td>
                <td className="px-3 py-2 text-slate-600">{formatDateTime(subscription.createdAt)}</td>
                <td className="px-3 py-2">
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={isPending || !canEdit}
                      onClick={() => test(subscription.id)}
                      className="h-10 rounded-lg border border-slate-300 px-3 text-xs font-semibold text-slate-700"
                    >
                      Test
                    </button>
                    <button
                      type="button"
                      disabled={isPending || !canEdit}
                      onClick={() => toggleActive(subscription)}
                      className="h-10 rounded-lg border border-slate-300 px-3 text-xs font-semibold text-slate-700"
                    >
                      {subscription.isActive ? 'Disable' : 'Enable'}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {subscriptions.length === 0 ? (
              <tr>
                <td className="px-3 py-4 text-slate-500" colSpan={5}>
                  No webhook subscriptions yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>

      <section className="overflow-x-auto rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="mb-3 text-base font-semibold text-slate-900">Delivery Log (Last 50)</h3>
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-slate-500">
              <th className="px-3 py-2">Event</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Sent At</th>
              <th className="px-3 py-2">Attempt</th>
              <th className="px-3 py-2">Next Retry</th>
              <th className="px-3 py-2">Action</th>
            </tr>
          </thead>
          <tbody>
            {subscriptions.flatMap((subscription) => (deliveriesBySubscription.get(subscription.id) ?? [])).map((delivery) => (
              <tr key={delivery.id} className="border-b border-slate-100">
                <td className="px-3 py-2 text-slate-700">{delivery.event ?? '-'}</td>
                <td className="px-3 py-2 text-slate-700">{delivery.status ?? '-'}</td>
                <td className="px-3 py-2 text-slate-600">{formatDateTime(delivery.createdAt)}</td>
                <td className="px-3 py-2 text-slate-600">{delivery.attemptCount}</td>
                <td className="px-3 py-2 text-slate-600">{formatDateTime(delivery.nextRetryAt)}</td>
                <td className="px-3 py-2">
                  <button
                    type="button"
                    disabled={isPending || !canEdit}
                    onClick={() => retry(delivery.id)}
                    className="h-10 rounded-lg border border-slate-300 px-3 text-xs font-semibold text-slate-700"
                  >
                    Retry
                  </button>
                </td>
              </tr>
            ))}
            {deliveries.length === 0 ? (
              <tr>
                <td className="px-3 py-4 text-slate-500" colSpan={6}>
                  No deliveries yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>
    </div>
  );
}
