import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import {
  getOrCreateUserDoc,
  updateUserPreferences,
} from "../services/userService";
import GlobalSettings from "../components/GlobalSettings";
import type { CharacterType, UserPreferences, VisibleField } from "../types";

export default function Settings() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [prefs, setPrefs] = useState<UserPreferences | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    let active = true;
    getOrCreateUserDoc(user)
      .then((p) => {
        if (active) setPrefs(p);
      })
      .catch((e) => {
        if (active) setError((e as Error).message);
      });
    return () => {
      active = false;
    };
  }, [user]);

  const handleSave = async (p: {
    characterType: CharacterType;
    visibleFields: VisibleField[];
  }) => {
    if (!user) return;
    await updateUserPreferences(user.uid, p);
    setPrefs((prev) => (prev ? { ...prev, ...p } : prev));
  };

  return (
    <div className="page">
      <header className="page-header">
        <h1>Settings</h1>
        <button className="btn" onClick={() => navigate("/dashboard")}>
          Back
        </button>
      </header>
      {error && <p className="error">{error}</p>}
      {!prefs && !error && <p className="loading">Loading…</p>}
      {prefs && <GlobalSettings prefs={prefs} onSave={handleSave} />}
    </div>
  );
}
