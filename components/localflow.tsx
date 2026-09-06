'use client';
/* oxlint-disable next/no-img-element -- Private blob URLs must stay local and must not pass through an image optimizer. */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Check,
  ChevronRight,
  Crop,
  Download,
  Expand,
  FileImage,
  FileJson,
  FlipHorizontal2,
  FolderInput,
  GripVertical,
  CodeXml,
  HelpCircle,
  Layers3,
  Link2,
  LoaderCircle,
  LockKeyhole,
  Play,
  Plus,
  RotateCw,
  Save,
  Share2,
  SlidersHorizontal,
  Sparkles,
  Square,
  Trash2,
  WandSparkles,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Progress } from '@/components/ui/progress';
import StepSettings, { Choice } from './step-settings';
import {
  decodeRecipe,
  encodeRecipe,
  formatBytes,
  MAX_BATCH_BYTES,
  MAX_FILES,
  newStep,
  parseRecipe,
  PRESETS,
  STEP_INFO,
  stepSummary,
  uniqueFilename,
  validateRecipe,
  type Recipe,
  type Step,
  type StepType,
} from '@/lib/recipe';
import {
  inspectFile,
  makeDemoFiles,
  processImage,
  type ImageInfo,
  type ProcessedImage,
} from '@/lib/image-engine';
import { createArchive, downloadBlob } from '@/lib/download';

type InputImage = { id: string; file: File; url: string; info: ImageInfo };
type Result = {
  id: string;
  input: InputImage;
  output?: ProcessedImage;
  url?: string;
  error?: string;
};
type Preview = ProcessedImage & { url: string };
const ICONS = {
  resize: Expand,
  crop: Crop,
  rotate: RotateCw,
  flip: FlipHorizontal2,
  format: Sparkles,
  rename: FileImage,
};
const STORAGE_KEY = 'localflow.recipe.v1';
const SAVED_KEY = 'localflow.saved.v1';
const messageOf = (error: unknown) =>
  error instanceof Error
    ? error.message
    : 'Something went wrong. Please try again.';

