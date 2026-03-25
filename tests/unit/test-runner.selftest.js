/**
 * 测试运行器自测 — 验证 describe/it/expect 和异步测试支持
 */
import { describe, it, expect } from '../test-runner.js';

describe('expect.toBe', () => {
  it('should pass for identical primitives', () => {
    expect(1).toBe(1);
    expect('hello').toBe('hello');
    expect(true).toBe(true);
    expect(null).toBe(null);
  });
});

describe('expect.toEqual', () => {
  it('should deep compare objects', () => {
    expect({ a: 1, b: [2, 3] }).toEqual({ a: 1, b: [2, 3] });
  });

  it('should deep compare arrays', () => {
    expect([1, [2, 3]]).toEqual([1, [2, 3]]);
  });
});

describe('expect.toBeGreaterThan / toBeLessThan', () => {
  it('should compare numbers', () => {
    expect(5).toBeGreaterThan(3);
    expect(2).toBeLessThan(10);
  });
});

describe('expect.toBeTrue / toBeFalse', () => {
  it('should check boolean values', () => {
    expect(true).toBeTrue();
    expect(false).toBeFalse();
  });
});

describe('expect.toThrow', () => {
  it('should detect thrown errors', () => {
    expect(() => { throw new Error('boom'); }).toThrow('boom');
  });

  it('should fail if function does not throw', () => {
    let caught = false;
    try {
      expect(() => {}).toThrow();
    } catch (e) {
      caught = true;
    }
    expect(caught).toBeTrue();
  });
});

describe('expect.toBeNull / toContain', () => {
  it('should check null', () => {
    expect(null).toBeNull();
  });

  it('should check array contains', () => {
    expect([1, 2, 3]).toContain(2);
  });

  it('should check string contains', () => {
    expect('hello world').toContain('world');
  });
});

describe('async test support', () => {
  it('should handle async tests', async () => {
    const result = await new Promise(resolve => setTimeout(() => resolve(42), 10));
    expect(result).toBe(42);
  });

  it('should handle async errors', async () => {
    let caught = false;
    try {
      await new Promise((_, reject) => setTimeout(() => reject(new Error('async fail')), 10));
    } catch (e) {
      caught = true;
      expect(e.message).toContain('async fail');
    }
    expect(caught).toBeTrue();
  });
});
