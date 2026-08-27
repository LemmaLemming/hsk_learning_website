import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { getUserSets, deleteSet, type SetWithId } from "../services/setService";

function formatDate(value: unknown): string {
  if (!value) return "";
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

export default function SetList() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [sets, setSets] = useState<SetWithId[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    let active = true;
    getUserSets(user.uid)
      .then((s) => {
        if (active) setSets(s);
      })
      .catch((e) => {
        if (active) setError((e as Error).message);
      });
    return () => {
      active = false;
    };
  }, [user]);

  const confirmDelete = async (id: string) => {
    if (!user) return;
    try {
      await deleteSet(user.uid, id);
      setSets((prev) => prev?.filter((s) => s.id !== id) ?? prev);
      setDeletingId(null);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <div className="page">
      <header className="page-header">
        <h1>My Sets</h1>
        <div className="user-info">
          <Link to="/settings" className="btn">
            Settings
          </Link>
          <button className="btn" onClick={signOut}>
            Sign out
          </button>
        </div>
      </header>

      {error && <p className="error">{error}</p>}

      <div className="set-list-actions">
        <button
          className="btn primary"
          onClick={() => navigate("/sets/new")}
        >
          + Create New Set
        </button>
      </div>

      {sets === null ? (
        <p className="loading">Loading sets…</p>
      ) : sets.length === 0 ? (
        <p className="placeholder">
          You don't have any sets yet. Create your first one!
        </p>
      ) : (
        <div className="set-grid">
          {sets.map((set) => {
            const counts = statusCounts(set);
            const total = set.items?.length ?? 0;
            return (
              <div key={set.id} className="set-card">
                <button
                  className="set-card-main"
                  onClick={() => navigate(`/sets/${set.id}`)}
                >
                  <h2>{set.name}</h2>
                  <p className="set-meta">
                    {total} items · created {formatDate(set.createdAt)}
                  </p>
                  <p className="set-status">
                    All {total} · Unlearned {counts.unlearned} · Learnt{" "}
                    {counts.learnt} · Skipped {counts.skipped}
                  </p>
                </button>
                <div className="set-card-actions">
                  <button
                    className="btn danger"
                    onClick={() => setDeletingId(set.id)}
                  >
                    Delete
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {deletingId && (
        <div className="modal-overlay">
          <div className="modal">
            <h3>Delete this set?</h3>
            <p>This action cannot be undone.</p>
            <div className="modal-actions">
              <button className="btn" onClick={() => setDeletingId(null)}>
                Cancel
              </button>
              <button
                className="btn danger"
                onClick={() => confirmDelete(deletingId)}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
