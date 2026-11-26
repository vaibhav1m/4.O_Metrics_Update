"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import ThemeToggle from "@/components/ThemeToggle";
import {
  AlertCircle, ArrowLeft, ArrowRight, CheckCircle2, Database, Eye, EyeOff, FolderTree, KeyRound, Loader2, Lock, Mail,
  ShieldCheck, TerminalSquare,
} from "lucide-react";

// Sign-in through mark8auth (the Infytrix account): email + password, then the emailed code when
// the account uses one. The session itself is an httpOnly cookie set by /api/auth/*.

type Step = "credentials" | "otp";

const OTP_LENGTH = 4;
const RESEND_SECONDS = 30;

// Only same-origin relative paths — never bounce to an attacker-supplied URL after login.
function safeNext(raw: string | null): string {
  return raw && raw.startsWith("/") && !raw.startsWith("//") && !raw.startsWith("/login") ? raw : "/";
}

async function post(path: string, body: unknown) {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, data };
}

const HIGHLIGHTS = [
  { icon: Database, title: "Every connection in one place", text: "Browse and edit registered tables across Infytrix databases." },
  { icon: TerminalSquare, title: "Query console with a safety net", text: "Writes need your role's permission and an explicit confirmation." },
  { icon: FolderTree, title: "Your own folders", text: "Group the tables you use, per connection." },
];

/** Four boxes for the emailed code; typing moves on, Backspace moves back, paste fills them all. */
function OtpBoxes({ value, onChange, disabled }: { value: string; onChange: (v: string) => void; disabled: boolean }) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const digits = Array.from({ length: OTP_LENGTH }, (_, i) => value[i] ?? "");

  const setAt = (i: number, d: string) => {
    const next = digits.slice();
    next[i] = d;
    onChange(next.join("").slice(0, OTP_LENGTH));
  };

  return (
    <div className="otp-boxes" onPaste={(e) => {
      const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, OTP_LENGTH);
      if (!pasted) return;
      e.preventDefault();
      onChange(pasted);
      refs.current[Math.min(pasted.length, OTP_LENGTH - 1)]?.focus();
    }}>
      {digits.map((d, i) => (
        <input
          key={i}
          ref={(el) => { refs.current[i] = el; }}
          className={`otp-box${d ? " filled" : ""}`}
          inputMode="numeric"
          autoComplete={i === 0 ? "one-time-code" : "off"}
          aria-label={`Digit ${i + 1}`}
          autoFocus={i === 0}
          disabled={disabled}
          maxLength={1}
          value={d}
          onChange={(e) => {
            const v = e.target.value.replace(/\D/g, "").slice(-1);
            setAt(i, v);
            if (v && i < OTP_LENGTH - 1) refs.current[i + 1]?.focus();
          }}
          onKeyDown={(e) => {
            if (e.key === "Backspace" && !digits[i] && i > 0) {
              setAt(i - 1, "");
              refs.current[i - 1]?.focus();
            }
            if (e.key === "ArrowLeft" && i > 0) refs.current[i - 1]?.focus();
            if (e.key === "ArrowRight" && i < OTP_LENGTH - 1) refs.current[i + 1]?.focus();
          }}
        />
      ))}
    </div>
  );
}

