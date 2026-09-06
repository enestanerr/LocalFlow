import test from 'node:test';
import assert from 'node:assert/strict';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { unzipSync } from 'fflate';
import {
  inspectBytes,
  inspectFile,
  processImage,
  transformGeometry,
  type ImageRuntime,
} from '../lib/image-engine';
import { newStep, type Recipe, type Step } from '../lib/recipe';
import { createArchive } from '../lib/download';

const runtime: ImageRuntime = {
  canvas: (w, h) => createCanvas(w, h) as unknown as HTMLCanvasElement,
  decode: async (file) => {
    const img = await loadImage(Buffer.from(await file.arrayBuffer()));
    return {
      source: img as unknown as CanvasImageSource,
      width: img.width,
      height: img.height,
      close: () => {},
    };
  },
};
const recipe = (steps: Step[]): Recipe => ({
  version: 1,
  name: 'Test workflow',
  steps,
});
async function fixture(
  width = 1200,
  height = 800,
  format: 'png' | 'jpeg' | 'webp' = 'png',
) {
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ff0000';
  ctx.fillRect(0, 0, width / 2, height / 2);
  ctx.fillStyle = '#00ff00';
  ctx.fillRect(width / 2, 0, width / 2, height / 2);
  ctx.fillStyle = '#0000ff';
  ctx.fillRect(0, height / 2, width / 2, height / 2);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(width / 2, height / 2, width / 2, height / 2);
  const bytes = await (format === 'png'
    ? canvas.encode('png')
    : canvas.encode(format, 95));
  return new File([new Uint8Array(bytes)], `fixture.${format}`, {
    type: `image/${format}`,
  });
}
async function pixel(blob: Blob, x: number, y: number) {
  const img = await loadImage(Buffer.from(await blob.arrayBuffer()));
  const canvas = createCanvas(img.width, img.height);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0);
  return Array.from(ctx.getImageData(x, y, 1, 1).data);
}

