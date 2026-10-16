import { labNumber } from '@/app/labLinks'

describe('lab number of a repository', () => {
  it('reads it from the name or title', () => {
    expect(labNumber('Praktikum 1 - SQL Wiederholung und Vertiefung')).toBe(1)
    expect(labNumber('praktikum-03-trigger')).toBe(3)
    expect(labNumber('OOP2 P04 Vererbung')).toBe(4)
    expect(labNumber('se-bmi-13')).toBeNull()
  })
})
