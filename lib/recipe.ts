export const MAX_EDGE = 8192;
export const MAX_PIXELS = 24_000_000;
export const MAX_FILE_BYTES = 32 * 1024 * 1024;
export const MAX_BATCH_BYTES = 200 * 1024 * 1024;
export const MAX_FILES = 100;

type Base = { id: string; enabled: boolean };
export type ResizeStep = Base & {
  type: 'resize';
  width: number;
  height: number;
  enlarge: boolean;
};
export type CropStep = Base & {
  type: 'crop';
  ratio: '1:1' | '4:3' | '3:2' | '16:9' | '9:16';
  anchor: 'center' | 'top' | 'bottom' | 'left' | 'right';
};
export type RotateStep = Base & { type: 'rotate'; degrees: 90 | 180 | 270 };
export type FlipStep = Base & { type: 'flip'; axis: 'horizontal' | 'vertical' };
export type FormatStep = Base & {
  type: 'format';
  format: 'webp' | 'jpeg' | 'png';
  quality: number;
  background: string;
};
export type RenameStep = Base & {
  type: 'rename';
  template: string;
  start: number;
};
export type Step =
  | ResizeStep
  | CropStep
  | RotateStep
  | FlipStep
  | FormatStep
  | RenameStep;
export type StepType = Step['type'];
export type Recipe = { version: 1; name: string; steps: Step[] };

export const STEP_INFO = {
  resize: {
    title: 'Resize',
    color: 'blue',
    description:
      'Fit images inside a maximum width and height. Their proportions stay intact.',
  },
  crop: {
    title: 'Crop',
    color: 'pink',
    description:
      'Crop to an aspect ratio. Choose which part of the image to keep.',
  },
  rotate: {
    title: 'Rotate',
    color: 'green',
    description: 'Turn images clockwise, in quarter turns.',
  },
  flip: {
    title: 'Flip',
    color: 'cyan',
    description: 'Mirror an image horizontally or vertically.',
  },
  format: {
    title: 'Convert & compress',
    color: 'purple',
    description:
      'Choose the output format and balance file size with image quality.',
  },
  rename: {
    title: 'Rename',
    color: 'amber',
    description: 'Give your batch consistent names with a reusable pattern.',
  },
} as const;

export function newStep(
  type: StepType,
  existingIds: Iterable<string> = [],
): Step {
  const used = new Set(existingIds);
  let id = `step-${type}`;
  let suffix = 2;
  while (used.has(id)) id = `step-${type}-${suffix++}`;
  const base = { id, enabled: true };
  switch (type) {
    case 'resize':
      return { ...base, type, width: 1600, height: 1600, enlarge: false };
    case 'crop':
      return { ...base, type, ratio: '1:1', anchor: 'center' };
    case 'rotate':
      return { ...base, type, degrees: 90 };
    case 'flip':
      return { ...base, type, axis: 'horizontal' };
    case 'format':
      return {
        ...base,
        type,
        format: 'webp',
        quality: 80,
        background: '#ffffff',
      };
    case 'rename':
      return { ...base, type, template: '{name}-{n}', start: 1 };
  }
}

export const PRESETS: Recipe[] = [
  {
    version: 1,
    name: 'Web-ready images',
    steps: [newStep('resize'), newStep('format'), newStep('rename')],
  },
  {
    version: 1,
    name: 'Square product shots',
    steps: [
      newStep('crop'),
      {
        ...newStep('resize'),
        type: 'resize',
        width: 1200,
        height: 1200,
        enlarge: false,
      },
      {
        ...newStep('format'),
        type: 'format',
        format: 'jpeg',
        quality: 85,
        background: '#ffffff',
      },
    ],
  },
  {
    version: 1,
    name: 'Smaller screenshots',
    steps: [
      {
        ...newStep('resize'),
        type: 'resize',
        width: 1920,
        height: 1920,
        enlarge: false,
      },
      {
        ...newStep('format'),
        type: 'format',
        format: 'webp',
        quality: 85,
        background: '#ffffff',
      },
    ],
  },
];