function LoginForm() {
  const params = useSearchParams();
  const next = safeNext(params.get("next"));

  const [step, setStep] = useState<Step>("credentials");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const [otp, setOtp] = useState("");
  const [rememberMe, setRememberMe] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(params.get("error") || "");
  const [info, setInfo] = useState("");
  const [resendIn, setResendIn] = useState(0);

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  // Full navigation (not router.push) so the nav bar loads the new session.
  const finish = () => window.location.assign(next);

  const submitCredentials = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(""); setInfo("");
    try {
      const { ok, data } = await post("/api/auth/login", { email: email.trim(), password });
      if (!ok) { setError(data.error || "Login failed."); return; }
      if (data.mfa_required) {
        setStep("otp");
        setOtp("");
        setResendIn(RESEND_SECONDS);
        setInfo(`We emailed a ${OTP_LENGTH}-digit code to ${email.trim()}.`);
        return;
      }
      finish();
    } catch {
      setError("Could not reach the server. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  const submitOtp = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (otp.length !== OTP_LENGTH) return;
    setBusy(true); setError(""); setInfo("");
    try {
      const { ok, data } = await post("/api/auth/verify-otp", { email: email.trim(), otp, remember_me: rememberMe });
      if (!ok) { setError(data.error || "Verification failed."); setOtp(""); return; }
      finish();
    } catch {
      setError("Could not reach the server. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    setBusy(true); setError(""); setInfo("");
    try {
      const { ok, data } = await post("/api/auth/resend-otp", { email: email.trim() });
      if (!ok) setError(data.error || "Could not resend the code.");
      else { setInfo(data.message || "A new code is on its way."); setOtp(""); setResendIn(RESEND_SECONDS); }
    } catch {
      setError("Could not reach the server. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  const back = () => { setStep("credentials"); setOtp(""); setError(""); setInfo(""); };

  return (
    <div className="login-shell">
      <aside className="login-aside" aria-hidden="true">
        <div className="login-aside-glow" />
        <div className="login-brand">
          <span className="login-brand-mark"><Database size={20} /></span>
          <span>4.OMetrics</span>
        </div>
        <div className="login-aside-body">
          <h2>Database Explorer</h2>
          <p>Infytrix&apos;s window into its data: connections, tables and SQL, with access set per person in Central Admin.</p>
          <ul className="login-highlights">
            {HIGHLIGHTS.map(({ icon: Icon, title, text }) => (
              <li key={title}>
                <span className="login-highlight-icon"><Icon size={18} /></span>
                <div>
                  <strong>{title}</strong>
                  <span>{text}</span>
                </div>
              </li>
            ))}
          </ul>
        </div>
        <div className="login-aside-foot">
          <ShieldCheck size={15} /> Signed in through your Infytrix (Mark8) account
        </div>
      </aside>

      <section className="login-main">
        <div className="login-theme-toggle"><ThemeToggle /></div>
        <div className="login-panel">
          <div className="login-panel-brand">
            <span className="login-brand-mark"><Database size={18} /></span>
            <span>4.OMetrics</span>
          </div>

          {step === "credentials" ? (
            <>
              <header className="login-head">
                <h1>Welcome back</h1>
                <p>Sign in with your Infytrix account to continue.</p>
              </header>

              {error && <div className="login-alert error" role="alert"><AlertCircle size={16} /><span>{error}</span></div>}

              <form onSubmit={submitCredentials} className="login-form" noValidate>
                <div className="login-field">
                  <label htmlFor="email">Work email</label>
                  <div className="login-input">
                    <Mail size={16} className="login-input-icon" />
                    <input id="email" type="email" autoComplete="username" autoFocus required placeholder="name@infytrix.com"
                      value={email} onChange={(e) => setEmail(e.target.value)} disabled={busy} />
                  </div>
                </div>
                <div className="login-field">
                  <label htmlFor="password">Password</label>
                  <div className="login-input">
                    <Lock size={16} className="login-input-icon" />
                    <input id="password" type={showPassword ? "text" : "password"} autoComplete="current-password" required
                      placeholder="Your password" value={password} disabled={busy}
                      onChange={(e) => setPassword(e.target.value)}
                      onKeyUp={(e) => setCapsLock(e.getModifierState("CapsLock"))} />
                    <button type="button" className="login-input-action" onClick={() => setShowPassword((s) => !s)}
                      aria-label={showPassword ? "Hide password" : "Show password"}>
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                  {capsLock && <span className="login-hint warn">Caps Lock is on</span>}
                </div>
                <button type="submit" className="login-submit" disabled={busy || !email.trim() || !password}>
                  {busy ? <Loader2 size={17} className="spin" /> : <>Sign in <ArrowRight size={16} /></>}
                </button>
              </form>
              <p className="login-foot">Forgot your password or need access? Ask an Infytrix admin to reset it or give you 4.OMetrics in Central Admin.</p>
            </>
          ) : (
            <>
              <header className="login-head">
                <span className="login-step-icon"><KeyRound size={20} /></span>
                <h1>Check your email</h1>
                <p>Enter the {OTP_LENGTH}-digit code we sent to <strong>{email.trim()}</strong>.</p>
              </header>

              {error && <div className="login-alert error" role="alert"><AlertCircle size={16} /><span>{error}</span></div>}
              {info && !error && <div className="login-alert ok"><CheckCircle2 size={16} /><span>{info}</span></div>}

              <form onSubmit={submitOtp} className="login-form">
                <OtpBoxes value={otp} onChange={setOtp} disabled={busy} />
                <label className="login-check">
                  <input type="checkbox" checked={rememberMe} onChange={(e) => setRememberMe(e.target.checked)} />
                  <span>Trust this device, don&apos;t ask for a code next time</span>
                </label>
                <button type="submit" className="login-submit" disabled={busy || otp.length !== OTP_LENGTH}>
                  {busy ? <Loader2 size={17} className="spin" /> : <>Verify and continue <ArrowRight size={16} /></>}
                </button>
                <div className="login-row">
                  <button type="button" className="login-link" onClick={back} disabled={busy}><ArrowLeft size={14} /> Use another account</button>
                  <button type="button" className="login-link" onClick={resend} disabled={busy || resendIn > 0}>
                    {resendIn > 0 ? `Resend in ${resendIn}s` : "Resend code"}
                  </button>
                </div>
              </form>
            </>
          )}
        </div>
      </section>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
