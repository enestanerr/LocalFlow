import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import {
  cleanFilename,
  decodeRecipe,
  encodeRecipe,
  newStep,
  outputFilename,
  parseRecipe,
  PRESETS,
  uniqueFilename,
  validateRecipe,
  type Recipe,
} from '../lib/recipe';

void test('shared Unicode recipe round-trips without filenames or file data', () => {
  const recipe: Recipe = {
    version: 1,
    name: 'Ürün görselleri ✨',
    steps: [
      {
        ...newStep('rename'),
        type: 'rename',
        template: 'ürün-🐉-{n}',
        start: 7,
      },
      newStep('crop'),
    ],
  };
  recipe.steps[1].enabled = false;
  assert.deepEqual(decodeRecipe(encodeRecipe(recipe)), recipe);
  assert.deepEqual(parseRecipe(JSON.stringify(recipe)), recipe);
  assert.equal(
    outputFilename('a.png', 0, 100, 100, 'jpeg', recipe),
    'ürün-🐉-07.jpg',
  );
});
void test('published example recipes validate and survive sharing round-trips', async () => {
  const directory = new URL('../examples/', import.meta.url);
  const files = (await readdir(directory)).filter((name) =>
    name.endsWith('.json'),
  );
  assert.equal(files.length, 3);
  for (const name of files) {
    const example = parseRecipe(
      await readFile(new URL(name, directory), 'utf8'),
    );
    assert.deepEqual(decodeRecipe(encodeRecipe(example)), example);
  }
});
void test('import rejects bad recipes before returning a replacement', () => {
  const valid = structuredClone(PRESETS[0]);
  for (const invalid of [
    null,
    [],
    {},
    { ...valid, version: 2 },
    { ...valid, steps: [{ ...newStep('resize'), width: 0 }] },
    { ...valid, steps: [{ ...newStep('resize'), height: 9000 }] },
    { ...valid, steps: [{ ...newStep('resize'), enlarge: 'yes' }] },
    { ...valid, steps: [{ ...newStep('format'), quality: NaN }] },
    { ...valid, steps: [{ ...newStep('format'), background: 'red' }] },
    { ...valid, steps: [{ ...newStep('crop'), ratio: '3:0' }] },
    { ...valid, steps: [newStep('crop'), newStep('crop')] },
    { ...valid, steps: [{ ...newStep('rename'), template: '{password}' }] },
    { ...valid, steps: [{ type: 'execute', id: 'x', enabled: true }] },
  ])
    assert.throws(() => validateRecipe(invalid));
  assert.throws(() => parseRecipe('{broken'));
  assert.throws(() => parseRecipe(' '.repeat(17000)));
  assert.throws(() => decodeRecipe('='.repeat(23000)));
  assert.throws(() => decodeRecipe('abcd!!!'));
  assert.deepEqual(valid, PRESETS[0]);
});
void test('import copies only known properties', () => {
  const value = { ...PRESETS[0], files: ['private.jpg'], secret: 'ignored' };
  assert.deepEqual(validateRecipe(value), PRESETS[0]);
});
void test('new steps remain addressable after importing conflicting custom IDs', () => {
  const imported = validateRecipe({
    version: 1,
    name: 'Custom IDs',
    steps: [
      { ...newStep('resize'), id: 'step-crop' },
      { ...newStep('rotate'), id: 'step-crop-2' },
    ],
  });
  const added = newStep(
    'crop',
    imported.steps.map((step) => step.id),
  );
  const updated = validateRecipe({
    ...imported,
    steps: [...imported.steps, added],
  });
  assert.equal(added.id, 'step-crop-3');
  assert.equal(updated.steps.filter((step) => step.id === added.id).length, 1);
  assert.deepEqual(updated.steps.slice(0, 2), imported.steps);
});
void test('filenames are portable, flat, Unicode-safe, and bounded', () => {
  for (const stem of [
    'CON',
    'NUL',
    'AUX',
    'PRN',
    'COM1',
    'LPT1',
    'con.txt',
    'COM¹',
  ])
    assert.ok(cleanFilename(stem).startsWith('_'));
  const portable = cleanFilename('../../folder\\photo:*?');
  assert.ok(!/[<>:"/\\|?*]/.test(portable));
  assert.ok(!portable.includes('..'));
  assert.ok(portable.includes('folder-photo'));
  assert.equal(cleanFilename(''), 'image');
  assert.equal(cleanFilename('  hello. '), 'hello');
  assert.ok(
    new TextEncoder().encode(cleanFilename('🐉'.repeat(100))).length <= 180,
  );
  assert.ok(!cleanFilename('🐉'.repeat(100)).includes('\ufffd'));
  assert.equal(cleanFilename('cafe\u0301'), 'café');
});
void test('duplicate output names remain distinct across formats and case', () => {
  const recipe: Recipe = { version: 1, name: 'No renaming', steps: [] };
  const used = new Set<string>();
  const a = uniqueFilename(
    outputFilename('photo.jpg', 0, 2, 2, 'webp', recipe),
    used,
  );
  const b = uniqueFilename(
    outputFilename('photo.png', 1, 2, 2, 'webp', recipe),
    used,
  );
  const c = uniqueFilename(
    outputFilename('PHOTO.JPG', 2, 2, 2, 'webp', recipe),
    used,
  );
  assert.deepEqual(
    [a, b, c],
    ['photo.webp', 'photo (2).webp', 'PHOTO (3).webp'],
  );
});
