import { useState } from "react";
import {
  ALL_VISIBLE_FIELDS,
  PAGE_SIZES,
  type CharacterType,
  type PageSize,
  type UserPreferences,
  type VisibleField,
} from "../types";

const FIELD_LABELS: Record<VisibleField, string> = {
  pinyin: "Pinyin",
  toneNumber: "Tone number",
  wadeGiles: "Wade-Giles",
  bopomofo: "Bopomofo",
  gwoyeu: "Gwoyeu",
  meaning: "Meaning",
  partsOfSpeech: "Parts of speech",
  radical: "Radical",
  frequency: "Frequency",
  classifiers: "Classifiers",
};

interface Props {
  prefs: UserPreferences;
  onSave: (prefs: {
    characterType: CharacterType;
    visibleFields: VisibleField[];
    pageSize: PageSize;
  }) => Promise<void> | void;
}

export default function GlobalSettings({ prefs, onSave }: Props) {
  const [characterType, setCharacterType] = useState<CharacterType>(
    prefs.characterType
  );
  const [visibleFields, setVisibleFields] = useState<VisibleField[]>(
    prefs.visibleFields
  );
  const [pageSize, setPageSize] = useState<PageSize>(
    (PAGE_SIZES as readonly number[]).includes(prefs.pageSize)
      ? (prefs.pageSize as PageSize)
      : 50
  );
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const toggleField = (field: VisibleField) => {
    setSaved(false);
    setVisibleFields((prev) =>
      prev.includes(field)
        ? prev.filter((f) => f !== field)
        : [...prev, field]
    );
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave({ characterType, visibleFields, pageSize });
      setSaved(true);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="settings">
      <h2>Display preferences</h2>

      <div className="setting-group">
        <label className="setting-label">Character type</label>
        <div className="toggle-row">
          <button
            className={`btn ${characterType === "simplified" ? "active" : ""}`}
            onClick={() => {
              setSaved(false);
              setCharacterType("simplified");
            }}
          >
            Simplified
          </button>
          <button
            className={`btn ${characterType === "traditional" ? "active" : ""}`}
            onClick={() => {
              setSaved(false);
              setCharacterType("traditional");
            }}
          >
            Traditional
          </button>
        </div>
      </div>

      <div className="setting-group">
        <label className="setting-label">Visible fields</label>
        <div className="check-list">
          {ALL_VISIBLE_FIELDS.map((field) => (
            <label key={field} className="check-item">
              <input
                type="checkbox"
                checked={visibleFields.includes(field)}
                onChange={() => toggleField(field)}
              />
              <span>{FIELD_LABELS[field]}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="setting-group">
        <label className="setting-label">Cards per page</label>
        <div className="toggle-row">
          {PAGE_SIZES.map((size) => (
            <button
              key={size}
              className={`btn ${pageSize === size ? "active" : ""}`}
              onClick={() => {
                setSaved(false);
                setPageSize(size);
              }}
            >
              {size}
            </button>
          ))}
        </div>
      </div>

      <button className="btn primary" onClick={handleSave} disabled={saving}>
        {saving ? "Saving…" : "Save"}
      </button>
      {saved && <span className="saved">Saved ✓</span>}
    </div>
  );
}
