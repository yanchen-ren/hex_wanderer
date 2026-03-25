/**
 * EventBus 单元测试
 */
import { describe, it, expect } from '../test-runner.js';
import { EventBus } from '../../src/core/EventBus.js';

describe('EventBus', () => {
  it('on/emit 基本发布订阅', () => {
    const bus = new EventBus();
    let received = null;
    bus.on('test', (data) => { received = data; });
    bus.emit('test', 42);
    expect(received).toBe(42);
  });

  it('emit 传递多个参数', () => {
    const bus = new EventBus();
    let args = [];
    bus.on('multi', (a, b, c) => { args = [a, b, c]; });
    bus.emit('multi', 1, 'two', true);
    expect(args).toEqual([1, 'two', true]);
  });

  it('emit 无监听器时不报错', () => {
    const bus = new EventBus();
    // Should not throw
    bus.emit('nonexistent', 123);
    expect(true).toBeTrue();
  });

  it('once 自动取消订阅', () => {
    const bus = new EventBus();
    let count = 0;
    bus.once('ping', () => { count++; });
    bus.emit('ping');
    bus.emit('ping');
    bus.emit('ping');
    expect(count).toBe(1);
  });

  it('once 回调接收参数', () => {
    const bus = new EventBus();
    let received = null;
    bus.once('data', (val) => { received = val; });
    bus.emit('data', 'hello');
    expect(received).toBe('hello');
  });

  it('off 移除指定监听器', () => {
    const bus = new EventBus();
    let count = 0;
    const handler = () => { count++; };
    bus.on('evt', handler);
    bus.emit('evt');
    expect(count).toBe(1);
    bus.off('evt', handler);
    bus.emit('evt');
    expect(count).toBe(1);
  });

  it('off 移除不存在的事件不报错', () => {
    const bus = new EventBus();
    bus.off('nope', () => {});
    expect(true).toBeTrue();
  });

  it('同一事件多个监听器都被调用', () => {
    const bus = new EventBus();
    const calls = [];
    bus.on('shared', () => calls.push('a'));
    bus.on('shared', () => calls.push('b'));
    bus.on('shared', () => calls.push('c'));
    bus.emit('shared');
    expect(calls).toEqual(['a', 'b', 'c']);
  });

  it('off 只移除指定监听器，其他保留', () => {
    const bus = new EventBus();
    const calls = [];
    const handlerA = () => calls.push('a');
    const handlerB = () => calls.push('b');
    bus.on('evt', handlerA);
    bus.on('evt', handlerB);
    bus.off('evt', handlerA);
    bus.emit('evt');
    expect(calls).toEqual(['b']);
  });

  it('on 支持链式调用', () => {
    const bus = new EventBus();
    const result = bus.on('a', () => {}).on('b', () => {});
    expect(result).toBeInstanceOf(EventBus);
  });
});
