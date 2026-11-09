import { formatDateTimeKarachi } from "@/lib/dates";

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export function loginCodeEmail(opts: { code: string; minutes: number; ip: string; when?: Date }) {
  const when = formatDateTimeKarachi(opts.when ?? new Date());
  const subject = "Your FBM Labor login code";
  const text = [
    `Your FBM Labor login code is: ${opts.code}`,
    "",
    `It expires in ${opts.minutes} minutes and can be used once.`,
    `Requested from IP ${opts.ip} on ${when} (Pakistan time).`,
    "",
    "If you did not just try to sign in, someone knows your password. Change your password now and do NOT share this code with anyone.",
  ].join("\n");
  const html = `<div style="font-family:system-ui,sans-serif;max-width:480px;margin:auto;padding:16px">
<h2 style="margin:0 0 12px">FBM Labor login code</h2>
<p style="font-size:34px;letter-spacing:8px;font-weight:700;background:#f3f4f6;padding:14px 18px;border-radius:8px;text-align:center;margin:12px 0">${esc(opts.code)}</p>
<p>This code expires in <b>${opts.minutes} minutes</b> and can be used once.</p>
<p style="color:#555;font-size:13px">Requested from IP ${esc(opts.ip)} on ${esc(when)} (Pakistan time).</p>
<p style="color:#b91c1c;font-size:13px">If you did not just try to sign in, someone knows your password. Change it now. Never share this code with anyone.</p>
</div>`;
  return { subject, text, html };
}