void test('actual geometry follows the visible order and output pixels', async () => {
  const file = await fixture();
  const resize: Step = {
    ...newStep('resize'),
    type: 'resize',
    width: 600,
    height: 600,
    enlarge: false,
  };
  const a = await processImage(
    file,
    recipe([resize, newStep('rotate'), newStep('crop')]),
    0,
    { runtime },
  );
  assert.equal(a.width, 400);
  assert.equal(a.height, 400);
  assert.deepEqual(await pixel(a.blob, 20, 20), [0, 0, 255, 255]);
  const b = await processImage(
    file,
    recipe([newStep('crop'), resize, newStep('rotate')]),
    0,
    { runtime },
  );
  assert.equal(b.width, 600);
  assert.equal(b.height, 600);
});
void test('each clockwise rotation and flip preserves expected corners', async () => {
  const file = await fixture(80, 40);
  for (const [step, expected] of [
    [{ ...newStep('rotate'), degrees: 90 }, [0, 0, 255, 255]],
    [{ ...newStep('rotate'), degrees: 180 }, [255, 255, 255, 255]],
    [{ ...newStep('rotate'), degrees: 270 }, [0, 255, 0, 255]],
    [{ ...newStep('flip'), axis: 'horizontal' }, [0, 255, 0, 255]],
    [{ ...newStep('flip'), axis: 'vertical' }, [0, 0, 255, 255]],
  ] as [Step, number[]][]) {
    const result = await processImage(file, recipe([step]), 0, { runtime });
    assert.deepEqual(await pixel(result.blob, 5, 5), expected);
  }
});
void test('fit bounds preserve aspect ratio and do not upscale by default', () => {
  const resize: Step = {
    ...newStep('resize'),
    type: 'resize',
    width: 100,
    height: 100,
    enlarge: false,
  };
  assert.deepEqual(transformGeometry(200, 100, resize), {
    width: 100,
    height: 50,
    sx: 0,
    sy: 0,
    sw: 200,
    sh: 100,
  });
  assert.equal(transformGeometry(50, 50, resize).width, 50);
  assert.equal(
    transformGeometry(50, 50, { ...resize, enlarge: true }).width,
    100,
  );
  assert.equal(
    transformGeometry(200, 100, { ...resize, enabled: false }).width,
    200,
  );
  assert.throws(() =>
    transformGeometry(5000, 5000, {
      ...resize,
      width: 8192,
      height: 8192,
      enlarge: true,
    }),
  );
});
void test('crop anchoring selects the requested area', async () => {
  const file = await fixture(120, 40);
  const left = await processImage(
    file,
    recipe([
      { ...newStep('crop'), type: 'crop', ratio: '1:1', anchor: 'left' },
    ]),
    0,
    { runtime },
  );
  const right = await processImage(
    file,
    recipe([
      { ...newStep('crop'), type: 'crop', ratio: '1:1', anchor: 'right' },
    ]),
    0,
    { runtime },
  );
  assert.deepEqual(await pixel(left.blob, 5, 5), [255, 0, 0, 255]);
  assert.deepEqual(await pixel(right.blob, 5, 5), [0, 255, 0, 255]);
});
void test('JPEG fills transparent pixels with the selected color; PNG preserves alpha', async () => {
  const canvas = createCanvas(30, 30);
  canvas.getContext('2d').fillRect(12, 12, 5, 5);
  const file = new File(
    [new Uint8Array(await canvas.encode('png'))],
    'alpha.png',
    { type: 'image/png' },
  );
  const jpeg = await processImage(
    file,
    recipe([
      {
        ...newStep('format'),
        type: 'format',
        format: 'jpeg',
        quality: 100,
        background: '#ffffff',
      },
    ]),
    0,
    { runtime },
  );
  const rgba = await pixel(jpeg.blob, 1, 1);
  assert.ok(rgba[0] > 250 && rgba[1] > 250 && rgba[2] > 250);
  assert.equal(rgba[3], 255);
  const png = await processImage(
    file,
    recipe([
      {
        ...newStep('format'),
        type: 'format',
        format: 'png',
        quality: 1,
        background: '#ffffff',
      },
    ]),
    0,
    { runtime },
  );
  assert.deepEqual(await pixel(png.blob, 1, 1), [0, 0, 0, 0]);
});
void test('all three encoders have matching signatures, MIME, extensions, and dimensions', async () => {
  const file = await fixture(200, 100);
  for (const format of ['png', 'jpeg', 'webp'] as const) {
    const output = await processImage(
      file,
      recipe([
        {
          ...newStep('format'),
          type: 'format',
          format,
          quality: 85,
          background: '#ffffff',
        },
      ]),
      0,
      { runtime },
    );
    assert.equal(output.blob.type, `image/${format}`);
    assert.ok(output.name.endsWith(format === 'jpeg' ? '.jpg' : `.${format}`));
    assert.deepEqual(await inspectFile(output.blob), {
      width: 200,
      height: 100,
      format,
    });
    const decoded = await loadImage(
      Buffer.from(await output.blob.arrayBuffer()),
    );
    assert.equal(decoded.width, 200);
    assert.equal(decoded.height, 100);
  }
});
void test('MIME-less files are detected by bytes; unsupported and huge headers fail early', async () => {
  const valid = await fixture(40, 20, 'jpeg');
  const noMime = new File([valid], 'photo.jpg');
  assert.equal((await inspectFile(noMime)).format, 'jpeg');
  await assert.rejects(
    () => inspectFile(new File(['broken'], 'broken.png')),
    /not supported/,
  );
  const bytes = new Uint8Array(await (await fixture(20, 20)).arrayBuffer());
  new DataView(bytes.buffer).setUint32(16, 100000);
  assert.throws(() => inspectBytes(bytes), /limit/);
});
void test('animated WebP and APNG are explicitly rejected', async () => {
  const webp = new Uint8Array(30);
  webp.set(new TextEncoder().encode('RIFF'), 0);
  new DataView(webp.buffer).setUint32(4, 22, true);
  webp.set(new TextEncoder().encode('WEBPVP8X'), 8);
  new DataView(webp.buffer).setUint32(16, 10, true);
  webp[20] = 2;
  assert.throws(() => inspectBytes(webp), /Animated WebP/);
  const png = new Uint8Array(await (await fixture(10, 10)).arrayBuffer());
  const actl = new Uint8Array(20);
  new DataView(actl.buffer).setUint32(0, 8);
  actl.set(new TextEncoder().encode('acTL'), 4);
  const animated = new Uint8Array(png.length + 20);
  animated.set(png.subarray(0, 33));
  animated.set(actl, 33);
  animated.set(png.subarray(33), 53);
  assert.throws(() => inspectBytes(animated), /Animated PNG/);
});
void test('unsupported encoder fallback and null encoding never produce false success', async () => {
  const file = await fixture(20, 20);
  const fallback: ImageRuntime = {
    ...runtime,
    canvas: (w, h) => {
      const c = runtime.canvas(w, h);
      c.toBlob = (cb) => cb(new Blob(['png'], { type: 'image/png' }));
      return c;
    },
  };
  await assert.rejects(
    () =>
      processImage(file, recipe([newStep('format')]), 0, { runtime: fallback }),
    /not available/,
  );
  const failed: ImageRuntime = {
    ...runtime,
    canvas: (w, h) => {
      const c = runtime.canvas(w, h);
      c.toBlob = (cb) => cb(null);
      return c;
    },
  };
  await assert.rejects(
    () => processImage(file, recipe([]), 0, { runtime: failed }),
    /could not encode/,
  );
});
void test('cancellation before decode and during encode prevents an output', async () => {
  const file = await fixture(20, 20);
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    () =>
      processImage(file, recipe([]), 0, { runtime, signal: controller.signal }),
    { name: 'AbortError' },
  );
  const later = new AbortController();
  let closed = 0;
  const aborting: ImageRuntime = {
    ...runtime,
    decode: async (f) => {
      const decoded = await runtime.decode(f);
      return {
        ...decoded,
        close: () => {
          closed++;
          decoded.close();
        },
      };
    },
    canvas: (w, h) => {
      const c = runtime.canvas(w, h);
      const encode = c.toBlob.bind(c);
      c.toBlob = (cb, mime, quality) =>
        encode(
          (blob) => {
            later.abort();
            cb(blob);
          },
          mime,
          quality,
        );
      return c;
    },
  };
  await assert.rejects(
    () =>
      processImage(file, recipe([]), 0, {
        runtime: aborting,
        signal: later.signal,
      }),
    { name: 'AbortError' },
  );
  assert.equal(closed, 1);
});
void test('cancelling during inspection skips decoding and canvas allocation', async () => {
  const source = await fixture(20, 20);
  const controller = new AbortController();
  const read = source.arrayBuffer.bind(source);
  source.arrayBuffer = async () => {
    const bytes = await read();
    controller.abort();
    return bytes;
  };
  let decoded = 0;
  let allocated = 0;
  await assert.rejects(
    processImage(source, recipe([]), 0, {
      signal: controller.signal,
      runtime: {
        decode: (file) => {
          decoded++;
          return runtime.decode(file);
        },
        canvas: (w, h) => {
          allocated++;
          return runtime.canvas(w, h);
        },
      },
    }),
    { name: 'AbortError' },
  );
  assert.equal(decoded, 0);
  assert.equal(allocated, 0);
});
void test('cancelling during decoding closes the bitmap without allocating a canvas', async () => {
  const source = await fixture(20, 20);
  const controller = new AbortController();
  let closed = 0;
  let allocated = 0;
  await assert.rejects(
    processImage(source, recipe([]), 0, {
      signal: controller.signal,
      runtime: {
        decode: async (file) => {
          const decoded = await runtime.decode(file);
          controller.abort();
          return {
            ...decoded,
            close: () => {
              closed++;
              decoded.close();
            },
          };
        },
        canvas: (w, h) => {
          allocated++;
          return runtime.canvas(w, h);
        },
      },
    }),
    { name: 'AbortError' },
  );
  assert.equal(closed, 1);
  assert.equal(allocated, 0);
});
void test('source EXIF marker is not copied into the new encoded JPEG', async () => {
  const source = new Uint8Array(
    await (await fixture(40, 30, 'jpeg')).arrayBuffer(),
  );
  const metadata = new TextEncoder().encode(
    'Exif\0\0LOCALFLOW_PRIVATE_CAMERA_GPS',
  );
  const marker = new Uint8Array(metadata.length + 4);
  marker.set([255, 225], 0);
  new DataView(marker.buffer).setUint16(2, metadata.length + 2);
  marker.set(metadata, 4);
  const tagged = new Uint8Array(source.length + marker.length);
  tagged.set(source.subarray(0, 2));
  tagged.set(marker, 2);
  tagged.set(source.subarray(2), marker.length + 2);
  const file = new File([tagged], 'tagged.jpg', { type: 'image/jpeg' });
  const output = await processImage(file, recipe([]), 0, { runtime });
  assert.ok(
    Buffer.from(await file.arrayBuffer()).includes(
      'LOCALFLOW_PRIVATE_CAMERA_GPS',
    ),
  );
  assert.ok(
    !Buffer.from(await output.blob.arrayBuffer()).includes(
      'LOCALFLOW_PRIVATE_CAMERA_GPS',
    ),
  );
});
void test('ZIP preserves all colliding files, Unicode names, and exact output bytes', async () => {
  const images = [
    { name: 'same.webp', blob: new Blob([new Uint8Array([1, 2, 3])]) },
    { name: 'same.webp', blob: new Blob([new Uint8Array([4, 5])]) },
    { name: 'ürün-🐉.png', blob: new Blob([new Uint8Array([6, 7])]) },
  ];
  const zip = await createArchive(images);
  const entries = unzipSync(new Uint8Array(await zip.arrayBuffer()));
  assert.deepEqual(Object.keys(entries), [
    'same.webp',
    'same (2).webp',
    'ürün-🐉.png',
  ]);
  assert.deepEqual(Array.from(entries['same.webp']), [1, 2, 3]);
  assert.deepEqual(Array.from(entries['same (2).webp']), [4, 5]);
  await assert.rejects(() => createArchive([]), /no processed files/);
});
void test('a corrupt file does not prevent independently processing the next valid file', async () => {
  await assert.rejects(() =>
    processImage(new File(['bad'], 'broken.jpg'), recipe([]), 0, { runtime }),
  );
  const result = await processImage(await fixture(60, 40), recipe([]), 1, {
    runtime,
  });
  assert.equal(result.width, 60);
});

void test('initial canvas failure releases the decoded image and allocated surface', async () => {
  const file = await fixture(20, 20);
  let closed = 0;
  const surface = { width: 20, height: 20, getContext: () => null };
  const failing: ImageRuntime = {
    canvas: () => surface as unknown as HTMLCanvasElement,
    decode: async (f) => {
      const decoded = await runtime.decode(f);
      return {
        ...decoded,
        close: () => {
          closed++;
        },
      };
    },
  };
  await assert.rejects(
    () => processImage(file, recipe([]), 0, { runtime: failing }),
    /could not create/,
  );
  assert.equal(closed, 1);
  assert.equal(surface.width, 0);
  assert.equal(surface.height, 0);
});
