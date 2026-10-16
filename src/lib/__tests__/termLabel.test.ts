import { termLabel } from '@/components/widgets/ModuleMoodle'

describe('term labels of Moodle courses', () => {
  it('shortens the term in the course name', () => {
    expect(termLabel('Datenbanksysteme 2 - WiSe 2025 26')).toBe('WiSe 25/26')
    expect(termLabel('BMI 12 Mathematik 2 (SoSe2025)')).toBe('SoSe 25')
    expect(termLabel('BMI 32 Datenbanksysteme 2')).toBe('BMI 32 Datenbanksysteme 2')
  })
})
