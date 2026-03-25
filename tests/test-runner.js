/**
 * HexWanderer 自定义浏览器端测试运行器
 * 简易断言库 + 异步测试支持 + 统计汇总
 * 无 npm 依赖，纯 ES Module
 */

const suites = [];
let currentSuite = null;

/**
 * 定义一个测试套件
 * @param {string} name - 套件名称
 * @param {Function} fn - 包含 it() 调用的函数
 */
export function describe(name, fn) {
  const suite = { name, tests: [], beforeEachFns: [], afterEachFns: [] };
  const previousSuite = currentSuite;
  currentSuite = suite;
  fn();
  currentSuite = previousSuite;
  suites.push(suite);
}

/**
 * 注册 beforeEach 钩子
 * @param {Function} fn
 */
export function beforeEach(fn) {
  if (currentSuite) {
    currentSuite.beforeEachFns.push(fn);
  }
}

/**
 * 注册 afterEach 钩子
 * @param {Function} fn
 */
export function afterEach(fn) {
  if (currentSuite) {
    currentSuite.afterEachFns.push(fn);
  }
}

/**
 * 定义一个测试用例（支持 async）
 * @param {string} name - 测试名称
 * @param {Function} fn - 测试函数（可以是 async）
 */
export function it(name, fn) {
  if (!currentSuite) {
    throw new Error('it() must be called inside describe()');
  }
  currentSuite.tests.push({ name, fn });
}

/**
 * 深度相等比较
 */
function deepEqual(a, b) {
  if (a === b) return true;
  if (a == null || b == null) return false;
  if (typeof a !== typeof b) return false;

  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return false;
    return a.every((val, i) => deepEqual(val, b[i]));
  }

  if (typeof a === 'object') {
    const keysA = Object.keys(a);
    const keysB = Object.keys(b);
    if (keysA.length !== keysB.length) return false;
    return keysA.every(key => deepEqual(a[key], b[key]));
  }

  return false;
}

/**
 * 创建断言对象
 * @param {*} actual - 实际值
 * @returns 断言链对象
 */
export function expect(actual) {
  return {
    toBe(expected) {
      if (actual !== expected) {
        throw new Error(`Expected ${JSON.stringify(expected)} but got ${JSON.stringify(actual)}`);
      }
    },

    toEqual(expected) {
      if (!deepEqual(actual, expected)) {
        throw new Error(`Expected deep equal ${JSON.stringify(expected)} but got ${JSON.stringify(actual)}`);
      }
    },

    toBeGreaterThan(expected) {
      if (!(actual > expected)) {
        throw new Error(`Expected ${JSON.stringify(actual)} to be greater than ${JSON.stringify(expected)}`);
      }
    },

    toBeLessThan(expected) {
      if (!(actual < expected)) {
        throw new Error(`Expected ${JSON.stringify(actual)} to be less than ${JSON.stringify(expected)}`);
      }
    },

    toBeTrue() {
      if (actual !== true) {
        throw new Error(`Expected true but got ${JSON.stringify(actual)}`);
      }
    },

    toBeFalse() {
      if (actual !== false) {
        throw new Error(`Expected false but got ${JSON.stringify(actual)}`);
      }
    },

    toThrow(expectedMessage) {
      if (typeof actual !== 'function') {
        throw new Error('expect(fn).toThrow() requires a function');
      }
      let threw = false;
      let thrownError = null;
      try {
        actual();
      } catch (e) {
        threw = true;
        thrownError = e;
      }
      if (!threw) {
        throw new Error('Expected function to throw but it did not');
      }
      if (expectedMessage !== undefined) {
        const msg = thrownError.message || String(thrownError);
        if (!msg.includes(expectedMessage)) {
          throw new Error(`Expected error message to include "${expectedMessage}" but got "${msg}"`);
        }
      }
    },

    toBeNull() {
      if (actual !== null) {
        throw new Error(`Expected null but got ${JSON.stringify(actual)}`);
      }
    },

    toContain(expected) {
      if (Array.isArray(actual)) {
        if (!actual.includes(expected)) {
          throw new Error(`Expected array to contain ${JSON.stringify(expected)}`);
        }
      } else if (typeof actual === 'string') {
        if (!actual.includes(expected)) {
          throw new Error(`Expected string to contain "${expected}"`);
        }
      } else {
        throw new Error('toContain() requires an array or string');
      }
    },

    toBeGreaterThanOrEqual(expected) {
      if (!(actual >= expected)) {
        throw new Error(`Expected ${JSON.stringify(actual)} to be >= ${JSON.stringify(expected)}`);
      }
    },

    toBeLessThanOrEqual(expected) {
      if (!(actual <= expected)) {
        throw new Error(`Expected ${JSON.stringify(actual)} to be <= ${JSON.stringify(expected)}`);
      }
    },

    toBeDefined() {
      if (actual === undefined) {
        throw new Error('Expected value to be defined but got undefined');
      }
    },

    toBeUndefined() {
      if (actual !== undefined) {
        throw new Error(`Expected undefined but got ${JSON.stringify(actual)}`);
      }
    },

    toBeInstanceOf(expected) {
      if (!(actual instanceof expected)) {
        throw new Error(`Expected instance of ${expected.name} but got ${actual?.constructor?.name}`);
      }
    }
  };
}

