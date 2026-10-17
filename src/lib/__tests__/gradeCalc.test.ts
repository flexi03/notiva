import { neededGrade, parseGrade, weightedGrade } from '../gradeCalc'

const done = [
  { ects: 10, grade: 2.0 },
  { ects: 5, grade: 1.0 },
  { ects: 5, grade: null },
]

describe('gradeCalc', () => {
  it('weights by ECTS and skips modules without a grade', () => {
    expect(weightedGrade(done)).toBeCloseTo(1.667, 3)
    expect(weightedGrade([...done, { ects: 15, grade: 3.0 }])).toBeCloseTo(2.333, 3)
    expect(weightedGrade([{ ects: 5, grade: null }])).toBeNull()
  })

  it('needed average in the open modules for a target', () => {
    // 15 ECTS at 1.67 so far, 15 open, target 2.0 → (2.0·30 − 25)/15 = 2.33
    expect(neededGrade(done, 15, 2.0)).toEqual({ state: 'reachable', grade: 2.33 })
    expect(neededGrade(done, 15, 1.1)).toEqual({ state: 'unreachable' })
    expect(neededGrade(done, 15, 3.5)).toEqual({ state: 'safe' })
    expect(neededGrade(done, 0, 2.0)).toBeNull()
  })

  it('reads German grades', () => {
    expect(parseGrade('2,3')).toBe(2.3)
    expect(parseGrade(1.7)).toBe(1.7)
    expect(parseGrade('BE')).toBeNull()
    expect(parseGrade('')).toBeNull()
  })
})
