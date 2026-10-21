// Shrink images in the browser before upload so they take little storage.
// A 3 MB screenshot typically becomes 100–300 KB and stays perfectly readable.

const MAX_SIDE = 1920;      // px — enough to read text in a full-screen screenshot
const TARGET_BYTES = 400_000;

export const isImage = (f: { type?: string; name: string }) =>
  (f.type ?? '').startsWith('image/') || /\.(png|jpe?g|webp|gif|bmp|heic)$/i.test(f.name);

export const isPdf = (f: { type?: string; name: string }) => f.type === 'application/pdf' || /\.pdf$/i.test(f.name);
export const WORD_TYPES = ['application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
export const isWord = (f: { type?: string; name: string }) => WORD_TYPES.includes(f.type ?? '') || /\.docx?$/i.test(f.name);
/** Content type to store a document with. */
export const docType = (f: { type?: string; name: string }) =>
  isPdf(f) ? 'application/pdf' : /\.doc$/i.test(f.name) ? WORD_TYPES[0] : WORD_TYPES[1];
/** Short badge for a file in lists. */
export const fileBadge = (f: { name: string }) => (/\.docx?$/i.test(f.name) ? 'DOC' : 'PDF');

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

/** Resize + re-encode an image. Returns a WebP (or JPEG where WebP encoding isn't available). */
export async function compressImage(file: File): Promise<File> {
  let bitmap: ImageBitmap;
  try { bitmap = await createImageBitmap(file); } catch { throw new Error(`${file.name}: this image format can’t be read here. Try PNG or JPG.`); }

  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#fff'; // transparent PNGs → white background (JPEG has no alpha)
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();

  // Prefer WebP; Safari may silently return PNG, so check and fall back to JPEG.
  let type = 'image/webp';
  let blob = await toBlob(canvas, type, 0.8);
  if (!blob || blob.type !== 'image/webp') { type = 'image/jpeg'; blob = await toBlob(canvas, type, 0.82); }
  for (const q of [0.7, 0.6, 0.5]) {
    if (!blob || blob.size <= TARGET_BYTES) break;
    blob = await toBlob(canvas, type, q);
  }
  if (!blob) throw new Error(`${file.name}: could not compress this image.`);
  // Never make it bigger than the original.
  if (blob.size >= file.size && (file.type === 'image/jpeg' || file.type === 'image/webp')) return file;

  const base = (file.name.replace(/\.[^.]+$/, '') || 'image').slice(0, 80);
  return new File([blob], `${base}.${type === 'image/webp' ? 'webp' : 'jpg'}`, { type });
}

/** Turn picked/pasted files into ready-to-upload files (images compressed, PDFs checked). */
export async function prepareFiles(files: File[], onError: (msg: string) => void): Promise<File[]> {
  const out: File[] = [];
  for (const f of files) {
    if (isPdf(f) || isWord(f)) {
      if (f.size > 10 * 1024 * 1024) { onError(`${f.name}: files must be 10 MB or smaller.`); continue; }
      out.push(f);
    } else if (isImage(f)) {
      try {
        const named = f.name === 'image.png' ? new File([f], `screenshot-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}.png`, { type: f.type }) : f;
        out.push(await compressImage(named));
      } catch (e) { onError((e as Error).message); }
    } else {
      onError(`${f.name}: only PDFs, Word documents and images can be attached.`);
    }
  }
  return out;
}
