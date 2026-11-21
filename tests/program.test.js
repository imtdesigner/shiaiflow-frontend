import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_PROGRAM, dayProgram, refText, refTime, updateItem, addItem, programOf } from '../src/lib/tournament/program.js';

test('program: proposal relative to the day start / end, in time order', () => {
  const day = { start: '09:00', end: '18:00' };
  const items = dayProgram(DEFAULT_PROGRAM, day);
  assert.deepEqual(items.map((i) => [i.key, i.fromTime, i.toTime]), [
    ['hall', '07:30', null],
    ['warmup', '07:45', '08:40'],
    ['shinpan', '08:15', null],
    ['lineup', '08:45', null],
    ['fights', '09:00', null],
    ['awards', '17:30', null],
  ]);
  assert.equal(items.some((i) => i.key === 'shinai'), false); // off by default
});

test('program: typed time stays fixed, start change moves the rest; own items', () => {
  let p = updateItem(DEFAULT_PROGRAM, 'hall', { from: { time: '07:00' } });
  p = updateItem(p, 'shinai', { on: true });
  p = addItem(p, 'Team captains');
  const items = dayProgram(p, { start: '10:00', end: null });
  assert.equal(items.find((i) => i.key === 'hall').fromTime, '07:00');
  assert.equal(items.find((i) => i.key === 'warmup').fromTime, '08:45');
  assert.equal(items.find((i) => i.key === 'shinai').toTime, '09:40');
  assert.equal(items.find((i) => i.label === 'Team captains').fromTime, '09:30');
  assert.equal(items.at(-1).key, 'awards'); // no end time → no time, last
  assert.equal(refTime({ base: 'end', min: -30 }, { start: '09:00' }), null);
  assert.equal(refText({ base: 'start', min: -90 }), '1 h 30 before the start');
  assert.equal(refText({ base: 'end', min: -30 }), '30 min before the end');
  assert.equal(programOf({ program: null }), DEFAULT_PROGRAM);
});
