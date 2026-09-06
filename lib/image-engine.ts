import {
  MAX_EDGE,
  MAX_FILE_BYTES,
  MAX_PIXELS,
  outputFilename,
  type Recipe,
  type Step,
  type FormatStep,
  validateRecipe,
} from './recipe';

export type ImageInfo = {
  width: number;
  height: number;
  format: 'png' | 'jpeg' | 'webp';
};
export type ProcessedImage = ImageInfo & { blob: Blob; name: string };
export type CanvasFactory = (
  width: number,
  height: number,
) => HTMLCanvasElement;
export type ImageRuntime = {
  canvas: CanvasFactory;
  decode: (file: Blob) => Promise<{
    source: CanvasImageSource;
    width: number;
    height: number;
    close: () => void;
  }>;
};

function dimensions(width: number, height: number) {
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 1 ||
    height < 1 ||
    width > MAX_EDGE ||
    height > MAX_EDGE ||
    width * height > MAX_PIXELS
  ) {
    throw new Error(
      'Image dimensions exceed the limit: 8,192 px per side and 24 megapixels.',
    );
  }
  return { width, height };
}

export function inspectBytes(bytes: Uint8Array): ImageInfo {
  const data = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const ascii = (start: number, size: number) =>
    String.fromCharCode(...bytes.subarray(start, start + size));
  if (
    bytes.length >= 24 &&
    bytes[0] === 137 &&
    ascii(1, 3) === 'PNG' &&
    bytes[4] === 13 &&
    bytes[5] === 10 &&
    bytes[6] === 26 &&
    bytes[7] === 10
  ) {
    if (ascii(12, 4) !== 'IHDR')
      throw new Error('This PNG has an invalid header.');
    const size = dimensions(data.getUint32(16), data.getUint32(20));
    for (let offset = 8; offset + 12 <= bytes.length;) {
      const length = data.getUint32(offset);
      if (offset + length + 12 > bytes.length)
        throw new Error('This PNG is incomplete or damaged.');
      if (ascii(offset + 4, 4) === 'acTL')
        throw new Error('Animated PNG is not supported. Use a still image.');
      offset += length + 12;
    }
    return { ...size, format: 'png' };
  }
  if (bytes.length >= 12 && ascii(0, 4) === 'RIFF' && ascii(8, 4) === 'WEBP') {
    if (data.getUint32(4, true) + 8 > bytes.length)
      throw new Error('This WebP is incomplete or damaged.');
    let size: { width: number; height: number } | undefined;
    for (let offset = 12; offset + 8 <= bytes.length;) {
      const chunk = ascii(offset, 4);
      const length = data.getUint32(offset + 4, true);
      const p = offset + 8;
      if (p + length > bytes.length)
        throw new Error('This WebP is incomplete or damaged.');
      if (
        chunk === 'ANIM' ||
        chunk === 'ANMF' ||
        (chunk === 'VP8X' && length >= 10 && bytes[p] & 2)
      )
        throw new Error('Animated WebP is not supported. Use a still image.');
      if (chunk === 'VP8X' && length >= 10)
        size = dimensions(
          1 + bytes[p + 4] + (bytes[p + 5] << 8) + (bytes[p + 6] << 16),
          1 + bytes[p + 7] + (bytes[p + 8] << 8) + (bytes[p + 9] << 16),
        );
      if (
        !size &&
        chunk === 'VP8 ' &&
        length >= 10 &&
        ascii(p + 3, 3) === '\x9d\x01\x2a'
      )
        size = dimensions(
          data.getUint16(p + 6, true) & 0x3fff,
          data.getUint16(p + 8, true) & 0x3fff,
        );
      if (!size && chunk === 'VP8L' && length >= 5 && bytes[p] === 0x2f) {
        const packed = data.getUint32(p + 1, true);
        size = dimensions(
          (packed & 0x3fff) + 1,
          ((packed >>> 14) & 0x3fff) + 1,
        );
      }
      offset = p + length + (length & 1);
    }
    if (!size) throw new Error('This WebP has an invalid image header.');
    return { ...size, format: 'webp' };
  }
  if (bytes.length > 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    for (let offset = 2; offset + 4 <= bytes.length;) {
      if (bytes[offset] !== 0xff) break;
      while (bytes[offset] === 0xff) offset++;
      const marker = bytes[offset++];
      if (marker === 0xda || marker === 0xd9) break;
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
      if (offset + 2 > bytes.length) break;
      const length = data.getUint16(offset);
      if (length < 2 || offset + length > bytes.length) break;
      if (
        [
          0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd,
          0xce, 0xcf,
        ].includes(marker) &&
        length >= 8
      ) {
        return {
          ...dimensions(data.getUint16(offset + 5), data.getUint16(offset + 3)),
          format: 'jpeg',
        };
      }
      offset += length;
    }
    throw new Error('This JPEG is incomplete or has an invalid header.');
  }
  throw new Error(
    'Choose a still PNG, JPEG, or WebP image. This file type is not supported.',
  );
}

