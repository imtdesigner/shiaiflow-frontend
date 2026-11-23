import { useState } from 'react';

const SEEN_KEY = (tid) => `sf-guide-seen-${tid}`;
const readSeen = (tid) => { try { return JSON.parse(localStorage.getItem(SEEN_KEY(tid)) ?? '[]'); } catch { return []; } };

/**
 * Recommended setup in the hall (owner, 2026-11-22): a short checklist in
 * Manage; "Got it" ticks the guide step on this device. Folded once ticked.
 */
export default function HallSetup({ tournamentId, courts }) {
  const [ok, setOk] = useState(() => readSeen(tournamentId).includes('hall'));
  const tick = () => {
    const seen = new Set(readSeen(tournamentId));
    seen.add('hall');
    try { localStorage.setItem(SEEN_KEY(tournamentId), JSON.stringify([...seen])); } catch { /* private mode */ }
    setOk(true);
  };
  const body = (
    <ul className="hall-list">
      <li><strong>Internet:</strong> a phone hotspot or a 4G / 5G router — not the venue Wi-Fi. Keep the hotspot phone on a charger.</li>
      <li><strong>Per shiaijo ({courts}):</strong> a laptop (or tablet) for the scoretable, and a monitor / TV next to the shiaijo with the court display in its own window, full screen (F11).</li>
      <li><strong>Laptops on power</strong>, sleep and screen lock off; browser zoom so the buttons are big.</li>
      <li><strong>If the connection drops</strong>, the table keeps working and sends the clicks later. Keep the <strong>paper backup</strong> printed at each table for a dead device.</li>
      <li><strong>Before the first fight:</strong> each table joins with the PIN and picks its shiaijo; open each display and check sides (⇄).</li>
    </ul>
  );
  return (
    <div id="g-hall" className="tp-card">
      {ok ? (
        <details>
          <summary><strong>Recommended setup in the hall</strong> <span className="tp-muted">✓</span></summary>
          {body}
        </details>
      ) : (
        <>
          <h3>Recommended setup in the hall</h3>
          {body}
          <div className="tp-actions"><button type="button" className="tp-btn small" onClick={tick}>Got it</button></div>
        </>
      )}
    </div>
  );
}