export function stepSummary(step: Step): string {
  switch (step.type) {
    case 'resize':
      return `Fit within ${step.width.toLocaleString('en-US')} × ${step.height.toLocaleString('en-US')}`;
    case 'crop':
      return `${step.ratio} · ${step.anchor}`;
    case 'rotate':
      return `${step.degrees}° clockwise`;
    case 'flip':
      return `${step.axis === 'horizontal' ? 'Left ↔ right' : 'Top ↔ bottom'}`;
    case 'format':
      return `${step.format === 'jpeg' ? 'JPEG' : step.format === 'webp' ? 'WebP' : 'PNG'} · ${step.format === 'png' ? 'lossless' : `${step.quality}% quality`}`;
    case 'rename':
      return step.template;
  }
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('The recipe must be a JSON object.');
  return value as Record<string, unknown>;
}
function text(value: unknown, min: number, max: number, label: string): string {
  if (
    typeof value !== 'string' ||
    value.trim().length < min ||
    value.length > max
  )
    throw new Error(`${label} must be ${min}–${max} characters.`);
  return value;
}
function integer(
  value: unknown,
  min: number,
  max: number,
  label: string,
): number {
  if (
    typeof value !== 'number' ||
    !Number.isInteger(value) ||
    value < min ||
    value > max
  )
    throw new Error(`${label} must be a whole number from ${min} to ${max}.`);
  return value;
}
function choice<T extends string | number>(
  value: unknown,
  values: readonly T[],
  label: string,
): T {
  if (!values.includes(value as T))
    throw new Error(`${label} is not supported.`);
  return value as T;
}
function bool(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean')
    throw new Error(`${label} must be true or false.`);
  return value;
}

export function validateRecipe(value: unknown): Recipe {
  const source = object(value);
  if (source.version !== 1)
    throw new Error(
      'This recipe version is not supported. Expected version 1.',
    );
  const name = text(source.name, 1, 60, 'Recipe name');
  if (!Array.isArray(source.steps) || source.steps.length > 6)
    throw new Error('A recipe can contain up to six steps.');
  const types = new Set<string>();
  const ids = new Set<string>();
  const steps: Step[] = source.steps.map((value: unknown) => {
    const s = object(value);
    const type = choice(
      s.type,
      ['resize', 'crop', 'rotate', 'flip', 'format', 'rename'] as const,
      'Step type',
    );
    const id = text(s.id, 1, 80, 'Step ID');
    if (ids.has(id) || types.has(type))
      throw new Error('Each step type and ID must be unique.');
    ids.add(id);
    types.add(type);
    const base = { id, enabled: bool(s.enabled, 'Step enabled') };
    switch (type) {
      case 'resize':
        return {
          ...base,
          type,
          width: integer(s.width, 1, MAX_EDGE, 'Width'),
          height: integer(s.height, 1, MAX_EDGE, 'Height'),
          enlarge: bool(s.enlarge, 'Allow upscaling'),
        };
      case 'crop':
        return {
          ...base,
          type,
          ratio: choice(
            s.ratio,
            ['1:1', '4:3', '3:2', '16:9', '9:16'] as const,
            'Crop ratio',
          ),
          anchor: choice(
            s.anchor,
            ['center', 'top', 'bottom', 'left', 'right'] as const,
            'Crop anchor',
          ),
        };
      case 'rotate':
        return {
          ...base,
          type,
          degrees: choice(s.degrees, [90, 180, 270] as const, 'Rotation'),
        };
      case 'flip':
        return {
          ...base,
          type,
          axis: choice(
            s.axis,
            ['horizontal', 'vertical'] as const,
            'Flip axis',
          ),
        };
      case 'format': {
        if (
          typeof s.background !== 'string' ||
          !/^#[\da-f]{6}$/i.test(s.background)
        )
          throw new Error('JPEG background must be a six-digit hex color.');
        return {
          ...base,
          type,
          format: choice(
            s.format,
            ['webp', 'jpeg', 'png'] as const,
            'Output format',
          ),
          quality: integer(s.quality, 1, 100, 'Quality'),
          background: s.background,
        };
      }
      case 'rename': {
        const template = text(s.template, 1, 100, 'Filename pattern');
        if (/[{}]/.test(template.replace(/\{(?:name|n|width|height)\}/g, '')))
          throw new Error(
            'Use only {name}, {n}, {width}, and {height} in filename patterns.',
          );
        return {
          ...base,
          type,
          template,
          start: integer(s.start, 0, 99999, 'Starting number'),
        };
      }
    }
  });
  return { version: 1, name, steps };
}

