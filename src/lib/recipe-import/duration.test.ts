import { describe, expect, it } from 'vitest';

import { findDuration, formatDuration, parseDuration, toMinutes } from './duration';

describe('parseDuration', () => {
  it('reads ISO-8601, which is what schema.org gives', () => {
    expect(parseDuration('PT40M')).toBe(2400);
    expect(parseDuration('PT1H20M')).toBe(4800);
    expect(parseDuration('PT10M')).toBe(600);
    expect(parseDuration('PT30S')).toBe(30);
  });

  it('reads the spellings the sites actually publish', () => {
    expect(parseDuration('5 sec')).toBe(5);
    expect(parseDuration('5 secondes')).toBe(5);
    expect(parseDuration('3 min')).toBe(180);
    expect(parseDuration('3 minutes')).toBe(180);
    expect(parseDuration('10 minutos')).toBe(600);
    expect(parseDuration('20 Sek.')).toBe(20);
    expect(parseDuration('5 Min.')).toBe(300);
  });

  it('adds the units up when a duration carries two', () => {
    expect(parseDuration('3 min 30 sec')).toBe(210);
    expect(parseDuration('02 h 00 min')).toBe(7200);
  });

  it('reads a bare number after an hour as minutes', () => {
    expect(parseDuration('1 h 20')).toBe(4800);
  });

  it('reads a clock as mm:ss, the way a kitchen timer shows it', () => {
    expect(parseDuration('00:05')).toBe(5);
    expect(parseDuration('03:30')).toBe(210);
    expect(parseDuration('01:30:00')).toBe(5400);
  });

  it('refuses a number with no unit rather than inventing a timer', () => {
    expect(parseDuration('20')).toBeNull();
    expect(parseDuration('')).toBeNull();
    expect(parseDuration(null)).toBeNull();
  });
});

describe('findDuration', () => {
  it('finds a duration inside a sentence', () => {
    expect(findDuration('Transvaser dans un saladier et réserver pendant 02 h 00 min.')).toBe(7200);
    expect(findDuration('Mettre dans le four pendant 25 min à 210°C.')).toBe(1500);
    expect(findDuration('asse no forno por 25 min a 200°C')).toBe(1500);
  });

  it('ignores numbers that are not times', () => {
    expect(findDuration('Ajouter 2 pincées de poivre')).toBeNull();
    expect(findDuration('Préchauffer le four à 210°C.')).toBeNull();
  });
});

describe('toMinutes / formatDuration', () => {
  it('rounds up, because a 90-second step is not a zero-minute step', () => {
    expect(toMinutes(90)).toBe(2);
    expect(toMinutes(3300)).toBe(55);
    expect(toMinutes(null)).toBeNull();
  });

  it('formats for the dials', () => {
    expect(formatDuration(20)).toBe('20 s');
    expect(formatDuration(210)).toBe('3 min 30 s');
    expect(formatDuration(1200)).toBe('20 min');
    expect(formatDuration(7200)).toBe('2 h');
    expect(formatDuration(4800)).toBe('1 h 20');
    expect(formatDuration(0)).toBeNull();
  });
});
