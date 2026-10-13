import { describe, it, expect } from 'vitest';
import {
  buildFilterSearchParams,
  parseFilterParams,
  compressFilters,
  decompressFilters,
  defaultSortBy,
  type FilterUrlParams,
} from './filterUrlCompression';

describe('downloaded filter URL round-trip', () => {
  it('round-trips an explicit on', () => {
    const encoded = compressFilters({ downloaded: '1' });
    expect(encoded).not.toBeNull();
    expect(decompressFilters(encoded ?? '')?.downloaded).toBe('1');
  });

  it('round-trips an explicit off rather than dropping it', () => {
    const encoded = compressFilters({ downloaded: '0' });
    expect(encoded).not.toBeNull();
    expect(decompressFilters(encoded ?? '')?.downloaded).toBe('0');
  });

  it('survives buildFilterSearchParams and parseFilterParams', () => {
    const params = buildFilterSearchParams({ downloaded: '0', search: 'sonic' });
    const parsed = parseFilterParams(params);
    expect(parsed.downloaded).toBe('0');
    expect(parsed.search).toBe('sonic');
  });

  it('leaves downloaded undefined when absent', () => {
    const parsed = parseFilterParams(new URLSearchParams());
    expect(parsed.downloaded).toBeUndefined();
  });
});

describe('release range and shuffle URL round-trip', () => {
  const roundTrip = (params: FilterUrlParams) => parseFilterParams(buildFilterSearchParams(params));

  it('round-trips a release date range', () => {
    const parsed = roundTrip({ releasedFrom: '2008-06-03', releasedTo: '2008-06-09' });
    expect(parsed.releasedFrom).toBe('2008-06-03');
    expect(parsed.releasedTo).toBe('2008-06-09');
  });

  it('reads a release range from legacy params', () => {
    const parsed = parseFilterParams(new URLSearchParams('releasedFrom=2008-06-03&sortBy=title'));
    expect(parsed.releasedFrom).toBe('2008-06-03');
    expect(parsed.sortBy).toBe('title');
  });

  it('shuffles by default, keeping the seed, but lists searches by title', () => {
    const shuffled = buildFilterSearchParams({ tags: 'Puzzle', seed: 42 });
    expect(shuffled.get('sortBy')).toBeNull();
    expect(shuffled.get('seed')).toBe('42');
    expect(parseFilterParams(shuffled).seed).toBe(42);

    const byTitle = buildFilterSearchParams({ tags: 'Puzzle', sortBy: 'title', seed: 42 });
    expect(byTitle.get('sortBy')).toBe('title');
    expect(byTitle.get('seed')).toBeNull();

    expect(buildFilterSearchParams({ search: 'cat', sortBy: 'title' }).get('sortBy')).toBeNull();
    expect(defaultSortBy({ search: 'cat' })).toBe('title');
    expect(defaultSortBy({})).toBe('random');
  });
});
