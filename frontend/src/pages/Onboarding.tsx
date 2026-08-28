import { useEffect, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import {
  getOrCreateUserDoc,
  updateUserPreferences,
} from "../services/userService";
import { OCCUPATIONS, type Occupation } from "../types";

const LEVELS = [1, 2, 3, 4, 5, 6, 7];

const OCCUPATION_LABELS: Record<Occupation, string> = {
  student: "Student",
  working: "Working",
  professional: "Professional",
  teacher: "Teacher",
  other: "Other",
};

export default function Onboarding() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [step, setStep] = useState(1);
  const [occupation, setOccupation] = useState<Occupation | null>(null);
  const [targetLevels, setTargetLevels] = useState<number[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    let active = true;
    getOrCreateUserDoc(user)
      .then((prefs) => {
        if (!active) return;
        // Already onboarded -> dashboard
        if (prefs.onboardingComplete === true) {
          navigate("/dashboard", { replace: true });
        }
        // Preseed with any previously saved answers
        if (prefs.occupation) setOccupation(prefs.occupation);
        if (prefs.targetLevels?.length) setTargetLevels(prefs.targetLevels);
      })
      .catch((e: unknown) => {
        if (active) setError((e as Error).message);
      });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const toggleLevel = (lvl: number) => {
    setTargetLevels((prev) =>
      prev.includes(lvl) ? prev.filter((l) => l !== lvl) : [...prev, lvl]
    );
  };

  const handleFinish = async () => {
    if (!user) return;
    setSaving(true);
    setError(null);
    try {
      await updateUserPreferences(user.uid, {
        occupation,
        targetLevels,
        onboardingComplete: true,
      });
      navigate("/dashboard", { replace: true });
    } catch (e) {
      setError((e as Error).message);
      setSaving(false);
    }
  };

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="onboarding-page">
      <h1>=== Welcome new user! ===</h1>
      <pre className="ascii-cats" style={{ fontSize: 12 }}>
        {"    (\\_/)\n    (o.o)   Just two quick questions \u{1F64F}\u{1F64F}\n     > ^ <"}
      </pre>
      <p className="step-indicator">
        Step {step} of 2 {step === 1 ? "— Who are you?" : "— Your HSK levels"}
      </p>

      {error && <p className="error">{error}</p>}

      {step === 1 && (
        <fieldset>
          <legend>Step 1: Tell us about yourself</legend>
          <table className="retro-table radio-table">
            <tbody>
              {OCCUPATIONS.map((occ) => (
                <tr
                  key={occ}
                  onClick={() => setOccupation(occ)}
                  className={occupation === occ ? "selected-row" : ""}
                >
                  <td>
                    <input
                      type="radio"
                      name="occupation"
                      checked={occupation === occ}
                      onChange={() => setOccupation(occ)}
                    />
                  </td>
                  <td>{OCCUPATION_LABELS[occ]}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="step-actions">
            <button
              className="retro-btn"
              disabled={!occupation}
              onClick={() => setStep(2)}
            >
              Next &gt;&gt;
            </button>
          </div>
        </fieldset>
      )}

      {step === 2 && (
        <fieldset>
          <legend>Step 2: Select your HSK levels</legend>
          <p>Which HSK levels are you studying? (pick any number)</p>
          <div className="level-check-grid">
            {LEVELS.map((lvl) => (
              <label key={lvl} className="level-check">
                <input
                  type="checkbox"
                  checked={targetLevels.includes(lvl)}
                  onChange={() => toggleLevel(lvl)}
                />
                <span>HSK {lvl}</span>
              </label>
            ))}
          </div>
          <div className="step-actions">
            <button className="retro-btn" onClick={() => setStep(1)}>
              &lt;&lt; Back
            </button>
            <button
              className="retro-btn primary"
              disabled={saving || targetLevels.length === 0}
              onClick={handleFinish}
            >
              {saving ? "Saving..." : "Finish >>"}
            </button>
          </div>
        </fieldset>
      )}

      <hr />
      <p className="login-footer">
        Personalize your study plan | © 2026 HSK Vocab Trainer
      </p>
    </div>
  );
}