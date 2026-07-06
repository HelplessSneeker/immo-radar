import { describe, expect, it } from 'vitest';
import { normalisiereOrt, ortSlug } from '../src/ort-slugs.js';

describe('normalisiereOrt', () => {
  it('trimmt, lowercased und ersetzt Umlaute/Whitespace', () => {
    expect(normalisiereOrt(' Villach ')).toBe('villach');
    expect(normalisiereOrt('VILLACH')).toBe('villach');
    expect(normalisiereOrt('Völkermarkt')).toBe('voelkermarkt');
    expect(normalisiereOrt('Klagenfurt am Wörthersee')).toBe('klagenfurt-am-woerthersee');
  });
});

describe('ortSlug', () => {
  it('löst bekannte Orte je Portal auf, auch über die PLZ', () => {
    expect(ortSlug({ bundesland: 'kaernten', typ: 'kauf', ort: 'Villach' }, 'willhaben')).toBe('villach');
    expect(ortSlug({ bundesland: 'kaernten', typ: 'kauf', ort: '9020' }, 'willhaben')).toBe('klagenfurt');
    expect(ortSlug({ bundesland: 'kaernten', typ: 'kauf', ort: '9020' }, 'immoscout24')).toBe(
      'klagenfurt-am-woerthersee',
    );
  });

  it('liefert undefined ohne Ort oder bei unbekanntem Ort', () => {
    expect(ortSlug({ bundesland: 'kaernten', typ: 'kauf' }, 'willhaben')).toBeUndefined();
    expect(ortSlug({ bundesland: 'kaernten', typ: 'kauf', ort: 'Irgendwo' }, 'willhaben')).toBeUndefined();
    expect(ortSlug({ bundesland: 'kaernten', typ: 'kauf', ort: '9999' }, 'willhaben')).toBeUndefined();
  });

  it('liefert undefined bei Bundesland-Widerspruch', () => {
    expect(ortSlug({ bundesland: 'steiermark', typ: 'kauf', ort: 'Villach' }, 'willhaben')).toBeUndefined();
  });
});
