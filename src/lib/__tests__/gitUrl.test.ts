import { repoUrl } from '../gitUrl'

describe('git links', () => {
  it('turns project links into clone addresses', () => {
    expect(
      repoUrl('https://projectbase.medien.hs-duesseldorf.de/dbs2/praktikum-2/-/tree/main?ref_type=heads'),
    ).toEqual({
      url: 'https://projectbase.medien.hs-duesseldorf.de/dbs2/praktikum-2.git',
      name: 'praktikum-2',
    })
    expect(repoUrl('https://github.com/flexi03/notiva/tree/main/src')).toEqual({
      url: 'https://github.com/flexi03/notiva.git',
      name: 'notiva',
    })
    expect(repoUrl('https://git.example.org/lab/aufgabe1.git')).toEqual({
      url: 'https://git.example.org/lab/aufgabe1.git',
      name: 'aufgabe1',
    })
  })
  it('ignores other links', () => {
    expect(repoUrl('https://moodle.example/mod/url/view.php?id=4')).toBeNull()
    expect(repoUrl('https://gitlab.example/users/sign_in')).toBeNull()
    expect(repoUrl('https://gitlab.example/dbs2')).toBeNull()
    expect(repoUrl('http://gitlab.example/a/b')).toBeNull()
  })
})
