import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { listMyTournaments } from '../lib/api';
import tournamentIcon from '../assets/icons/select_tournament.png';

/**
 * Tournament selector as on the dashboard (owner, 2026-11-24): the same icon
 * and list; picking another tournament opens the same page (and tab) for it
 * and remembers it for the dashboard.
 */
export default function TournamentPicker({ tournamentId, name }) {
  const [open, setOpen] = useState(false);
  const [list, setList] = useState(null);
  const navigate = useNavigate();
  const { pathname, search } = useLocation();
  const box = useRef(null);

  useEffect(() => {
    if (!open || list) return;
    listMyTournaments().then(setList).catch(() => setList([]));
  }, [open, list]);
  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => { if (!box.current?.contains(e.target)) setOpen(false); };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [open]);

  const pick = (t) => {
    setOpen(false);
    if (t.id === tournamentId) return;
    try { sessionStorage.setItem('sf-selected-tournament', JSON.stringify({ id: t.id, name: t.name })); } catch { /* ignore */ }
    navigate(pathname.replace(`/tournament/${tournamentId}`, `/tournament/${t.id}`) + search);
  };

  return (
    <div className="tournament-dropdown tpick" ref={box}>
      <button type="button" className="tpick-btn" onClick={() => setOpen(!open)} title="Switch tournament">
        <img src={tournamentIcon} alt="" className="dropdown-icon" />
        <span className="selected-tournament">{name}</span>
        <span className="tpick-caret">▾</span>
      </button>
      {open && (
        <ul className="dropdown-list">
          {list === null && <li>Loading…</li>}
          {list?.map((t) => (
            <li key={t.id} className={t.id === tournamentId ? 'tpick-on' : ''} onClick={() => pick(t)}>
              {t.name}{t.start_date ? ` (${t.start_date.slice(0, 4)})` : ''}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