export default function LocalFlow() {
  const inputRef = useRef<HTMLInputElement>(null);
  const importRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<InputImage[]>([]);
  const urls = useRef(new Set<string>());
  const loadingRef = useRef(false);
  const operationRef = useRef<
    'files' | 'sample' | 'import' | 'batch' | 'zip' | null
  >(null);
  const alive = useRef(true);
  const batchController = useRef<AbortController | null>(null);
  const previewController = useRef<AbortController | null>(null);
  const [files, setFiles] = useState<InputImage[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [recipe, setRecipe] = useState<Recipe>(() =>
    structuredClone(PRESETS[0]),
  );
  const [selectedStepId, setSelectedStepId] = useState('step-resize');
  const [initialized, setInitialized] = useState(false);
  const [savedRecipe, setSavedRecipe] = useState<Recipe | null>(null);
  const [savedName, setSavedName] = useState('');
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [zipping, setZipping] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [results, setResults] = useState<Result[]>([]);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [previewError, setPreviewError] = useState('');
  const [notice, setNotice] = useState('');
  const [pendingRecipe, setPendingRecipe] = useState<Recipe | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [draggingFiles, setDraggingFiles] = useState(false);
  const [dragStep, setDragStep] = useState<string | null>(null);
  const [dialog, setDialog] = useState<
    'add' | 'save' | 'share' | 'help' | null
  >(null);
  const [shareUrl, setShareUrl] = useState('');
  const [copied, setCopied] = useState(false);
  const selected = files.find((f) => f.id === selectedId) ?? files[0];
  const activeStep =
    recipe.steps.find((s) => s.id === selectedStepId) ?? recipe.steps[0];
  const recipeJson = JSON.stringify(recipe);
  const fileSignature = files.map((f) => f.id).join(',');
  const locked = busy || adding || zipping;
  const successes = results.filter((r) => r.output);
  const sourceBytes = files.reduce((sum, f) => sum + f.file.size, 0);
  const completedInputBytes = successes.reduce(
    (sum, r) => sum + r.input.file.size,
    0,
  );
  const outputBytes = successes.reduce(
    (sum, r) => sum + r.output!.blob.size,
    0,
  );
  const savings = completedInputBytes
    ? Math.round((1 - outputBytes / completedInputBytes) * 100)
    : 0;
  let recipeError = '';
  try {
    validateRecipe(recipe);
  } catch (error) {
    recipeError = messageOf(error);
  }

  const createUrl = useCallback((blob: Blob) => {
    const url = URL.createObjectURL(blob);
    urls.current.add(url);
    return url;
  }, []);
  const revoke = useCallback((url?: string) => {
    if (url) {
      URL.revokeObjectURL(url);
      urls.current.delete(url);
    }
  }, []);

  /* oxlint-disable react/react-compiler -- These effects synchronize browser-only storage and release object URLs when their recipe/file owners change. */
  useEffect(() => {
    alive.current = true;
    const trackedUrls = urls.current;
    function loadSharedRecipe() {
      const hash = new URLSearchParams(window.location.hash.slice(1)).get(
        'recipe',
      );
      if (!hash) return false;
      try {
        const loaded = decodeRecipe(hash);
        if (operationRef.current) {
          setPendingRecipe(loaded);
          setNotice(
            'Shared recipe received. Load it when the current task finishes.',
          );
          return true;
        }
        setPendingRecipe(null);
        setRecipe(loaded);
        setSelectedStepId(loaded.steps[0]?.id ?? '');
        setNotice('Shared recipe loaded. Add your own images to run it.');
      } catch (error) {
        setNotice(`Could not load shared recipe: ${messageOf(error)}`);
      }
      return true;
    }
    if (!loadSharedRecipe()) {
      try {
        const cached = localStorage.getItem(STORAGE_KEY);
        if (cached) {
          const loaded = parseRecipe(cached);
          setRecipe(loaded);
          setSelectedStepId(loaded.steps[0]?.id ?? '');
        }
      } catch {
        /* Last-used recipe storage is optional. Shared links work without it. */
      }
    }
    window.addEventListener('hashchange', loadSharedRecipe);
    try {
      const saved = localStorage.getItem(SAVED_KEY);
      if (saved) setSavedRecipe(parseRecipe(saved));
    } catch {
      /* Optional device-local storage. */
    }
    setInitialized(true);
    return () => {
      alive.current = false;
      window.removeEventListener('hashchange', loadSharedRecipe);
      batchController.current?.abort();
      previewController.current?.abort();
      trackedUrls.forEach((url) => URL.revokeObjectURL(url));
      trackedUrls.clear();
    };
  }, []);

  useEffect(() => {
    if (!initialized) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(validateRecipe(recipe)));
    } catch {
      /* Invalid drafts and unavailable storage do not replace the last good recipe. */
    }
  }, [recipe, initialized]);

  useEffect(() => {
    setResults((old) => {
      old.forEach((r) => revoke(r.url));
      return [];
    });
    setProgress({ done: 0, total: 0 });
  }, [recipeJson, fileSignature, revoke]);

  useEffect(() => {
    const controller = new AbortController();
    previewController.current?.abort();
    previewController.current = controller;
    setPreview((old) => {
      revoke(old?.url);
      return null;
    });
    setPreviewError('');
    if (!selected || busy || adding || recipeError) {
      setPreviewBusy(false);
      return () => controller.abort();
    }
    setPreviewBusy(true);
    const timer = setTimeout(async () => {
      try {
        const output = await processImage(
          selected.file,
          JSON.parse(recipeJson) as Recipe,
          files.findIndex((f) => f.id === selected.id),
          { signal: controller.signal },
        );
        if (controller.signal.aborted || !alive.current) return;
        setPreview({ ...output, url: createUrl(output.blob) });
      } catch (error) {
        if (!controller.signal.aborted && alive.current)
          setPreviewError(messageOf(error));
      } finally {
        if (!controller.signal.aborted && alive.current) setPreviewBusy(false);
      }
    }, 300);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [
    selected,
    recipeJson,
    busy,
    adding,
    recipeError,
    files,
    createUrl,
    revoke,
  ]);
  /* oxlint-enable react/react-compiler */

  async function addFiles(
    incoming: File[],
    reservation: 'sample' | null = null,
  ) {
    if (
      loadingRef.current ||
      (operationRef.current !== null && operationRef.current !== reservation) ||
      !incoming.length
    )
      return;
    operationRef.current = 'files';
    loadingRef.current = true;
    setAdding(true);
    setWarnings([]);
    setNotice('');
    const accepted: InputImage[] = [];
    const errors: string[] = [];
    const current = fileRef.current;
    let bytes = current.reduce((sum, f) => sum + f.file.size, 0);
    try {
      for (const file of incoming) {
        if (current.length + accepted.length >= MAX_FILES) {
          errors.push(
            `Batch limit reached: ${MAX_FILES} images. Remaining files were not added.`,
          );
          break;
        }
        try {
          if (bytes + file.size > MAX_BATCH_BYTES)
            throw new Error('This file would exceed the 200 MB batch limit.');
          const info = await inspectFile(file);
          const bitmap = await createImageBitmap(file, {
            imageOrientation: 'from-image',
          });
          info.width = bitmap.width;
          info.height = bitmap.height;
          bitmap.close();
          if (!alive.current) break;
          accepted.push({
            id: crypto.randomUUID(),
            file,
            info,
            url: createUrl(file),
          });
          bytes += file.size;
        } catch (error) {
          errors.push(`${file.name}: ${messageOf(error)}`);
        }
      }
      if (!alive.current) {
        accepted.forEach((f) => revoke(f.url));
        return;
      }
      const next = [...current, ...accepted];
      fileRef.current = next;
      setFiles(next);
      if (!selectedId && accepted[0]) setSelectedId(accepted[0].id);
      setWarnings(errors);
      if (accepted.length)
        setNotice(
          `${accepted.length} image${accepted.length === 1 ? '' : 's'} added. Select an image to preview the result.`,
        );
    } finally {
      operationRef.current = null;
      loadingRef.current = false;
      if (alive.current) setAdding(false);
    }
  }

  function removeFile(id: string) {
    if (operationRef.current) return;
    const target = fileRef.current.find((f) => f.id === id);
    revoke(target?.url);
    const next = fileRef.current.filter((f) => f.id !== id);
    fileRef.current = next;
    setFiles(next);
    if (selectedId === id) setSelectedId(next[0]?.id ?? '');
  }
  function clearFiles() {
    if (operationRef.current) return;
    fileRef.current.forEach((f) => revoke(f.url));
    fileRef.current = [];
    setFiles([]);
    setSelectedId('');
    setWarnings([]);
    setNotice('');
  }
  function changeRecipe(next: Recipe) {
    if (operationRef.current) return;
    setRecipe(next);
    setSelectedStepId(next.steps[0]?.id ?? '');
    setNotice('');
  }
  function updateStep(id: string, patch: Record<string, unknown>) {
    if (operationRef.current) return;
    setRecipe((r) => ({
      ...r,
      steps: r.steps.map((s) =>
        s.id === id ? ({ ...s, ...patch } as Step) : s,
      ),
    }));
  }
  function moveStep(id: string, targetIndex: number) {
    if (operationRef.current) return;
    setRecipe((r) => {
      const steps = [...r.steps];
      const index = steps.findIndex((s) => s.id === id);
      if (index < 0 || targetIndex < 0 || targetIndex >= steps.length) return r;
      const [step] = steps.splice(index, 1);
      steps.splice(targetIndex, 0, step);
      return { ...r, steps };
    });
  }
  function addStep(type: StepType) {
    if (operationRef.current || recipe.steps.some((s) => s.type === type))
      return;
    const step = newStep(
      type,
      recipe.steps.map((s) => s.id),
    );
    setRecipe((r) => ({ ...r, steps: [...r.steps, step] }));
    setSelectedStepId(step.id);
    setDialog(null);
  }
  async function runBatch() {
    if (operationRef.current || !fileRef.current.length || recipeError) return;
    const snapshot = validateRecipe(recipe);
    const inputs = [...fileRef.current];
    operationRef.current = 'batch';
    const controller = new AbortController();
    batchController.current = controller;
    previewController.current?.abort();
    setBusy(true);
    setNotice('');
    setProgress({ done: 0, total: inputs.length });
    setResults((old) => {
      old.forEach((r) => revoke(r.url));
      return [];
    });
    const used = new Set<string>();
    let done = 0;
    let failed = 0;
    let bytes = 0;
    try {
      for (let i = 0; i < inputs.length; i++) {
        if (controller.signal.aborted || !alive.current) break;
        const item = inputs[i];
        try {
          const output = await processImage(item.file, snapshot, i, {
            signal: controller.signal,
          });
          if (controller.signal.aborted || !alive.current) break;
          if (bytes + output.blob.size > MAX_BATCH_BYTES)
            throw new Error(
              'Output batch exceeds 200 MB. Reduce dimensions or process fewer images.',
            );
          output.name = uniqueFilename(output.name, used);
          bytes += output.blob.size;
          const url = createUrl(output.blob);
          setResults((old) => [
            ...old,
            { id: item.id, input: item, output, url },
          ]);
        } catch (error) {
          if (controller.signal.aborted || !alive.current) break;
          failed++;
          setResults((old) => [
            ...old,
            { id: item.id, input: item, error: messageOf(error) },
          ]);
        }
        done++;
        setProgress({ done, total: inputs.length });
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
      if (alive.current)
        setNotice(
          controller.signal.aborted
            ? `Stopped after ${done} of ${inputs.length} images. Completed files are ready to download.`
            : `Finished: ${done - failed} successful${failed ? `, ${failed} failed` : ''}. Your originals are unchanged.`,
        );
    } finally {
      if (alive.current) setBusy(false);
      batchController.current = null;
      operationRef.current = null;
    }
  }
  async function downloadZip() {
    if (!successes.length || operationRef.current) return;
    operationRef.current = 'zip';
    setZipping(true);
    try {
      const blob = await createArchive(successes.map((r) => r.output!));
      downloadBlob(blob, 'localflow-images.zip');
      setNotice('ZIP download started.');
    } catch (error) {
      setNotice(`Could not create ZIP: ${messageOf(error)}`);
    } finally {
      operationRef.current = null;
      if (alive.current) setZipping(false);
    }
  }
  async function importRecipe(file: File) {
    if (operationRef.current) return;
    operationRef.current = 'import';
    setAdding(true);
    try {
      if (file.size > 16_384)
        throw new Error('Recipe files must be smaller than 16 KB.');
      const next = parseRecipe(await file.text());
      if (!alive.current) return;
      setRecipe(next);
      setSelectedStepId(next.steps[0]?.id ?? '');
      setNotice(`Imported “${next.name}”.`);
    } catch (error) {
      if (alive.current)
        setNotice(`Could not import recipe: ${messageOf(error)}`);
    } finally {
      operationRef.current = null;
      if (alive.current) setAdding(false);
    }
  }
  async function addSamples() {
    if (operationRef.current) return;
    operationRef.current = 'sample';
    setAdding(true);
    try {
      const samples = await makeDemoFiles();
      if (alive.current) await addFiles(samples, 'sample');
    } catch (error) {
      if (alive.current) setNotice(messageOf(error));
    } finally {
      if (operationRef.current === 'sample') operationRef.current = null;
      if (alive.current) setAdding(false);
    }
  }
  function exportRecipe() {
    try {
      downloadBlob(
        new Blob([JSON.stringify(validateRecipe(recipe), null, 2)], {
          type: 'application/json',
        }),
        'localflow-recipe.json',
      );
      setNotice('Recipe exported. Image files are not included.');
    } catch (error) {
      setNotice(messageOf(error));
    }
  }
  function shareRecipe() {
    try {
      const url = new URL(window.location.href);
      url.hash = `recipe=${encodeRecipe(recipe)}`;
      url.search = '';
      setShareUrl(url.toString());
      setCopied(false);
      setDialog('share');
    } catch (error) {
      setNotice(messageOf(error));
    }
  }
  function saveRecipe() {
    try {
      const next = validateRecipe({ ...recipe, name: savedName.trim() });
      localStorage.setItem(SAVED_KEY, JSON.stringify(next));
      setSavedRecipe(next);
      setRecipe(next);
      setDialog(null);
      setNotice(`“${next.name}” saved on this device.`);
    } catch (error) {
      setNotice(`Could not save: ${messageOf(error)}`);
    }
  }
  const presetValue =
    PRESETS.find(
      (p) => JSON.stringify(p.steps) === JSON.stringify(recipe.steps),
    )?.name ?? 'custom';
  const ActiveIcon = activeStep ? ICONS[activeStep.type] : SlidersHorizontal;

  return (
    <div className="app-shell">
      <a className="skip-link" href="#workflow">
        Skip to workflow
      </a>
      <header className="app-header">
        <span className="brand" aria-label="LocalFlow">
          <span className="brand-mark">
            <Layers3 size={23} />
          </span>
          localflow<span className="brand-dot">.</span>
        </span>
        <div className="header-location">
          <span>Workspace</span>
          <ChevronRight size={14} />
          <strong>Image workflow</strong>
        </div>
        <div className="header-actions">
          <div className="local-badge">
            <span className="status-dot" />
            100% on your device
          </div>
          <a
            className="icon-button"
            href="https://github.com/enestanerr/LocalFlow"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="LocalFlow source code on GitHub (opens a new tab)"
            title="Source code on GitHub"
          >
            <CodeXml size={19} />
          </a>
          <button
            className="icon-button"
            aria-label="About LocalFlow"
            onClick={() => setDialog('help')}
          >
            <HelpCircle size={19} />
          </button>
        </div>
      </header>
      <div className="workspace">
        <aside className="files-panel" aria-label="Input files">
          <div className="panel-heading">
            <h2>Input files</h2>
            <div className="inline-actions">
              <span className="count">{files.length}</span>
              {files.length > 0 && (
                <button
                  className="icon-button"
                  aria-label="Clear all input files"
                  disabled={locked}
                  onClick={clearFiles}
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          </div>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp"
            className="sr-only"
            tabIndex={-1}
            aria-label="Choose input images"
            disabled={locked}
            onChange={(e) => {
              void addFiles(Array.from(e.target.files ?? []));
              e.target.value = '';
            }}
          />
          <input
            ref={importRef}
            type="file"
            accept="application/json,.json"
            className="sr-only"
            tabIndex={-1}
            aria-label="Import a recipe file"
            disabled={locked}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void importRecipe(file);
              e.target.value = '';
            }}
          />
          <button
            className={`dropzone ${draggingFiles ? 'is-dragging' : ''}`}
            disabled={locked}
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              if (!locked) setDraggingFiles(true);
            }}
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node))
                setDraggingFiles(false);
            }}
            onDrop={(e) => {
              e.preventDefault();
              setDraggingFiles(false);
              void addFiles(Array.from(e.dataTransfer.files));
            }}
          >
            <span className="upload-icon">
              {adding ? (
                <LoaderCircle className="spin" size={24} />
              ) : (
                <FolderInput size={24} />
              )}
            </span>
            <strong>
              {adding ? 'Checking your images…' : 'Drop your images here'}
            </strong>
            <span>
              or <b>browse files</b>
            </span>
            <small>PNG, JPG, WebP · up to 32 MB each</small>
          </button>
          <button
            className="sample-button"
            disabled={locked}
            onClick={() => void addSamples()}
          >
            <Sparkles size={14} />
            Try 3 sample images
            <ChevronRight size={14} />
          </button>
          {files.length > 0 && (
            <div className="file-list-summary">
              <span>
                {files.length} image{files.length === 1 ? '' : 's'}
              </span>
              <span>{formatBytes(sourceBytes)}</span>
            </div>
          )}
          <div className="file-list">
            {files.map((item) => (
              <div
                className={`file-item ${selected?.id === item.id ? 'is-active' : ''}`}
                key={item.id}
              >
                <button
                  className="file-select"
                  aria-label={`Preview ${item.file.name}`}
                  aria-pressed={selected?.id === item.id}
                  onClick={() => setSelectedId(item.id)}
                >
                  <img className="file-thumb" src={item.url} alt="" />
                  <span>
                    <strong>{item.file.name}</strong>
                    <small>
                      {item.info.width} × {item.info.height} ·{' '}
                      {formatBytes(item.file.size)}
                    </small>
                  </span>
                </button>
                <button
                  className="icon-button remove-file"
                  disabled={locked}
                  aria-label={`Remove ${item.file.name}`}
                  onClick={() => removeFile(item.id)}
                >
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
          {files.length === 0 && (
            <div className="input-empty-note">
              Start with your files, or use the samples to take a quick look.
            </div>
          )}
          <div className="privacy-note">
            <LockKeyhole size={18} />
            <div>
              <strong>Private by design</strong>
              <p>
                Images are processed locally. Original files are never changed.
              </p>
              <small>100 images · 200 MB per batch</small>
            </div>
          </div>
        </aside>
        <main className="main-workspace" id="workflow">
          <div className="workspace-heading">
            <div>
              <span className="eyebrow">IMAGE WORKSPACE</span>
              <h1>Your images, in a better flow.</h1>
              <p>Set your steps. Preview the result. Export the whole batch.</p>
            </div>
            <span className="workspace-symbol">
              <WandSparkles size={28} />
            </span>
          </div>
          <div className="recipe-toolbar">
            <fieldset disabled={locked} className="preset-control">
              <Choice
                label="Recipe"
                value={presetValue}
                options={[
                  ...PRESETS.map((p) => ({ value: p.name, label: p.name })),
                  {
                    value: 'custom',
                    label:
                      recipe.name === 'Web-ready images'
                        ? 'Custom workflow'
                        : recipe.name,
                  },
                  ...(savedRecipe
                    ? [{ value: 'saved', label: `Saved · ${savedRecipe.name}` }]
                    : []),
                ]}
                onChange={(value) => {
                  const next =
                    value === 'saved'
                      ? savedRecipe
                      : PRESETS.find((p) => p.name === value);
                  if (next) changeRecipe(structuredClone(next));
                }}
              />
            </fieldset>
            <div className="recipe-actions">
              <button
                className="toolbar-button"
                aria-label="Save recipe"
                disabled={locked || !!recipeError}
                onClick={() => {
                  setSavedName(recipe.name);
                  setDialog('save');
                }}
              >
                <Save size={15} />
                <span>Save</span>
              </button>
              <button
                className="toolbar-button"
                disabled={locked}
                aria-label="Import recipe"
                onClick={() => importRef.current?.click()}
              >
                <FolderInput size={15} />
                <span>Import</span>
              </button>
              <button
                className="toolbar-button"
                disabled={locked || !!recipeError}
                aria-label="Share recipe"
                onClick={shareRecipe}
              >
                <Share2 size={15} />
                <span>Share</span>
              </button>
            </div>
          </div>
          <section className="flow-section" aria-label="Image workflow">
            <div className="section-heading">
              <h2>
                <SlidersHorizontal size={17} />
                Your workflow
              </h2>
              <span className="subtle">
                {recipe.steps.filter((s) => s.enabled).length} active steps
              </span>
            </div>
            <div className="flow-canvas">
              <div className="flow-start">
                <span className="status-dot" />
                {files.length
                  ? `${files.length} INPUT IMAGE${files.length === 1 ? '' : 'S'}`
                  : 'INPUT FILES'}
              </div>
              {recipe.steps.map((step, i) => {
                const Icon = ICONS[step.type];
                return (
                  <div
                    className="flow-step-wrap"
                    key={step.id}
                    onDragOver={(e) => {
                      if (dragStep) {
                        e.preventDefault();
                        e.dataTransfer.dropEffect = 'move';
                      }
                    }}
                    onDrop={(e) => {
                      if (dragStep) {
                        e.preventDefault();
                        moveStep(dragStep, i);
                        setDragStep(null);
                      }
                    }}
                  >
                    <ArrowDown className="flow-arrow" size={16} />
                    <div
                      className={`flow-step ${activeStep?.id === step.id ? 'is-selected' : ''} ${!step.enabled ? 'is-disabled' : ''} ${dragStep === step.id ? 'is-moving' : ''}`}
                    >
                      <button
                        className="drag-handle"
                        draggable={!locked}
                        disabled={locked}
                        aria-label={`Drag ${STEP_INFO[step.type].title} to reorder`}
                        onDragStart={(e) => {
                          setDragStep(step.id);
                          e.dataTransfer.effectAllowed = 'move';
                          e.dataTransfer.setData('text/plain', step.id);
                        }}
                        onDragEnd={() => setDragStep(null)}
                      >
                        <GripVertical size={16} />
                      </button>
                      <button
                        className="step-select"
                        aria-label={`Configure ${STEP_INFO[step.type].title}`}
                        aria-pressed={activeStep?.id === step.id}
                        onClick={() => setSelectedStepId(step.id)}
                      >
                        <span
                          className={`step-icon ${STEP_INFO[step.type].color}`}
                        >
                          <Icon size={20} />
                        </span>
                        <span className="step-copy">
                          <strong>{STEP_INFO[step.type].title}</strong>
                          <span>{stepSummary(step)}</span>
                        </span>
                      </button>
                      <div className="step-position">
                        <button
                          className="icon-button"
                          disabled={locked || i === 0}
                          aria-label={`Move ${STEP_INFO[step.type].title} up`}
                          onClick={() => moveStep(step.id, i - 1)}
                        >
                          <ArrowUp size={12} />
                        </button>
                        <button
                          className="icon-button"
                          disabled={locked || i === recipe.steps.length - 1}
                          aria-label={`Move ${STEP_INFO[step.type].title} down`}
                          onClick={() => moveStep(step.id, i + 1)}
                        >
                          <ArrowDown size={12} />
                        </button>
                      </div>
                      <Switch
                        checked={step.enabled}
                        onCheckedChange={(enabled) =>
                          updateStep(step.id, { enabled })
                        }
                        aria-label={`Enable ${STEP_INFO[step.type].title}`}
                        disabled={locked}
                      />
                    </div>
                  </div>
                );
              })}
              {recipe.steps.length < 6 && (
                <>
                  <ArrowDown className="flow-arrow" size={16} />
                  <button
                    className="add-step"
                    disabled={locked}
                    onClick={() => setDialog('add')}
                  >
                    <Plus size={16} />
                    Add a step
                  </button>
                </>
              )}
              <ArrowDown className="flow-arrow" size={16} />
              <div className="flow-end">
                <Download size={14} />
                EXPORT IMAGES
              </div>
            </div>
            <div className="flow-caption">
              <GripVertical size={13} />
              <span>
                Reorder image steps with the handle or arrows. Format and names
                apply at export.
              </span>
            </div>
          </section>
          {recipeError && (
            <div className="error-banner" role="alert">
              {recipeError}
            </div>
          )}
          <section className="preview-section">
            <div className="section-heading">
              <h2>
                <FileImage size={17} />
                Live preview
              </h2>
              <span className="subtle">
                {previewBusy ? (
                  <span className="inline-status">
                    <LoaderCircle size={12} className="spin" />
                    Updating
                  </span>
                ) : (
                  'Before & after'
                )}
              </span>
            </div>
            {!selected ? (
              <div className="preview-empty">
                <div className="empty-image-icon">
                  <FileImage size={30} />
                </div>
                <strong>Your next batch starts here</strong>
                <p>Add an image to see your workflow in action.</p>
                <Button
                  className="primary-button"
                  disabled={locked}
                  onClick={() => inputRef.current?.click()}
                >
                  <Plus size={16} />
                  Add images
                </Button>
              </div>
            ) : (
              <>
                <div className="preview-grid">
                  <figure>
                    <div className="preview-label">
                      <span>ORIGINAL</span>
                      <span>{formatBytes(selected.file.size)}</span>
                    </div>
                    <div className="image-stage">
                      <img
                        src={selected.url}
                        alt={`Original: ${selected.file.name}`}
                      />
                    </div>
                    <figcaption>
                      {selected.info.width} × {selected.info.height}
                      <span>{selected.info.format.toUpperCase()}</span>
                    </figcaption>
                  </figure>
                  <figure>
                    <div className="preview-label">
                      <span>AFTER WORKFLOW</span>
                      <span>
                        {preview ? formatBytes(preview.blob.size) : '—'}
                      </span>
                    </div>
                    <div className="image-stage">
                      {preview ? (
                        <img
                          src={preview.url}
                          alt={`Processed: ${preview.name}`}
                        />
                      ) : (
                        <span className="preview-status">
                          {previewBusy ? (
                            <>
                              <LoaderCircle className="spin" size={22} />
                              Applying your steps…
                            </>
                          ) : busy ? (
                            'Batch processing…'
                          ) : (
                            previewError || recipeError || 'Preparing preview…'
                          )}
                        </span>
                      )}
                    </div>
                    <figcaption>
                      {preview ? `${preview.width} × ${preview.height}` : '—'}
                      <span>{preview?.format.toUpperCase() ?? ''}</span>
                    </figcaption>
                  </figure>
                </div>
                {preview && (
                  <div className="preview-filename">
                    <span title={preview.name}>{preview.name}</span>
                    <span
                      className={
                        preview.blob.size < selected.file.size
                          ? 'savings'
                          : 'size-increase'
                      }
                    >
                      {Math.abs(
                        Math.round(
                          (1 - preview.blob.size / selected.file.size) * 100,
                        ),
                      )}
                      %{' '}
                      {preview.blob.size < selected.file.size
                        ? 'smaller'
                        : 'larger'}
                    </span>
                  </div>
                )}
              </>
            )}
          </section>
          <div className="run-bar">
            <div>
              <strong>
                {files.length
                  ? `${files.length} image${files.length === 1 ? '' : 's'} ready`
                  : 'Ready when you are'}
              </strong>
              <span>
                {files.length
                  ? `${formatBytes(sourceBytes)} total · original files stay untouched`
                  : 'Add your images to start processing.'}
              </span>
            </div>
            {busy ? (
              <Button
                className="stop-button"
                onClick={() => batchController.current?.abort()}
              >
                <Square size={14} />
                Stop processing
              </Button>
            ) : (
              <Button
                className="primary-button run-button"
                disabled={locked || !files.length || !!recipeError}
                onClick={() => void runBatch()}
              >
                {locked ? (
                  <LoaderCircle className="spin" size={16} />
                ) : (
                  <Play size={16} />
                )}
                Process{' '}
                {files.length
                  ? `${files.length} image${files.length === 1 ? '' : 's'}`
                  : 'images'}
              </Button>
            )}
          </div>
          {busy && (
            <div className="batch-progress">
              <Progress
                value={
                  progress.total ? (100 * progress.done) / progress.total : 0
                }
                aria-label="Batch processing progress"
              />
              <span>
                {progress.done} of {progress.total} complete
              </span>
            </div>
          )}
          {(notice || pendingRecipe) && (
            <output className="notice" aria-live="polite">
              <span>
                {pendingRecipe
                  ? `Shared recipe “${pendingRecipe.name}” is ready to load.`
                  : notice}
              </span>
              {pendingRecipe && (
                <Button
                  variant="outline"
                  disabled={locked}
                  onClick={() => {
                    changeRecipe(pendingRecipe);
                    setPendingRecipe(null);
                    setNotice('Shared recipe loaded.');
                  }}
                >
                  Load recipe
                </Button>
              )}
              <button
                className="icon-button"
                aria-label="Dismiss message"
                onClick={() => {
                  setNotice('');
                  setPendingRecipe(null);
                }}
              >
                <X size={14} />
              </button>
            </output>
          )}
          {warnings.length > 0 && (
            <div className="warning-list" role="alert">
              <strong>
                {warnings.length} file notice{warnings.length === 1 ? '' : 's'}
              </strong>
              <ul>
                {warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </div>
          )}
          {results.length > 0 && (
            <section className="results-section" aria-label="Processed images">
              <div className="section-heading">
                <h2>
                  <Check size={17} />
                  Your outputs <span className="count">{successes.length}</span>
                </h2>
                <Button
                  className="download-button"
                  disabled={locked || !successes.length}
                  onClick={() => void downloadZip()}
                >
                  {zipping ? (
                    <LoaderCircle className="spin" size={15} />
                  ) : (
                    <Download size={15} />
                  )}
                  Download ZIP
                </Button>
              </div>
              {successes.length > 0 && (
                <div className="output-summary">
                  <span>
                    {formatBytes(completedInputBytes)}
                    <ChevronRight size={13} />
                    <strong>{formatBytes(outputBytes)}</strong>
                  </span>
                  <span className={savings >= 0 ? 'savings' : 'size-increase'}>
                    {Math.abs(savings)}% {savings >= 0 ? 'smaller' : 'larger'}
                  </span>
                </div>
              )}
              <div className="result-list">
                {results.map((r) => (
                  <div
                    className={`result-row ${r.error ? 'has-error' : ''}`}
                    key={r.id}
                  >
                    {r.url ? (
                      <img src={r.url} alt="" />
                    ) : (
                      <FileImage size={25} />
                    )}
                    <div>
                      <strong title={r.output?.name ?? r.input.file.name}>
                        {r.output?.name ?? r.input.file.name}
                      </strong>
                      <small>
                        {r.error ??
                          `${r.output!.width} × ${r.output!.height} · ${formatBytes(r.output!.blob.size)}`}
                      </small>
                    </div>
                    {r.output && (
                      <button
                        className="icon-button"
                        aria-label={`Download ${r.output.name}`}
                        onClick={() =>
                          downloadBlob(r.output!.blob, r.output!.name)
                        }
                      >
                        <Download size={17} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}
        </main>
        <aside className="inspector-panel" aria-label="Step settings">
          <div className="panel-heading">
            <h2>Step settings</h2>
            <SlidersHorizontal size={16} />
          </div>
          {activeStep ? (
            <div className="inspector-content">
              <span className={`step-icon ${STEP_INFO[activeStep.type].color}`}>
                <ActiveIcon size={24} />
              </span>
              <div className="inspector-title">
                <h3>{STEP_INFO[activeStep.type].title}</h3>
                <button
                  className="icon-button"
                  disabled={locked}
                  aria-label={`Delete ${STEP_INFO[activeStep.type].title} step`}
                  onClick={() => {
                    setRecipe((r) => ({
                      ...r,
                      steps: r.steps.filter((s) => s.id !== activeStep.id),
                    }));
                  }}
                >
                  <Trash2 size={16} />
                </button>
              </div>
              <p>{STEP_INFO[activeStep.type].description}</p>
              <fieldset className="settings-fields" disabled={locked}>
                <StepSettings
                  key={activeStep.id}
                  step={activeStep}
                  update={(patch) => updateStep(activeStep.id, patch)}
                />
              </fieldset>
              {!activeStep.enabled && (
                <p className="disabled-hint">
                  This step is turned off. Enable it in your workflow to apply
                  it.
                </p>
              )}
              <div className="tip">
                <Sparkles size={16} />
                <p>
                  {activeStep.type === 'resize'
                    ? 'Smaller dimensions usually make the biggest difference to file size.'
                    : 'The preview updates as you edit. Try different settings before processing the batch.'}
                </p>
              </div>
            </div>
          ) : (
            <div className="inspector-empty">
              <SlidersHorizontal size={24} />
              <p>Add a step to configure your workflow.</p>
              <Button
                variant="outline"
                disabled={locked}
                onClick={() => setDialog('add')}
              >
                <Plus size={15} />
                Add a step
              </Button>
            </div>
          )}
          <div className="output-note">
            <LockKeyhole size={15} />
            <p>
              Exports are newly encoded images. Source EXIF and GPS tags are not
              copied.
            </p>
          </div>
        </aside>
      </div>
      <footer className="app-footer">
        <span>
          <LockKeyhole size={14} />
          No uploads. No accounts. Just flow.
        </span>
        <button className="footer-link" onClick={() => setDialog('help')}>
          Supported formats & limits
          <ChevronRight size={13} />
        </button>
      </footer>
      <Dialog
        open={dialog !== null}
        onOpenChange={(open) => {
          if (!open) setDialog(null);
        }}
      >
        <DialogContent className="lf-dialog">
          <DialogHeader>
            <DialogTitle>
              {dialog === 'add'
                ? 'Add a step'
                : dialog === 'save'
                  ? 'Save your recipe'
                  : dialog === 'share'
                    ? 'Share the workflow'
                    : 'Meet LocalFlow'}
            </DialogTitle>
            <DialogDescription>
              {dialog === 'add'
                ? 'One set of instructions. Every image in your batch.'
                : dialog === 'save'
                  ? 'Keep one favorite recipe on this device, or export it as a file.'
                  : dialog === 'share'
                    ? 'The link contains your recipe settings. Your images are never included.'
                    : 'A small workspace for doing more with your images, right on your device.'}
            </DialogDescription>
          </DialogHeader>
          {dialog === 'add' && (
            <div className="step-catalog">
              {(Object.keys(STEP_INFO) as StepType[]).map((type) => {
                const Icon = ICONS[type];
                const exists = recipe.steps.some((s) => s.type === type);
                return (
                  <button
                    key={type}
                    disabled={exists || locked}
                    onClick={() => addStep(type)}
                  >
                    <span className={`step-icon ${STEP_INFO[type].color}`}>
                      <Icon size={20} />
                    </span>
                    <span>
                      <strong>{STEP_INFO[type].title}</strong>
                      <small>
                        {exists
                          ? 'Already in your workflow'
                          : STEP_INFO[type].description}
                      </small>
                    </span>
                    {exists ? <Check size={15} /> : <Plus size={15} />}
                  </button>
                );
              })}
            </div>
          )}
          {dialog === 'save' && (
            <div className="dialog-body">
              <label className="field" htmlFor="recipe-name">
                <span className="field-label">Recipe name</span>
                <Input
                  id="recipe-name"
                  className="field-input"
                  value={savedName}
                  maxLength={60}
                  onChange={(e) => setSavedName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && savedName.trim()) saveRecipe();
                  }}
                />
              </label>
              {savedRecipe && (
                <p className="field-help">
                  Saving replaces your device favorite “{savedRecipe.name}”. You
                  can export it first from the recipe menu.
                </p>
              )}
              <div className="dialog-actions">
                <Button variant="outline" onClick={exportRecipe}>
                  <FileJson size={15} />
                  Export JSON
                </Button>
                <Button
                  className="primary-button"
                  disabled={!savedName.trim()}
                  onClick={saveRecipe}
                >
                  <Save size={15} />
                  Save on device
                </Button>
              </div>
            </div>
          )}
          {dialog === 'share' && (
            <div className="dialog-body">
              <label className="field" htmlFor="recipe-link">
                <span className="field-label">Recipe link</span>
                <Input
                  id="recipe-link"
                  className="field-input share-input"
                  readOnly
                  value={shareUrl}
                  onFocus={(e) => e.target.select()}
                />
              </label>
              <p className="field-help">
                Recipients need access to this app address. A localhost link
                only works on the same computer.
              </p>
              <div className="dialog-actions">
                <Button variant="outline" onClick={exportRecipe}>
                  <FileJson size={15} />
                  Export JSON
                </Button>
                <Button
                  className="primary-button"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(shareUrl);
                      setCopied(true);
                    } catch {
                      setNotice(
                        'Clipboard unavailable. Select and copy the recipe link manually.',
                      );
                    }
                  }}
                >
                  {copied ? <Check size={15} /> : <Link2 size={15} />}{' '}
                  {copied ? 'Copied' : 'Copy link'}
                </Button>
              </div>
            </div>
          )}
          {dialog === 'help' && (
            <div className="help-content">
              <div>
                <strong>Six steps, one batch</strong>
                <p>
                  Resize, crop, rotate, flip, convert, and rename. Image
                  operations follow your chosen order. Output format, quality,
                  and naming apply once, at export.
                </p>
              </div>
              <div>
                <strong>Still images only</strong>
                <p>
                  PNG, JPEG, and WebP. Up to 100 files and 200 MB per batch; 32
                  MB per file. Maximum 8,192 pixels per side and 24 megapixels.
                  Animated PNG and WebP are rejected.
                </p>
              </div>
              <div>
                <strong>Your device does the work</strong>
                <p>
                  No image uploads, analytics, or AI services. Processing and
                  downloads work without a network connection after the app has
                  loaded. Images are kept in memory and disappear when you close
                  this page.
                </p>
              </div>
              <div>
                <strong>About exported images</strong>
                <p>
                  Original EXIF and GPS tags are not copied. Color profiles may
                  change during browser decoding and encoding; this tool does
                  not preserve professional print metadata. JPEG fills
                  transparent areas with your selected background. File size
                  savings vary by image.
                </p>
              </div>
              <div>
                <strong>Reusable recipes</strong>
                <p>
                  Your last valid workflow is restored on this device. Save a
                  favorite, import or export JSON, or share a link containing
                  only your settings. Reloading does not restore your image
                  files.
                </p>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
