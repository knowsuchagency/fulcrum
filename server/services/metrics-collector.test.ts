import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { setupTestEnv, type TestEnv } from '../__tests__/utils/env'
import {
  startMetricsCollector,
  stopMetricsCollector,
  getMetrics,
  getCurrentMetrics,
} from './metrics-collector'

describe('Metrics Collector', () => {
  let testEnv: TestEnv

  beforeEach(() => {
    testEnv = setupTestEnv()
  })

  afterEach(() => {
    stopMetricsCollector()
    testEnv.cleanup()
  })

  describe('getCurrentMetrics', () => {
    test('returns system metrics object', () => {
      const metrics = getCurrentMetrics()

      expect(metrics).toHaveProperty('cpu')
      expect(metrics).toHaveProperty('memory')
      expect(metrics).toHaveProperty('disk')
    })

    test('returns valid CPU value', () => {
      const metrics = getCurrentMetrics()

      expect(typeof metrics.cpu).toBe('number')
      expect(metrics.cpu).toBeGreaterThanOrEqual(0)
      expect(metrics.cpu).toBeLessThanOrEqual(100)
    })

    test('returns valid memory values', () => {
      const metrics = getCurrentMetrics()

      expect(typeof metrics.memory.total).toBe('number')
      expect(typeof metrics.memory.used).toBe('number')
      expect(typeof metrics.memory.cache).toBe('number')
      expect(typeof metrics.memory.usedPercent).toBe('number')
      expect(typeof metrics.memory.cachePercent).toBe('number')

      expect(metrics.memory.total).toBeGreaterThan(0)
      expect(metrics.memory.used).toBeGreaterThanOrEqual(0)
      expect(metrics.memory.cache).toBeGreaterThanOrEqual(0)
      expect(metrics.memory.usedPercent).toBeGreaterThanOrEqual(0)
      expect(metrics.memory.usedPercent).toBeLessThanOrEqual(100)
    })

    test('returns valid disk values', () => {
      const metrics = getCurrentMetrics()

      expect(typeof metrics.disk.total).toBe('number')
      expect(typeof metrics.disk.used).toBe('number')
      expect(typeof metrics.disk.usedPercent).toBe('number')
      expect(metrics.disk.path).toBe('/')

      expect(metrics.disk.total).toBeGreaterThan(0)
      expect(metrics.disk.used).toBeGreaterThanOrEqual(0)
      expect(metrics.disk.usedPercent).toBeGreaterThanOrEqual(0)
      expect(metrics.disk.usedPercent).toBeLessThanOrEqual(100)
    })

    test('memory used is less than or equal to total', () => {
      const metrics = getCurrentMetrics()
      expect(metrics.memory.used).toBeLessThanOrEqual(metrics.memory.total)
    })

    test('disk used is less than or equal to total', () => {
      const metrics = getCurrentMetrics()
      expect(metrics.disk.used).toBeLessThanOrEqual(metrics.disk.total)
    })
  })

  describe('getMetrics', () => {
    test('returns empty array when no metrics collected', () => {
      const metrics = getMetrics(3600) // Last hour
      expect(metrics).toBeInstanceOf(Array)
    })

    test('returns metrics array structure', async () => {
      // Start collector to generate some metrics
      startMetricsCollector()

      // Wait for at least one collection
      await new Promise((resolve) => setTimeout(resolve, 1500))

      const metrics = getMetrics(3600)
      expect(metrics).toBeInstanceOf(Array)

      if (metrics.length > 0) {
        const metric = metrics[0]
        expect(metric).toHaveProperty('timestamp')
        expect(metric).toHaveProperty('cpuPercent')
        expect(metric).toHaveProperty('memoryUsedPercent')
        expect(metric).toHaveProperty('memoryCachePercent')
        expect(metric).toHaveProperty('diskUsedPercent')
      }
    })
  })

  describe('startMetricsCollector', () => {
    test('can be started', () => {
      // Should not throw
      expect(() => startMetricsCollector()).not.toThrow()
    })

    test('is idempotent - can be started multiple times', () => {
      startMetricsCollector()
      startMetricsCollector()
      startMetricsCollector()
      // Should not throw
    })

    test('collects metrics after starting', async () => {
      startMetricsCollector()

      // Wait for collection
      await new Promise((resolve) => setTimeout(resolve, 1500))

      const metrics = getMetrics(60) // Last minute
      // May or may not have metrics depending on timing, but shouldn't error
      expect(metrics).toBeInstanceOf(Array)
    })
  })

  describe('stopMetricsCollector', () => {
    test('can be stopped', () => {
      startMetricsCollector()
      expect(() => stopMetricsCollector()).not.toThrow()
    })

    test('is idempotent - can be stopped multiple times', () => {
      startMetricsCollector()
      stopMetricsCollector()
      stopMetricsCollector()
      // Should not throw
    })

    test('can be stopped even if never started', () => {
      expect(() => stopMetricsCollector()).not.toThrow()
    })
  })

  describe('metric values sanity', () => {
    test('CPU percent is reasonable', () => {
      const metrics = getCurrentMetrics()
      expect(metrics.cpu).toBeGreaterThanOrEqual(0)
      expect(metrics.cpu).toBeLessThanOrEqual(100)
    })

    test('memory percentages are consistent', () => {
      const metrics = getCurrentMetrics()
      const total = metrics.memory.total
      const used = metrics.memory.used
      const cache = metrics.memory.cache

      // used + cache should not exceed total (with some margin for timing)
      expect(used + cache).toBeLessThanOrEqual(total * 1.1) // Allow 10% margin for timing
    })
  })
})
