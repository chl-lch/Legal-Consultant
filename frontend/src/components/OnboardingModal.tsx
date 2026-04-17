const STEPS = [
  {
    icon: "📄",
    title: "Add your legal documents",
    desc: "Upload PDFs or HTML files — contracts, statutes, case law — or paste a URL directly.",
  },
  {
    icon: "🔍",
    title: "Select what to search",
    desc: "Pick specific documents to focus on, or leave all unselected to search your entire library.",
  },
  {
    icon: "💬",
    title: "Ask in plain English",
    desc: "LexiCounsel reads your documents and answers with cited sources and quality scores. No legalese needed.",
  },
];

const ONBOARDED_KEY = "lc_onboarded";

type Props = { onClose: () => void };

export function OnboardingModal({ onClose }: Props) {
  function handleClose() {
    localStorage.setItem(ONBOARDED_KEY, "1");
    onClose();
  }

  return (
    <div className="modal-overlay" onClick={handleClose}>
      <div className="modal-card onboarding-card" onClick={(e) => e.stopPropagation()}>
        <div className="onboarding-header">
          <span className="onboarding-logo">⚖</span>
          <h2>Welcome to LexiCounsel</h2>
          <p>AI-powered legal research in three steps.</p>
        </div>

        <ol className="onboarding-steps">
          {STEPS.map((s, i) => (
            <li key={i} className="onboarding-step">
              <span className="onboarding-step-num">{i + 1}</span>
              <span className="onboarding-step-icon">{s.icon}</span>
              <div>
                <strong>{s.title}</strong>
                <p>{s.desc}</p>
              </div>
            </li>
          ))}
        </ol>

        <div className="onboarding-footer">
          <p className="onboarding-disclaimer">
            AI responses are for research purposes only and do not constitute legal advice.
          </p>
          <button type="button" className="onboarding-cta" onClick={handleClose}>
            Get started →
          </button>
        </div>
      </div>
    </div>
  );
}

export function shouldShowOnboarding(): boolean {
  return !localStorage.getItem(ONBOARDED_KEY);
}
