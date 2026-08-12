/**
 * Screenshots of a post, prepared for the reading pass.
 *
 * The picture a phone takes of its own screen is 3 to 8 Mo of PNG at 1290 px
 * wide. Three of those in one request is a payload no Edge Function should be
 * asked to carry, and the model gains nothing from the extra pixels: it is
 * reading a caption, not inspecting a photograph. So each capture is redrawn at
 * a sane width and re-encoded as JPEG before it leaves the phone.
 *
 * Text is the whole point, which is what fixes the two numbers below: 1600 px
 * keeps Instagram's caption type legible after re-encoding, and quality 0.82 is
 * where JPEG stops smearing small glyphs. Both were chosen for readability
 * rather than for weight, and the weight follows anyway — around 200 Ko a page.
 */

const MAX_EDGE = 1600;
const QUALITY = 0.82;

/** Anything past this is a photo album, not a post. */
export const MAX_IMAGES = 6;
/** The whole request, base64 included. Comfortably under the gateway's limit. */
export const MAX_TOTAL_BYTES = 7_000_000;

export interface PreparedImage {
  /** `data:image/jpeg;base64,…` — what the function forwards to the model. */
  dataUrl: string;
  name: string;
  bytes: number;
}

/**
 * One capture → one data URL, downscaled.
 *
 * Falls back to the file as it came when the browser cannot decode it. iOS
 * hands over HEIC often enough, and a 4 Mo HEIC that the model can still read
 * beats a clean refusal.
 */
export async function prepareImage(file: File): Promise<PreparedImage> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);

    const context = canvas.getContext('2d');
    if (!context) throw new Error('no 2d context');
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();

    const dataUrl = canvas.toDataURL('image/jpeg', QUALITY);
    return { dataUrl, name: file.name, bytes: dataUrl.length };
  } catch {
    const dataUrl = await readAsDataUrl(file);
    return { dataUrl, name: file.name, bytes: dataUrl.length };
  }
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      // `readAsDataURL` always yields a string; the union covers the other read
      // methods, and stringifying an ArrayBuffer would send "[object …]" to the
      // model as if it were an image.
      const result = reader.result;
      if (typeof result === 'string') resolve(result);
      else reject(new Error('Não consegui ler essa imagem.'));
    };
    reader.onerror = () => reject(new Error('Não consegui ler essa imagem.'));
    reader.readAsDataURL(file);
  });
}
