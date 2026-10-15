import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/vault', () => ({ electronBridge: () => null }))
const { useAiContext } = await import('@/app/aiContext')

describe('AI context: page or whole PDF', () => {
  it('switches back to the page when the page is clicked', () => {
    const { toggle } = useAiContext.getState()
    toggle('pdfAll')
    expect(useAiContext.getState().include).toMatchObject({ pdfAll: true, pdfPage: false })
    toggle('pdfPage')
    expect(useAiContext.getState().include).toMatchObject({ pdfAll: false, pdfPage: true })
    toggle('pdfAll')
    toggle('pdfAll')
    expect(useAiContext.getState().include).toMatchObject({ pdfAll: false, pdfPage: true })
    // The page alone can still be switched off.
    toggle('pdfPage')
    expect(useAiContext.getState().include).toMatchObject({ pdfAll: false, pdfPage: false })
  })
})
