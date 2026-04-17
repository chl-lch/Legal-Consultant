import { useEffect, useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { PlansResponse, createCheckoutSession, fetchPlans } from "../lib/api";

const FEATURES = [
  { icon: "📄", text: "Upload unlimited PDF & HTML documents" },
  { icon: "🔍", text: "Hybrid semantic + keyword search across all files" },
  { icon: "⚡", text: "Intent-aware answers: clauses, risk, statutes, summaries" },
  { icon: "📊", text: "Source-cited responses with quality scoring" },
  { icon: "💬", text: "Streaming AI answers with conversation history" },
];

function formatAmount(cents: number, currency: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
    minimumFractionDigits: 0,
  }).format(cents / 100);
}

type Props = { onLogout: () => void };

export function UpgradePage({ onLogout }: Props) {
  const { user, refreshUser } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [plans, setPlans] = useState<PlansResponse | null>(null);
  const [interval, setIntervalMode] = useState<"month" | "year">("month");

  const params = new URLSearchParams(window.location.search);
  const paymentResult = params.get("payment");

  const trialExpired =
    user?.trial_ends_at != null && !user.is_on_trial && user.subscription_status === "none";

  useEffect(() => {
    fetchPlans()
      .then((p) => {
        setPlans(p);
        // Default to annual if available
        if (p.annual) setIntervalMode("year");
      })
      .catch(() => null);
  }, []);

  async function handleSubscribe() {
    setBusy(true);
    setError(null);
    try {
      const { checkout_url } = await createCheckoutSession(interval);
      window.location.href = checkout_url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start checkout.");
      setBusy(false);
    }
  }

  async function handleRefresh() {
    setBusy(true);
    await refreshUser();
    setBusy(false);
    window.history.replaceState({}, "", window.location.pathname);
  }

  const activePlan = interval === "year" && plans?.annual ? plans.annual : plans?.monthly;
  const priceDisplay = activePlan
    ? formatAmount(activePlan.amount_cents, activePlan.currency)
    : "—";

  // Compute savings for annual
  const annualSavings =
    plans?.annual && plans.monthly
      ? Math.round(
          100 -
            (plans.annual.amount_cents / (plans.monthly.amount_cents * 12)) * 100,
        )
      : null;

  return (
    <div className="upgrade-shell">
      <nav className="navbar">
        <div className="navbar-left">
          <div className="navbar-brand">
            <span className="navbar-logo">⚖</span>
            <span className="navbar-name">LexiCounsel</span>
          </div>
        </div>
        <div className="navbar-user">
          <span className="navbar-email">{user?.email}</span>
          <button type="button" className="btn-ghost btn-sm" onClick={onLogout}>
            Sign out
          </button>
        </div>
      </nav>

      <div className="upgrade-content">
        {paymentResult === "success" && (
          <div className="upgrade-banner success">
            Payment received — activating your account…
            <button type="button" className="link-btn" onClick={handleRefresh} style={{ marginLeft: "0.75rem" }}>
              Refresh
            </button>
          </div>
        )}
        {paymentResult === "cancelled" && (
          <div className="upgrade-banner cancelled">
            Checkout cancelled. Your account has not been charged.
          </div>
        )}
        {trialExpired && (
          <div className="upgrade-banner trial-ended">
            Your 7-day free trial has ended. Subscribe below to continue using LexiCounsel.
          </div>
        )}

        <div className="upgrade-card">
          {/* Billing interval toggle */}
          {plans?.annual && (
            <div className="plan-toggle">
              <button
                type="button"
                className={`plan-toggle-btn${interval === "month" ? " active" : ""}`}
                onClick={() => setIntervalMode("month")}
              >
                Monthly
              </button>
              <button
                type="button"
                className={`plan-toggle-btn${interval === "year" ? " active" : ""}`}
                onClick={() => setIntervalMode("year")}
              >
                Annual
                {annualSavings != null && (
                  <span className="plan-save-badge">Save {annualSavings}%</span>
                )}
              </button>
            </div>
          )}

          <div className="upgrade-header">
            <span className="upgrade-badge">Pro Plan</span>
            <div className="upgrade-price">
              <span className="upgrade-amount">{priceDisplay}</span>
              <span className="upgrade-period">
                {interval === "year" ? "/ year" : "/ month"}
              </span>
            </div>
            {interval === "year" && plans?.monthly && plans.annual && (
              <p className="plan-equiv">
                ≈ {formatAmount(Math.round(plans.annual.amount_cents / 12), plans.annual.currency)} / month
              </p>
            )}
            <p className="upgrade-tagline">Everything you need for professional legal research</p>
          </div>

          <ul className="upgrade-features">
            {FEATURES.map((f) => (
              <li key={f.text} className="upgrade-feature">
                <span className="upgrade-feature-icon">{f.icon}</span>
                <span>{f.text}</span>
              </li>
            ))}
          </ul>

          {error && <p className="form-feedback error">{error}</p>}

          <button type="button" className="upgrade-cta" disabled={busy} onClick={handleSubscribe}>
            {busy
              ? "Redirecting to checkout…"
              : interval === "year"
              ? "Subscribe annually →"
              : "Subscribe monthly →"}
          </button>

          <p className="upgrade-fine">
            Cancel anytime. {interval === "year" ? "Billed yearly" : "Billed monthly"} via Stripe. Secure payment.
          </p>
        </div>

        <p className="upgrade-privacy">
          By subscribing you agree to our{" "}
          <button type="button" className="link-btn" onClick={() => alert("Privacy policy coming soon.")}>
            Privacy Policy
          </button>
          .
        </p>
      </div>
    </div>
  );
}