export async function inspectFile(file: Blob): Promise<ImageInfo> {
  if (file.size > MAX_FILE_BYTES)
    throw new Error('This file is larger than 32 MB.');
  return inspectBytes(new Uint8Array(await file.arrayBuffer()));
}

const browserRuntime: ImageRuntime = {
  canvas: (width, height) => {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    return canvas;
  },
  decode: async (file) => {
    const bitmap = await createImageBitmap(file, {
      imageOrientation: 'from-image',
    });
    return {
      source: bitmap,
      width: bitmap.width,
      height: bitmap.height,
      close: () => bitmap.close(),
    };
  },
};

export function transformGeometry(width: number, height: number, step: Step) {
  let result = { width, height, sx: 0, sy: 0, sw: width, sh: height };
  if (!step.enabled) return result;
  switch (step.type) {
    case 'resize': {
      const scale = Math.min(
        step.width / width,
        step.height / height,
        step.enlarge ? Infinity : 1,
      );
      result = {
        ...result,
        width: Math.max(1, Math.round(width * scale)),
        height: Math.max(1, Math.round(height * scale)),
      };
      break;
    }
    case 'crop': {
      const [a, b] = step.ratio.split(':').map(Number);
      const ratio = a / b;
      const sw = Math.min(width, Math.max(1, Math.round(height * ratio)));
      const sh = Math.min(height, Math.max(1, Math.round(width / ratio)));
      const sx =
        step.anchor === 'left'
          ? 0
          : step.anchor === 'right'
            ? width - sw
            : Math.floor((width - sw) / 2);
      const sy =
        step.anchor === 'top'
          ? 0
          : step.anchor === 'bottom'
            ? height - sh
            : Math.floor((height - sh) / 2);
      result = { width: sw, height: sh, sx, sy, sw, sh };
      break;
    }
    case 'rotate':
      if (step.degrees !== 180)
        result = { ...result, width: height, height: width };
      break;
  }
  dimensions(result.width, result.height);
  return result;
}

function context(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('This browser could not create an image canvas.');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  return ctx;
}
function abort(signal?: AbortSignal) {
  if (signal?.aborted)
    throw new DOMException('Processing cancelled.', 'AbortError');
}

