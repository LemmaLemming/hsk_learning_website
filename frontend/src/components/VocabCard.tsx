import type {
  CharacterType,
  HydratedVocabItem,
  VisibleField,
  VocabStatus,
} from "../types";
import { characterFor, displayFor, formOf } from "../utils/vocab";

const STATUS_LABEL: Record<VocabStatus, string> = {
  unlearned: "Unlearned",
  learnt: "Learnt",
  skipped: "Skipped",
};

const STATUS_ORDER: VocabStatus[] = ["unlearned", "learnt", "skipped"];

interface Props {
  hydrated: HydratedVocabItem;
  characterType: CharacterType;
  visibleFields: VisibleField[];
  onCycleStatus: (level: number, vocabId: number, status: VocabStatus) => void;
  onRemove: (level: number, vocabId: number) => void;
}

export default function VocabCard({
  hydrated,
  characterType,
  visibleFields,
  onCycleStatus,
  onRemove,
}: Props) {
  const { entry } = hydrated;
  const status = hydrated.item.status;
  const form = formOf(entry);
  const char = characterFor(entry, characterType);

  const cycle = () => {
    const idx = STATUS_ORDER.indexOf(status);
    const nextStatus = STATUS_ORDER[(idx + 1) % STATUS_ORDER.length];
    onCycleStatus(hydrated.item.level, hydrated.item.vocabId, nextStatus);
  };

  return (
    <div className={`vocab-card status-${status}`}>
      <span className="vocab-level-badge">HSK {hydrated.item.level}</span>
      <div className="vocab-main">
        <span className="vocab-char">{char}</span>
        <span className="vocab-pinyin">{form?.i?.y ?? ""}</span>
      </div>
      <div className="vocab-fields">
        {visibleFields.map((field) => {
          const val = displayFor(entry, field);
          if (!val) return null;
          return (
            <span key={field} className="vocab-field">
              {val}
            </span>
          );
        })}
      </div>
      <div className="vocab-actions">
        <button className={`status-btn ${status}`} onClick={cycle}>
          {STATUS_LABEL[status]}
        </button>
        <button
          className="remove-btn"
          aria-label={`Remove ${char}`}
          onClick={() => onRemove(hydrated.item.level, hydrated.item.vocabId)}
        >
          ✕
        </button>
      </div>
    </div>
  );
}
