import { HSD_PROFILE, parseUniversityProfile, profileFromPage, programFor, PROFILE_PAGE } from '../university'

describe('university profile', () => {
  it('is HSD by default and reads its own page', () => {
    expect(parseUniversityProfile(undefined)).toBe(HSD_PROFILE)
    expect(profileFromPage(PROFILE_PAGE).ecampus.examsUrl).toBe(HSD_PROFILE.ecampus.examsUrl)
  })
  it('takes other addresses and own modules, rejects unsafe ones', () => {
    const p = parseUniversityProfile({
      hochschule: {
        name: 'Uni X',
        moodle: { adresse: 'https://moodle.uni-x.de/' },
        ecampus: { startseite: 'javascript:alert(1)' },
        module: [{ nr: 'INF 01', name: 'Programmieren 1', ects: 6, semester: 1 }],
      },
    })
    expect(p.moodle.site).toBe('https://moodle.uni-x.de')
    expect(p.ecampus.startUrl).toBe(HSD_PROFILE.ecampus.startUrl)
    const program = programFor(p, undefined)!
    expect(program.modules[0]).toMatchObject({ nr: 'INF 01', ects: 6 })
    expect(program.code).toBe('INF')
  })
})
