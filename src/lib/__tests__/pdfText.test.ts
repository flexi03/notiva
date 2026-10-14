import { MODULHANDBUCH_PDF } from '@/test/fixtures/pdf'
import { pdfText } from '../pdfText'

describe('pdfText', () => {
  it('extracts the text of each page', async () => {
    const bytes = MODULHANDBUCH_PDF
    const { text, pages } = await pdfText(bytes)
    expect(pages).toBe(1)
    expect(text).toContain('Seite 1')
    expect(text).toContain('Modulhandbuch Informatik')
    expect(text).toContain('Analysis 9 ECTS')
  })

  it('rejects files that are no PDF', async () => {
    await expect(pdfText(new TextEncoder().encode('kein pdf'))).rejects.toThrow()
  })
})