export async function processImage(
  file: File,
  recipeInput: Recipe,
  index = 0,
  options: { signal?: AbortSignal; runtime?: ImageRuntime } = {},
): Promise<ProcessedImage> {
  const recipe = validateRecipe(recipeInput);
  abort(options.signal);
  const info = await inspectFile(file);
  abort(options.signal);
  const runtime = options.runtime ?? browserRuntime;
  const image = await runtime.decode(file);
  let canvas: HTMLCanvasElement | undefined;
  try {
    abort(options.signal);
    dimensions(image.width, image.height);
    canvas = runtime.canvas(image.width, image.height);
    context(canvas).drawImage(image.source, 0, 0);
  } catch (error) {
    if (canvas) {
      canvas.width = 0;
      canvas.height = 0;
    }
    throw error;
  } finally {
    image.close();
  }
  try {
    for (const step of recipe.steps) {
      abort(options.signal);
      if (!step.enabled || step.type === 'format' || step.type === 'rename')
        continue;
      const g = transformGeometry(canvas.width, canvas.height, step);
      const next = runtime.canvas(g.width, g.height);
      try {
        const ctx = context(next);
        if (step.type === 'rotate') {
          ctx.translate(g.width / 2, g.height / 2);
          ctx.rotate((step.degrees * Math.PI) / 180);
          ctx.drawImage(canvas, -canvas.width / 2, -canvas.height / 2);
        } else if (step.type === 'flip') {
          ctx.translate(
            step.axis === 'horizontal' ? g.width : 0,
            step.axis === 'vertical' ? g.height : 0,
          );
          ctx.scale(
            step.axis === 'horizontal' ? -1 : 1,
            step.axis === 'vertical' ? -1 : 1,
          );
          ctx.drawImage(canvas, 0, 0);
        } else
          ctx.drawImage(
            canvas,
            g.sx,
            g.sy,
            g.sw,
            g.sh,
            0,
            0,
            g.width,
            g.height,
          );
      } catch (error) {
        next.width = 0;
        next.height = 0;
        throw error;
      }
      canvas.width = 0;
      canvas.height = 0;
      canvas = next;
    }
    const formatStep = recipe.steps.find(
      (s): s is FormatStep => s.enabled && s.type === 'format',
    );
    const format = formatStep?.format ?? info.format;
    if (format === 'jpeg') {
      const ctx = context(canvas);
      ctx.globalCompositeOperation = 'destination-over';
      ctx.fillStyle = formatStep?.background ?? '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.globalCompositeOperation = 'source-over';
    }
    abort(options.signal);
    const mime = `image/${format}`;
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas!.toBlob(
        (b) =>
          b
            ? resolve(b)
            : reject(
                new Error(
                  'The browser could not encode this image. Try a smaller output.',
                ),
              ),
        mime,
        (formatStep?.quality ?? 90) / 100,
      ),
    );
    if (blob.type !== mime)
      throw new Error(
        `${format.toUpperCase()} encoding is not available in this browser. Choose PNG or JPEG.`,
      );
    abort(options.signal);
    return {
      width: canvas.width,
      height: canvas.height,
      format,
      blob,
      name: outputFilename(
        file.name,
        index,
        canvas.width,
        canvas.height,
        format,
        recipe,
      ),
    };
  } finally {
    if (canvas) {
      canvas.width = 0;
      canvas.height = 0;
    }
  }
}

export async function makeDemoFiles(): Promise<File[]> {
  const names = ['color-study', 'soft-spectrum', 'transparent-shapes'];
  const files: File[] = [];
  for (let i = 0; i < names.length; i++) {
    const canvas = browserRuntime.canvas(
      i === 1 ? 1200 : 1800,
      i === 1 ? 1600 : 1200,
    );
    const ctx = context(canvas);
    if (i < 2) {
      const gradient = ctx.createLinearGradient(
        0,
        0,
        canvas.width,
        canvas.height,
      );
      const colors =
        i === 0
          ? ['#3b3dd8', '#8b57e2', '#f199c1', '#ffc394']
          : ['#111d40', '#416e91', '#7abec0', '#e0cbb0'];
      colors.forEach((color, j) => gradient.addColorStop(j / 3, color));
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      for (let j = 0; j < 8; j++) {
        ctx.strokeStyle = 'rgba(255,255,255,.2)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(
          canvas.width * 0.5,
          canvas.height * 0.7,
          100 + j * 80,
          0,
          Math.PI * 2,
        );
        ctx.stroke();
      }
    } else {
      ctx.fillStyle = '#7662d7';
      ctx.beginPath();
      ctx.arc(690, 560, 330, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#f1ad83';
      ctx.fillRect(820, 330, 500, 500);
      ctx.fillStyle = '#72b9b3';
      ctx.beginPath();
      ctx.moveTo(760, 200);
      ctx.lineTo(1020, 780);
      ctx.lineTo(460, 780);
      ctx.fill();
    }
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (b) =>
          b ? resolve(b) : reject(new Error('Could not create sample images.')),
        'image/png',
      ),
    );
    files.push(new File([blob], `${names[i]}.png`, { type: 'image/png' }));
    canvas.width = 0;
    canvas.height = 0;
  }
  return files;
}
