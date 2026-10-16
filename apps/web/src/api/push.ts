import { api } from "./client.ts";
import type { NotificationState } from "../data/types.ts";

const supported = () => "Notification" in window && "serviceWorker" in navigator && "PushManager" in window;

/** Asks for permission (if needed) and subscribes this browser to push from the API. */
export async function enablePush(): Promise<NotificationState> {
  if (!supported()) return "unsupported";
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return permission === "denied" ? "denied" : "off";
  await syncPush();
  return "on";
}

/**
 * Makes sure the API has this browser's subscription. Safe to call on every
 * load: it never prompts, and does nothing without permission or server push.
 */
export async function syncPush(): Promise<void> {
  if (!supported() || Notification.permission !== "granted") return;
  const { data: config } = await api.GET("/v1/push/config");
  if (!config?.enabled || !config.publicKey) return;
  const reg = await navigator.serviceWorker.register("/sw.js");
  await navigator.serviceWorker.ready;
  const key = base64UrlToBytes(config.publicKey);
  let sub = await reg.pushManager.getSubscription();
  // A subscription made with an older server key can't receive anything: replace it.
  if (sub && !sameKey(sub.options.applicationServerKey, key)) {
    await sub.unsubscribe();
    sub = null;
  }
  sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
  const json = sub.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys.auth) return;
  await api.PUT("/v1/me/push-subscriptions", {
    body: { endpoint: json.endpoint, keys: { p256dh: json.keys.p256dh, auth: json.keys.auth } },
  });
}

/** Stops push to this browser, on the server and in the browser. */
export async function disablePush(): Promise<void> {
  if (!supported()) return;
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return;
  await api.DELETE("/v1/me/push-subscriptions", { body: { endpoint: sub.endpoint } }).catch(() => undefined);
  await sub.unsubscribe();
}

function base64UrlToBytes(s: string): Uint8Array<ArrayBuffer> {
  const b64 = (s + "=".repeat((4 - (s.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function sameKey(a: ArrayBuffer | null, b: Uint8Array): boolean {
  if (!a) return false;
  const x = new Uint8Array(a);
  return x.length === b.length && x.every((v, i) => v === b[i]);
}
