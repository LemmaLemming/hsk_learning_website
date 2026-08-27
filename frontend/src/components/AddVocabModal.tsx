import { useEffect, useMemo, useState } from "react";
import { useVocabData } from "../hooks/useVocabData";
import type { VocabItem } from "../types";

const LEVELS = [1, 2, 3, 4, 5, 6, 7];
const keyOf = (level: number, id: number) => `${level}:${id}`;

interface Props {
  existingKeys: Set<string>;
  onAdd: (items: VocabItem[]) => void;
  onClose: () => void;
}

export default function AddVocabModal({ existingKeys, onAdd, onClose }: Props) {
  const [selectedLevels, setSelectedLevels] = useState<number[]>([]);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const { data, loading } = useVocabData(selectedLevels);

  // Reset selection when level set changes.
  useEffect(() => {
    setSelectedKeys(new Set());
  }, [selectedLevels]);

  const candidates = useMemo(() => {
    const out: { level: number; id: number; s: string; pinyin: string }[] = [];
    for (const lvl of selectedLevels) {
      for (const entry of data.get(lvl) ?? []) {
        if (existingKeys.has(keyOf(lvl, entry.id))) continue;
        out.push({
          level: lvl,
          id: entry.id,
          s: entry.s,
          pinyin: entry.f?.[0]?.i?.y ?? "",
        });
      }
    }
    return out;
  }, [data, selectedLevels, existingKeys]);

  const filtered = useMemo(() => {
    if (!query.trim()) return candidates;
    const q = query.trim().toLowerCase();
    return candidates.filter(
      (c) => c.s.toLowerCase().includes(q) || c.pinyin.toLowerCase().includes(q)
    );
  }, [candidates, query]);

  const toggleKey = (key: string) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleAdd = () => {
    const items: VocabItem[] = [];
    selectedKeys.forEach((key) => {
      const [lvl, id] = key.split(":");
      items.push({ level: Number(lvl), vocabId: Number(id), status: "unlearned" });
    });
    onAdd(items);
    onClose();
  };

  return (
    <div className="modal-overlay">
      <div className="modal wide">
        <div className="modal-head">
          <h3>Add vocabulary</h3>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
        </div>

        <div className="level-grid">
          {LEVELS.map((lvl) => (
            <label key={lvl} className="level-chip">
              <input
                type="checkbox"
                checked={selectedLevels.includes(lvl)}
                onChange={() =>
                  setSelectedLevels((prev) =>
                    prev.includes(lvl)
                      ? prev.filter((l) => l !== lvl)
                      : [...prev, lvl]
                  )
                }
              />
              <span>HSK {lvl}</span>
            </label>
          ))}
        </div>

        <input
          type="text"
          placeholder="Search…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />

        {loading ? (
          <p className="loading">Loading…</p>
        ) : (
          <ul className="vocab-list">
            {filtered.map(({ level, id, s, pinyin }) => {
              const key = keyOf(level, id);
              const checked = selectedKeys.has(key);
              return (
                <li key={key}>
                  <label className="vocab-row">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleKey(key)}
                    />
                    <span className="vocab-level">HSK {level}</span>
                    <span className="vocab-char">{s}</span>
                    <span className="vocab-pinyin">{pinyin}</span>
                  </label>
                </li>
              );
            })}
            {filtered.length === 0 && (
              <li className="placeholder">No new vocab to add.</li>
            )}
          </ul>
        )}

        <div className="modal-actions">
          <button
            className="btn primary"
            disabled={selectedKeys.size === 0}
            onClick={handleAdd}
          >
            Add {selectedKeys.size} item{selectedKeys.size === 1 ? "" : "s"}
          </button>
        </div>
      </div>
    </div>
  );
}
