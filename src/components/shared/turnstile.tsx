"use client";

import { useEffect, useImperativeHandle, useRef, forwardRef } from "react";

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, opts: Record<string, unknown>) => string;
      reset: (id?: string) => void;
      remove: (id?: string) => void;
    };
  }
}

export type TurnstileHandle = { reset: () => void };
const SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

/** Cloudflare Turnstile bot check. Renders nothing if no site key is configured. */
export const Turnstile = forwardRef<TurnstileHandle, { onToken: (token: string) => void }>(function Turnstile({ onToken }, ref) {
  const box = useRef<HTMLDivElement>(null);
  const widget = useRef<string | undefined>(undefined);

  useImperativeHandle(ref, () => ({ reset: () => { onToken(""); if (window.turnstile) window.turnstile.reset(widget.current); } }), [onToken]);

  useEffect(() => {
    if (!SITE_KEY || !box.current) return;
    let cancelled = false;
    const mount = () => {
      if (cancelled || !window.turnstile || !box.current || widget.current) return;
      widget.current = window.turnstile.render(box.current, {
        sitekey: SITE_KEY,
        callback: (t: string) => onToken(t),
        "expired-callback": () => onToken(""),
        "error-callback": () => onToken(""),
      });
    };
    if (window.turnstile) mount();
    else {
      let s = document.querySelector<HTMLScriptElement>(`script[src="${SRC}"]`);
      if (!s) { s = document.createElement("script"); s.src = SRC; s.async = true; s.defer = true; document.head.appendChild(s); }
      s.addEventListener("load", mount);
    }
    return () => { cancelled = true; if (widget.current && window.turnstile) window.turnstile.remove(widget.current); widget.current = undefined; };
  }, [onToken]);

  if (!SITE_KEY) return null;
  return <div ref={box} className="flex justify-center" aria-label="Security check" />;
});
