import { useEffect, useEffectEvent, useRef } from "react";

interface GoogleId {
  initialize(opts: { client_id: string; callback: (r: { credential: string }) => void }): void;
  renderButton(el: HTMLElement, opts: Record<string, unknown>): void;
}
declare global {
  interface Window {
    google?: { accounts: { id: GoogleId } };
  }
}

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;

let scriptPromise: Promise<void> | null = null;
function loadScript(): Promise<void> {
  scriptPromise ??= new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Couldn't load Google sign-in"));
    document.head.appendChild(s);
  });
  return scriptPromise;
}

/**
 * Google's own button (Google Identity Services). It hands back an ID token,
 * which the API verifies at POST /v1/auth/google.
 */
export function GoogleSignIn({ onToken }: { onToken: (idToken: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const handle = useEffectEvent((token: string) => onToken(token));

  useEffect(() => {
    if (!CLIENT_ID) return;
    let cancelled = false;
    void loadScript().then(() => {
      const el = ref.current;
      if (cancelled || !el || !window.google) return;
      window.google.accounts.id.initialize({ client_id: CLIENT_ID, callback: (r) => handle(r.credential) });
      window.google.accounts.id.renderButton(el, {
        type: "standard",
        theme: "outline",
        size: "large",
        shape: "pill",
        text: "continue_with",
        width: el.offsetWidth || 320,
      });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!CLIENT_ID) return null;
  return <div ref={ref} className="google-btn" />;
}
