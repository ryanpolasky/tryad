// minimal 16-bit PCM WAV encoder. takes an AudioBuffer (any channel count,
// any sample rate) and produces a complete .wav file as a Uint8Array.
//
// format:
//   RIFF chunk  -> "RIFF" + size + "WAVE"
//   fmt  chunk  -> 16-byte PCM descriptor
//   data chunk  -> interleaved int16 samples

export function audioBufferToWav(buffer: AudioBuffer): Uint8Array {
  const numChannels = buffer.numberOfChannels
  const sampleRate = buffer.sampleRate
  const numFrames = buffer.length
  const bytesPerSample = 2
  const blockAlign = numChannels * bytesPerSample
  const byteRate = sampleRate * blockAlign
  const dataSize = numFrames * blockAlign
  const headerSize = 44
  const out = new Uint8Array(headerSize + dataSize)
  const view = new DataView(out.buffer)

  // RIFF header
  writeString(view, 0, 'RIFF')
  view.setUint32(4, 36 + dataSize, true)
  writeString(view, 8, 'WAVE')
  // fmt chunk
  writeString(view, 12, 'fmt ')
  view.setUint32(16, 16, true) // PCM chunk size
  view.setUint16(20, 1, true) // format = PCM
  view.setUint16(22, numChannels, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, byteRate, true)
  view.setUint16(32, blockAlign, true)
  view.setUint16(34, bytesPerSample * 8, true)
  // data chunk header
  writeString(view, 36, 'data')
  view.setUint32(40, dataSize, true)

  // interleave channels and convert float32 [-1, 1] -> int16
  const channels: Float32Array[] = []
  for (let c = 0; c < numChannels; c++) channels.push(buffer.getChannelData(c))

  let offset = headerSize
  for (let i = 0; i < numFrames; i++) {
    for (let c = 0; c < numChannels; c++) {
      const s = Math.max(-1, Math.min(1, channels[c][i]))
      // asymmetric int16 quantization keeps the range honest at the extremes.
      const v = s < 0 ? Math.round(s * 0x8000) : Math.round(s * 0x7fff)
      view.setInt16(offset, v, true)
      offset += 2
    }
  }
  return out
}

function writeString(view: DataView, offset: number, s: string): void {
  for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i))
}

// trigger a browser download of the given bytes as a file.
export function downloadBlob(bytes: Uint8Array, filename: string, mime: string): void {
  // copy into a fresh ArrayBuffer so the Blob doesn't reference a SharedArrayBuffer
  // (some browsers refuse those for object URLs).
  const ab = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(ab).set(bytes)
  const blob = new Blob([ab], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  // revoke after the click cycle so safari has time to start the download.
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
