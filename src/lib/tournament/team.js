// Team matches (port of team_ADULT / team_juniors logic).
// A team match has one bout per position plus an optional daihyōsen.
// Winner: more bout wins → more ippons → otherwise daihyōsen decides.

import { boutResult } from './scoring.js';

export const POSITIONS = {
  3: ['senpo', 'chuken', 'taisho'],
  5: ['senpo', 'jiho', 'chuken', 'fukusho', 'taisho'],
};
export const POSITION_LABELS = {
  senpo: 'Senpō', jiho: 'Jihō', chuken: 'Chūken', fukusho: 'Fukushō', taisho: 'Taishō', daihyosen: 'Daihyōsen',
};

/**
 * @param bouts [{ position, bout }] — position bouts, optionally one with position 'daihyosen'
 * Returns { redWins, whiteWins, redIppons, whiteIppons, winner, needsDaihyosen }
 */
export function teamMatchResult(bouts, scoringOptions) {
  let redWins = 0; let whiteWins = 0; let redIppons = 0; let whiteIppons = 0;
  let daihyosen = null;
  for (const b of bouts) {
    if (b.position === 'daihyosen') { daihyosen = b; continue; }
    const r = boutResult(b.bout, scoringOptions);
    redIppons += r.redIppons; whiteIppons += r.whiteIppons;
    if (r.winner === 'red') redWins += 1;
    if (r.winner === 'white') whiteWins += 1;
  }
  let winner = null;
  if (redWins !== whiteWins) winner = redWins > whiteWins ? 'red' : 'white';
  else if (redIppons !== whiteIppons) winner = redIppons > whiteIppons ? 'red' : 'white';
  else if (daihyosen) winner = boutResult(daihyosen.bout, scoringOptions).winner;
  return {
    redWins, whiteWins, redIppons, whiteIppons,
    winner,
    needsDaihyosen: winner === null,
  };
}
