import CategoryRules from './CategoryRules';
import FightRules from './FightRules';
import Segmented from './Segmented';
import { CATEGORY_TEMPLATES } from '../lib/tournament/categoryTemplates.js';
import { rulesText } from '../lib/tournament/eligibility.js';
import { addDays } from '../lib/tournament/days.js';
import { fmtDay } from '../lib/format.js';

/**
 * One category, the same in Create and in Edit tournament → Categories:
 * templates (new ones), name, Individual | Team, day, 1 · Who can enter,
 * 2 · Type of tournament. `id` is used for the guide anchors (g-cat-<id>…).
 * After the draw `structureLocked` keeps the kind and what changes the pools
 * or the bracket; `readOnly` shows everything without changes.
 */
export default function CategoryCard({
  c, id, days = 1, startDate, ageBasis, onAgeBasis, onChange, onTemplate, onRemove, removeNote,
  others = [], structureLocked = false, readOnly = false, children,
}) {
  const set = (k, v) => onChange({ ...c, [k]: v, ...(k === 'kind' ? kindReset(v) : {}) });
  return (
    <div id={`g-cat-${id}`} className={`ct-category ${readOnly ? 'ct-readonly' : ''}`}>
      {onRemove ? (
        <button type="button" className="tp-btn danger small ct-remove" disabled={readOnly}
          onClick={() => { if (!c.name.trim() || window.confirm(`Remove the category "${c.name.trim()}"?`)) onRemove(); }}>Remove category</button>
      ) : removeNote ? <span className="tp-muted ct-remove ct-remove-note">{removeNote}</span> : null}
      <fieldset disabled={readOnly} className="ct-fieldset">
        <div id={`g-cat-${id}-name`} className="ct-head">
          {c._fresh && onTemplate && (
            <div className="ct-templates">
              <span className="ct-head-label">Templates</span>
              {CATEGORY_TEMPLATES.filter((p) => p.kind === c.kind).map((p) => (
                <button key={p.name} type="button" className="tp-btn secondary small" onClick={() => onTemplate(p)}>{p.name}</button>
              ))}
            </div>
          )}
          <div className="ct-head-name">
            <input value={c.name} placeholder="Category name" onChange={(e) => set('name', e.target.value)} />
          </div>
          <div>
            <Segmented options={[['individual', 'Individual'], ['team', 'Team']]} value={c.kind}
              disabled={structureLocked} onChange={(v) => set('kind', v)} />
          </div>
          {days > 1 && (
            <div>
              <Segmented options={Array.from({ length: days }, (_, i) => [i + 1, `Day ${i + 1}${startDate ? ` · ${fmtDay(addDays(startDate, i))}` : ''}`])}
                value={Number(c.day ?? 1)} onChange={(v) => set('day', v)} />
            </div>
          )}
          <span className="tp-muted">{rulesText(c)}</span>
        </div>

        <div id={`g-cat-${id}-who`}>
          <h4>1 · Who can enter</h4>
          <CategoryRules category={c} ageBasis={ageBasis} onAgeBasis={onAgeBasis} onChange={onChange} />
        </div>

        <div id={`g-cat-${id}-fights`}>
          <h4>2 · Type of tournament</h4>
          <FightRules category={c} onChange={onChange} others={others} structureLocked={structureLocked} />
        </div>
        <p className="tp-muted">The KO bracket can be adjusted per category in the bracket editor.</p>
      </fieldset>
      {children}
    </div>
  );
}

/** Switching individual ↔ team resets the team fields. */
function kindReset(kind) {
  return kind === 'team' ? { team_size: 3 } : { team_size: null, team_same_dojo: false, position_rules: null };
}
