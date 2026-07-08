/**
 * Blur detection via Laplacian variance on a scaled-down version of the image.
 * Returns true if the image is considered blurry (variance < threshold).
 * Scales to max 600px before running to keep it fast on phone cameras.
 */
export function checkBlur(file: File, threshold = 80): Promise<boolean> {
  return new Promise((resolve) => {
    const img = new Image()
    const url = URL.createObjectURL(file)

    img.onload = () => {
      URL.revokeObjectURL(url)

      // Scale down for performance: max 600px on longest side
      const MAX = 600
      const scale = Math.min(1, MAX / Math.max(img.naturalWidth, img.naturalHeight))
      const w = Math.max(1, Math.round(img.naturalWidth * scale))
      const h = Math.max(1, Math.round(img.naturalHeight * scale))

      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d')
      if (!ctx) { resolve(false); return }
      ctx.drawImage(img, 0, 0, w, h)

      const { data, width, height } = ctx.getImageData(0, 0, w, h)

      // Grayscale
      const gray: number[] = new Array(width * height)
      for (let i = 0; i < data.length; i += 4) {
        gray[i >> 2] = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]
      }

      // Laplacian [0,1,0,1,-4,1,0,1,0]
      let mean = 0
      const lap: number[] = []
      for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
          const idx = y * width + x
          const val =
            -4 * gray[idx] +
            gray[idx - 1] +
            gray[idx + 1] +
            gray[idx - width] +
            gray[idx + width]
          lap.push(val)
          mean += val
        }
      }
      if (lap.length === 0) { resolve(false); return }
      mean /= lap.length
      let variance = 0
      for (const v of lap) variance += (v - mean) ** 2
      variance /= lap.length

      resolve(variance < threshold)
    }

    img.onerror = () => { URL.revokeObjectURL(url); resolve(false) }
    img.src = url
  })
}
