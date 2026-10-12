import { describe, it, expect } from 'vitest';
import { canonicalJson, hashSave } from './hash';

describe('save hashing', () => {
  it('ignores key order and detects changes', () => {
    expect(canonicalJson({ b: 1, a: { d: 2, c: 3 } })).toBe('{"a":{"c":3,"d":2},"b":1}');
    expect(hashSave({ b: 1, a: 2 })).toBe(hashSave({ a: 2, b: 1 }));
    expect(hashSave({ a: 1 })).not.toBe(hashSave({ a: 2 }));
  });
});
