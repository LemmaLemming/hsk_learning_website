import { useEffect, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import {
  getUserSets,
  getRecentSets,
  deleteSet,
  type SetWithId,
} from "../services/setService";
import {
  getOrCreateUserDoc,
  updateUserPreferences,
} from "../services/userService";
import GlobalSettings from "../components/GlobalSettings";
import type {
  CharacterType,
  PageSize,
  UserPreferences,
  VisibleField,
} from "../types";

const ASCII_HEADER = `╔══════════════════════════════════╗
║   HSK VOCAB TRAINER DASHBOARD   ║
╚══════════════════════════════════╝`;

function formatDate(value: unknown): string {
  if (!value) return "never";
  if (typeof value === "object" && "toDate" in (value as object)) {
    return (value as { toDate: () => Date }).toDate().toLocaleDateString();
  }
  return String(value);
}

function statusCounts(set: SetWithId) {
  const counts = { unlearned: 0, learnt: 0, skipped: 0 };
  for (const item of set.items ?? []) {
    counts[item.status] = (counts[item.status] ?? 0) + 1;
  }
  return counts;
}

/**
 * Days learnt info for a split set: how many decks have ALL cards learnt.
 * Returns null for non-split sets.
 */
function daysLearntInfo(set: SetWithId): { done: number; total: number } | null {
  if (!set.subsetSize || set.subsetSize <= 0) return null;
  const size = set.subsetSize;
  const items = set.items ?? [];
  const total = Math.ceil(items.length / size);
  let done = 0;
  for (let d = 0; d < total; d++) {
    const start = d * size;
    const end = Math.min(start + size, items.length);
    let deckDone = true;
    for (let i = start; i < end; i++) {
      if (items[i].status !== "learnt") {
        deckDone = false;
        break;
      }
    }
    if (deckDone) done++;
  }
  return { done, total };
}

export default function SetList() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [sets, setSets] = useState<SetWithId[] | null>(null);
  const [recent, setRecent] = useState<SetWithId[]>([]);
  const [prefs, setPrefs] = useState<UserPreferences | null>(null);
  const [prefsError, setPrefsError] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    if (!user) return;
    let active = true;

    getOrCreateUserDoc(user)
      .then((p) => {
        if (active) setPrefs(p);
      })
      .catch(() => {
        if (active) setPrefsError(true);
      });

    getUserSets(user.uid)
      .then((s) => {
        if (active) setSets(s);
      })
      .catch((e) => {
        if (active) setError((e as Error).message);
      });

    getRecentSets(user.uid, 2)
      .then((s) => {
        if (active) setRecent(s);
      })
      .catch(() => {
        /* recent sets are decorative; main list has the source of truth */
      });

    return () => {
      active = false;
    };
  }, [user]);

  // Phase 2 guard: first-time users must complete onboarding first.
  if (prefs && prefs.onboardingComplete === false) {
    return <Navigate to="/onboarding" replace />;
  }

  const handleSaveSettings = async (p: {
    characterType: CharacterType;
    visibleFields: VisibleField[];
    flashcardFrontFields: VisibleField[];
    flashcardBackFields: VisibleField[];
    pageSize: PageSize;
  }) => {
    if (!user) return;
    await updateUserPreferences(user.uid, p);
    setPrefs((prev) => (prev ? { ...prev, ...p } : prev));
  };

  const confirmDelete = async (set: SetWithId) => {
    if (!user) return;
    const ok = window.confirm(
      `Delete set "${set.name}"?\n\nThis action cannot be undone.`
    );
    if (!ok) return;
    try {
      await deleteSet(user.uid, set.id);
      setSets((prev) => prev?.filter((s) => s.id !== set.id) ?? prev);
      setRecent((prev) => prev.filter((s) => s.id !== set.id));
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const allCounts = sets
    ? {
        learnt: sets.reduce((n, s) => n + statusCounts(s).learnt, 0),
        skipped: sets.reduce((n, s) => n + statusCounts(s).skipped, 0),
      }
    : null;

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <pre className="ascii-header">{ASCII_HEADER}</pre>
          <div className="user-info">
            What's up, <b>{prefs?.displayName ?? user?.displayName ?? ""}</b>
            {allCounts && (
              <span>
                | {allCounts.learnt} learnt · {allCounts.skipped} skipped
                across {sets?.length ?? 0} set{sets?.length === 1 ? "" : "s"}
              </span>
            )}
          </div>
        </div>
        <div className="user-info">
          <button
            className="retro-btn"
            onClick={() => setShowSettings(true)}
          >
            [ ⚙ Settings ]
          </button>
          <button className="retro-btn" onClick={signOut}>
            [ Sign out ]
          </button>
        </div>
      </header>

      <div className="marquee">
        <span>
          {" "}
          &gt;&gt;&gt; Welcome to the HSK Vocab Trainer! Create a set, then
          click "Study" to start drilling. 加油！{" "}
        </span>
      </div>

      {error && <p className="error">{error}</p>}
      {prefsError && !prefs && (
        <p className="error">
          Could not load your preferences. Check your connection and refresh.
        </p>
      )}

      {/* ---------- Pick Up Where You Left Off ---------- */}
      <h2 className="section-title">Pick Up Where You Left Off</h2>
      {recent.length === 0 ? (
        <p className="placeholder">No recent sets. Create one below!</p>
      ) : (
        <div className="recent-panels">
          {recent.map((set) => {
            const counts = statusCounts(set);
            const total = set.items?.length ?? 0;
            const pct = total > 0 ? Math.round((counts.learnt / total) * 100) : 0;
            return (
              <div key={set.id} className="recent-panel">
                <h3>{set.name}</h3>
                <table className="retro-table">
                  <tbody>
                    <tr className="no-hover">
                      <td>Items</td>
                      <td>{total}</td>
                    </tr>
                    <tr className="no-hover">
                      <td>Learnt</td>
                      <td>
                        {counts.learnt} / {total} ({pct}%)
                      </td>
                    </tr>
                    <tr className="no-hover">
                      <td>Last accessed</td>
                      <td>{formatDate(set.lastAccessedAt)}</td>
                    </tr>
                  </tbody>
                </table>
                <div className="progress-track">
                  <div
                    className="progress-fill"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <div className="set-actions-row">
                  <Link to={`/sets/${set.id}`}>[ Study this set &gt;&gt; ]</Link>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ---------- Your Sets ---------- */}
      <h2 className="section-title">Your Sets</h2>
      <div className="create-btn-area">
        <button className="retro-btn primary" onClick={() => navigate("/sets/new")}>
          [ + Create New Set ]
        </button>
      </div>

      {sets === null ? (
        <p className="loading">Loading sets...</p>
      ) : sets.length === 0 ? (
        <p className="placeholder">You haven't created any sets yet.</p>
      ) : (
        <table className="retro-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Name</th>
              <th>Items</th>
              <th>Learnt</th>
              <th>Skipped</th>
              <th>Created</th>
              <th>Days learnt</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {sets.map((set, i) => {
              const counts = statusCounts(set);
              const total = set.items?.length ?? 0;
              return (
                <tr key={set.id} onClick={() => navigate(`/sets/${set.id}`)}>
                  <td>{i + 1}</td>
                  <td>{set.name}</td>
                  <td>{total}</td>
                  <td>{counts.learnt}</td>
                  <td>{counts.skipped}</td>
                  <td>{formatDate(set.createdAt)}</td>
                  <td>
                    {(() => {
                      const info = daysLearntInfo(set);
                      if (!info) return "—";
                      return `${info.done}/${info.total}`;
                    })()}
                  </td>
                  <td
                    className="actions-cell"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <a
                      className="delete-link"
                      href="#"
                      onClick={(e) => {
                        e.preventDefault();
                        void confirmDelete(set);
                      }}
                    >
                      [Delete]
                    </a>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {/* ---------- Settings modal ---------- */}
      {showSettings && (
        <div className="modal-overlay" onClick={() => setShowSettings(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h3>⚙ Settings</h3>
              <button className="retro-btn" onClick={() => setShowSettings(false)}>
                [ Close ]
              </button>
            </div>
            {prefs ? (
              <GlobalSettings prefs={prefs} onSave={handleSaveSettings} />
            ) : (
              <p className="loading">Loading preferences...</p>
            )}
          </div>
        </div>
      )}

      <footer className="visitor-footer">
        Page hits: 六六六六 | Last updated: {new Date().toLocaleDateString()}
      </footer>
    </div>
  );
}