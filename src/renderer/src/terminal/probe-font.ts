import { pickNerdFont } from '../../../shared/terminal/font'

/**
 * Canvas probe for installed Nerd Fonts (ticket 18 feedback): a starship
 * prompt renders powerline/PUA glyphs (U+E0B0…) that plain monospace fonts
 * lack. Measured in real Chrome: a missing glyph paints ZERO lit pixels in
 * canvas (blank box, not tofu), while a font carrying the glyph paints
 * hundreds — so "does the glyph put ink on the canvas" is the discriminator
 * (width comparison is useless: tofu advance width ≈ monospace advance).
 */
export function detectNerdFont(): string | null {
  try {
    // U+E0B0 right-pointing powerline arrow: present in every Nerd Font.
    const sample = '\uE0B0'
    const paintsGlyph = (font: string): boolean => {
      const canvas = document.createElement('canvas')
      canvas.width = 64
      canvas.height = 64
      const context = canvas.getContext('2d', { willReadFrequently: true })
      if (context === null) return false
      context.font = '48px "' + font + '"'
      context.fillStyle = '#000'
      context.textBaseline = 'top'
      context.fillText(sample, 4, 4)
      const data = context.getImageData(4, 4, 56, 56).data
      let lit = 0
      for (let i = 3; i < data.length; i += 4) {
        if (data[i] > 10) lit++
      }
      return lit > 8
    }
    return pickNerdFont(paintsGlyph)
  } catch {
    return null
  }
}