export function parseRecipe(json: string): Recipe {
  if (json.length > 16_384)
    throw new Error('This recipe is too large (maximum 16 KB).');
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error('This is not valid recipe JSON.');
  }
  return validateRecipe(parsed);
}

export function encodeRecipe(recipe: Recipe): string {
  const bytes = new TextEncoder().encode(
    JSON.stringify(validateRecipe(recipe)),
  );
  return btoa(Array.from(bytes, (b) => String.fromCharCode(b)).join(''))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}
export function decodeRecipe(encoded: string): Recipe {
  if (encoded.length > 22_000 || !/^[\w-]+$/.test(encoded))
    throw new Error('This recipe link is invalid or too large.');
  try {
    const binary = atob(encoded.replace(/-/g, '+').replace(/_/g, '/'));
    return parseRecipe(
      new TextDecoder('utf-8', { fatal: true }).decode(
        Uint8Array.from(binary, (c) => c.charCodeAt(0)),
      ),
    );
  } catch (error) {
    throw new Error(
      error instanceof Error ? error.message : 'This recipe link is invalid.',
    );
  }
}

export function cleanFilename(name: string): string {
  const printable = Array.from(name, (character) => {
    const code = character.codePointAt(0)!;
    return code < 32 || code === 127 ? '-' : character;
  }).join('');
  const cleaned = printable
    .normalize('NFC')
    .replace(/[<>:"/\\|?*]/g, '-')
    .replace(/\.{2,}/g, '-')
    .replace(/^[.\s]+|[.\s]+$/g, '');
  let stem = '';
  let bytes = 0;
  for (const character of cleaned) {
    const length = new TextEncoder().encode(character).length;
    if (bytes + length > 180) break;
    stem += character;
    bytes += length;
  }
  stem = stem.replace(/[.\s]+$/g, '') || 'image';
  if (/^(?:CON|PRN|AUX|NUL|COM[1-9¹²³]|LPT[1-9¹²³])(?:\s*\.|$)/i.test(stem))
    stem = `_${stem}`;
  return stem;
}
export function outputFilename(
  original: string,
  index: number,
  width: number,
  height: number,
  format: string,
  recipe: Recipe,
): string {
  const base = original.replace(/\.[^.]+$/, '') || 'image';
  const rename = recipe.steps.find(
    (s): s is RenameStep => s.enabled && s.type === 'rename',
  );
  const tokens: Record<string, string> = {
    name: base,
    n: String(index + (rename?.start ?? 1)).padStart(2, '0'),
    width: String(width),
    height: String(height),
  };
  const stem = rename
    ? rename.template.replace(
        /\{(name|n|width|height)\}/g,
        (_, token: string) => tokens[token],
      )
    : base;
  return `${cleanFilename(stem)}.${format === 'jpeg' ? 'jpg' : format}`;
}
export function uniqueFilename(name: string, used: Set<string>): string {
  const dot = name.lastIndexOf('.');
  const stem = dot < 0 ? name : name.slice(0, dot);
  const extension = dot < 0 ? '' : name.slice(dot);
  let candidate = name;
  for (let i = 2; used.has(candidate.normalize('NFC').toLowerCase()); i++)
    candidate = `${stem} (${i})${extension}`;
  used.add(candidate.normalize('NFC').toLowerCase());
  return candidate;
}
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
