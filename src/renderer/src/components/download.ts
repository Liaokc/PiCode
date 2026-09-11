/**
 * One file download through the usual anchor+blob path (shared by the
 * diagram card's SVG/PNG/MMD menu and the code card's download button —
 * ticket 60 lifted it out of DiagramCard so both chrome families use one
 * implementation).
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  // Give the navigation handler a beat before revoking (an immediate revoke
  // can race the download start).
  setTimeout(() => URL.revokeObjectURL(url), 1_000)
}
