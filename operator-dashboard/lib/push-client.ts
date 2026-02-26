'use client';

const DEFAULT_SERVICE_WORKER_URL = '/pwa-sw.js';
const READY_TIMEOUT_MS = 1500;

export function isPushSupported() {
  if (typeof window === 'undefined') return false;
  return 'Notification' in window && 'serviceWorker' in navigator && 'PushManager' in window;
}

export function base64UrlToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; i += 1) {
    outputArray[i] = rawData.charCodeAt(i);
  }

  return outputArray;
}

async function waitForReadyRegistration() {
  const timeoutPromise = new Promise<ServiceWorkerRegistration | null>((resolve) => {
    window.setTimeout(() => resolve(null), READY_TIMEOUT_MS);
  });

  const readyPromise = navigator.serviceWorker.ready.catch(() => null);
  return Promise.race([readyPromise, timeoutPromise]);
}

export async function getOrRegisterPushServiceWorker(options?: { scope?: string; swUrl?: string }) {
  if (!isPushSupported()) {
    throw new Error('Push notifications are not supported on this browser/device.');
  }

  const scope = options?.scope;
  const swUrl = options?.swUrl ?? DEFAULT_SERVICE_WORKER_URL;

  if (scope) {
    const scopedRegistration = await navigator.serviceWorker.getRegistration(scope);
    if (scopedRegistration) return scopedRegistration;
  }

  const anyRegistration = await navigator.serviceWorker.getRegistration();
  if (anyRegistration) return anyRegistration;

  const readyRegistration = await waitForReadyRegistration();
  if (readyRegistration) return readyRegistration;

  return navigator.serviceWorker.register(swUrl, scope ? { scope } : undefined);
}

export async function getCurrentPushSubscription(options?: { scope?: string; swUrl?: string }) {
  const registration = await getOrRegisterPushServiceWorker(options);
  return registration.pushManager.getSubscription();
}

export async function subscribeToPush(vapidPublicKey: string, options?: { scope?: string; swUrl?: string }) {
  const registration = await getOrRegisterPushServiceWorker(options);
  let subscription = await registration.pushManager.getSubscription();

  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: base64UrlToUint8Array(vapidPublicKey),
    });
  }

  return subscription;
}

export async function unsubscribeFromPush(options?: { scope?: string; swUrl?: string }) {
  const registration = await getOrRegisterPushServiceWorker(options);
  const subscription = await registration.pushManager.getSubscription();

  if (!subscription) {
    return { endpoint: null as string | null };
  }

  const endpoint = subscription.endpoint;
  await subscription.unsubscribe();

  return { endpoint };
}
