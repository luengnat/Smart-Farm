import { describe, it, expect } from 'vitest'
import {
  assertHasAllFields,
  assertSameShape,
  safeToFixed,
  createMockPlan,
  createMockAllocation,
  createMockCell,
  createMockCropSummary,
  REQUIRED_GENERATED_PLAN_FIELDS,
  REQUIRED_ALLOCATION_FIELDS,
} from './test-helpers'

describe('test helpers', () => {
  describe('assertHasAllFields', () => {
    it('passes when all fields present', () => {
      const data = { a: 1, b: 'x', c: true }
      expect(() => assertHasAllFields(data, ['a', 'b', 'c'])).not.toThrow()
    })

    it('throws on missing field', () => {
      const data = { a: 1 }
      expect(() => assertHasAllFields(data, ['a', 'b'])).toThrow(/missing fields: b/)
    })

    it('throws on undefined field', () => {
      const data = { a: 1, b: undefined }
      expect(() => assertHasAllFields(data, ['a', 'b'])).toThrow(/missing fields: b/)
    })

    it('includes label in error', () => {
      expect(() => assertHasAllFields({}, ['x'], 'allocation')).toThrow(/allocation is missing/)
    })
  })

  describe('assertSameShape', () => {
    it('passes when shapes match', () => {
      expect(() => assertSameShape({ a: 1, b: 2 }, { a: 3, b: 4 })).not.toThrow()
    })

    it('throws on shape mismatch', () => {
      expect(() => assertSameShape({ a: 1 }, { b: 2 })).toThrow(/Shape mismatch/)
    })

    it('reports which keys are only in each object', () => {
      expect(() => assertSameShape({ a: 1 }, { b: 2 }, 'sandbox', 'prod')).toThrow(/only in sandbox/)
    })
  })

  describe('safeToFixed', () => {
    it('handles null', () => expect(safeToFixed(null)).toBe('0.00'))
    it('handles undefined', () => expect(safeToFixed(undefined)).toBe('0.00'))
    it('handles real values', () => expect(safeToFixed(3.75)).toBe('3.75'))
    it('respects digits param', () => expect(safeToFixed(1, 1)).toBe('1.0'))
  })

  describe('createMockPlan', () => {
    it('produces a plan with all required fields', () => {
      const plan = createMockPlan()
      expect(() => assertHasAllFields(plan, REQUIRED_GENERATED_PLAN_FIELDS)).not.toThrow()
    })

    it('overrides work', () => {
      const plan = createMockPlan({ rows: 10, levels: 3 })
      expect(plan.rows).toBe(10)
      expect(plan.levels).toBe(3)
    })
  })

  describe('createMockAllocation', () => {
    it('produces an allocation with all required fields', () => {
      const alloc = createMockAllocation()
      expect(() => assertHasAllFields(alloc, REQUIRED_ALLOCATION_FIELDS)).not.toThrow()
    })

    it('reservePercent defaults to 10', () => {
      expect(createMockAllocation().reservePercent).toBe(10)
    })
  })

  describe('createMockCell', () => {
    it('produces a valid cell', () => {
      const cell = createMockCell()
      expect(cell.cropId).toBeTruthy()
      expect(cell.status).toBeTruthy()
    })
  })

  describe('createMockCropSummary', () => {
    it('includes reservePercent', () => {
      const summary = createMockCropSummary()
      expect(summary.reservePercent).toBe(10)
    })
  })
})