/**
 * 运行所有已注册的测试套件
 * @returns {Promise<{total, passed, failed, results}>}
 */
export async function runAllTests() {
  const results = [];
  let total = 0;
  let passed = 0;
  let failed = 0;

  for (const suite of suites) {
    const suiteResult = { name: suite.name, tests: [] };
    console.group(`📦 ${suite.name}`);

    for (const test of suite.tests) {
      total++;
      const testResult = { name: test.name, passed: false, error: null };

      try {
        // Run beforeEach hooks
        for (const beforeFn of suite.beforeEachFns) {
          await beforeFn();
        }

        // Run the test (supports async)
        await test.fn();

        testResult.passed = true;
        passed++;
        console.log(`  ✓ ${test.name}`);
      } catch (err) {
        testResult.error = err.message || String(err);
        failed++;
        console.error(`  ✗ ${test.name} — ${testResult.error}`);
      } finally {
        // Run afterEach hooks
        try {
          for (const afterFn of suite.afterEachFns) {
            await afterFn();
          }
        } catch (_) {
          // Ignore afterEach errors
        }
      }

      suiteResult.tests.push(testResult);
    }

    console.groupEnd();
    results.push(suiteResult);
  }

  console.log(`\n${failed === 0 ? '✅' : '❌'} ${passed} passed, ${failed} failed — ${total} total`);
  return { total, passed, failed, results };
}

/**
 * 渲染测试结果到 DOM
 * @param {HTMLElement} container - 目标容器
 * @param {{total, passed, failed, results}} report - 测试报告
 */
export function renderResults(container, report) {
  container.innerHTML = '';

  // Summary header
  const summary = document.createElement('div');
  summary.className = 'test-summary';
  const allPassed = report.failed === 0;
  summary.style.cssText = `
    padding: 16px 20px; margin-bottom: 20px; border-radius: 8px; font-size: 18px; font-weight: bold;
    background: ${allPassed ? '#d4edda' : '#f8d7da'};
    color: ${allPassed ? '#155724' : '#721c24'};
    border: 1px solid ${allPassed ? '#c3e6cb' : '#f5c6cb'};
  `;
  summary.textContent = `${allPassed ? '✅' : '❌'} ${report.passed} passed, ${report.failed} failed — ${report.total} total`;
  container.appendChild(summary);

  // Suite results
  for (const suite of report.results) {
    const suiteEl = document.createElement('div');
    suiteEl.style.cssText = 'margin-bottom: 16px;';

    const suiteHeader = document.createElement('h3');
    suiteHeader.style.cssText = 'margin: 0 0 8px 0; font-size: 16px; color: #333;';
    suiteHeader.textContent = suite.name;
    suiteEl.appendChild(suiteHeader);

    for (const test of suite.tests) {
      const testEl = document.createElement('div');
      testEl.style.cssText = `
        padding: 8px 12px; margin: 4px 0; border-radius: 4px; font-size: 14px; font-family: monospace;
        background: ${test.passed ? '#f0fff0' : '#fff0f0'};
        color: ${test.passed ? '#2d7a2d' : '#c0392b'};
        border-left: 4px solid ${test.passed ? '#27ae60' : '#e74c3c'};
      `;
      testEl.textContent = `${test.passed ? '✓' : '✗'} ${test.name}`;

      if (!test.passed && test.error) {
        const errorEl = document.createElement('div');
        errorEl.style.cssText = 'margin-top: 4px; font-size: 12px; color: #888; padding-left: 16px;';
        errorEl.textContent = test.error;
        testEl.appendChild(errorEl);
      }

      suiteEl.appendChild(testEl);
    }

    container.appendChild(suiteEl);
  }
}

/**
 * 清除所有已注册的测试套件（用于重新运行）
 */
export function clearSuites() {
  suites.length = 0;
  currentSuite = null;
}
