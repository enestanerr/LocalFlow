'use client';
import { useEffect, useState } from 'react';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import type { Step } from '@/lib/recipe';

export function Choice({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <div className="field">
      <span className="field-label">{label}</span>
      <Select
        value={value}
        onValueChange={(v) => {
          if (v !== null) onChange(String(v));
        }}
      >
        <SelectTrigger aria-label={label} className="field-select">
          <SelectValue>
            {options.find((o) => o.value === value)?.label ?? value}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function NumberField({
  label,
  value,
  min = 1,
  max = 8192,
  onChange,
}: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  onChange: (n: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));
  // oxlint-disable-next-line react/react-compiler -- An imported recipe can replace an in-progress numeric draft.
  useEffect(() => setDraft(String(value)), [value]);
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      <Input
        type="number"
        min={min}
        max={max}
        step={1}
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value);
          const n = Number(e.target.value);
          if (
            e.target.value !== '' &&
            Number.isInteger(n) &&
            n >= min &&
            n <= max
          )
            onChange(n);
        }}
        onBlur={() => {
          const n = Number(draft);
          const next =
            draft !== '' && Number.isFinite(n)
              ? Math.min(max, Math.max(min, Math.round(n)))
              : value;
          setDraft(String(next));
          onChange(next);
        }}
        className="field-input"
      />
    </label>
  );
}

export default function StepSettings({
  step,
  update,
}: {
  step: Step;
  update: (patch: Record<string, unknown>) => void;
}) {
  switch (step.type) {
    case 'resize':
      return (
        <>
          <div className="two-fields">
            <NumberField
              label="Max width (px)"
              value={step.width}
              onChange={(width) => update({ width })}
            />
            <NumberField
              label="Max height (px)"
              value={step.height}
              onChange={(height) => update({ height })}
            />
          </div>
          <p className="field-help">
            Fits inside this box. Aspect ratio is preserved.
          </p>
          <label className="switch-field" htmlFor="allow-upscaling">
            <span>Allow upscaling</span>
            <Switch
              id="allow-upscaling"
              checked={step.enlarge}
              onCheckedChange={(enlarge) => update({ enlarge })}
              aria-label="Allow upscaling"
            />
          </label>
          <p className="field-help">
            Leave off to keep smaller images at their original size.
          </p>
        </>
      );
    case 'crop':
      return (
        <>
          <Choice
            label="Aspect ratio"
            value={step.ratio}
            options={['1:1', '4:3', '3:2', '16:9', '9:16'].map((value) => ({
              value,
              label: value === '1:1' ? '1:1 · Square' : value,
            }))}
            onChange={(ratio) => update({ ratio })}
          />
          <Choice
            label="Keep this area"
            value={step.anchor}
            options={['center', 'top', 'bottom', 'left', 'right'].map(
              (value) => ({
                value,
                label: value[0].toUpperCase() + value.slice(1),
              }),
            )}
            onChange={(anchor) => update({ anchor })}
          />
          <p className="field-help">Crops the result of the preceding step.</p>
        </>
      );
    case 'rotate':
      return (
        <Choice
          label="Clockwise rotation"
          value={String(step.degrees)}
          options={[90, 180, 270].map((n) => ({
            value: String(n),
            label: `${n}° clockwise`,
          }))}
          onChange={(v) => update({ degrees: Number(v) })}
        />
      );
    case 'flip':
      return (
        <Choice
          label="Mirror direction"
          value={step.axis}
          options={[
            { value: 'horizontal', label: 'Horizontal · left ↔ right' },
            { value: 'vertical', label: 'Vertical · top ↔ bottom' },
          ]}
          onChange={(axis) => update({ axis })}
        />
      );
    case 'format':
      return (
        <>
          <Choice
            label="Output format"
            value={step.format}
            options={[
              { value: 'webp', label: 'WebP · smaller web images' },
              { value: 'jpeg', label: 'JPEG · photos' },
              { value: 'png', label: 'PNG · lossless' },
            ]}
            onChange={(format) => update({ format })}
          />
          <div
            className={`field quality-field ${step.format === 'png' ? 'muted-control' : ''}`}
          >
            <div className="field-label-row">
              <span className="field-label">Quality</span>
              <strong>
                {step.format === 'png' ? 'Lossless' : `${step.quality}%`}
              </strong>
            </div>
            <Slider
              value={[step.quality]}
              min={1}
              max={100}
              step={1}
              disabled={step.format === 'png'}
              onValueChange={(v) =>
                update({ quality: Array.isArray(v) ? v[0] : v })
              }
              aria-label="Image quality"
            />
            <div className="range-labels">
              <span>Smaller file</span>
              <span>More detail</span>
            </div>
          </div>
          {step.format === 'png' ? (
            <p className="field-help">
              PNG is lossless. The quality slider does not apply.
            </p>
          ) : (
            <p className="field-help">
              Size savings depend on the image. Preview shows the actual encoded
              result.
            </p>
          )}
          {step.format === 'jpeg' && (
            <label className="field">
              <span className="field-label">Transparency background</span>
              <div className="color-control">
                <input
                  aria-label="JPEG background color"
                  type="color"
                  value={step.background}
                  onChange={(e) => update({ background: e.target.value })}
                />
                <span>{step.background.toUpperCase()}</span>
              </div>
            </label>
          )}
          <p className="field-help export-note">
            Format and quality apply once, at export.
          </p>
        </>
      );
    case 'rename':
      return (
        <>
          <label className="field" htmlFor="filename-pattern">
            <span className="field-label">Filename pattern</span>
            <Input
              id="filename-pattern"
              className="field-input mono"
              maxLength={100}
              value={step.template}
              onChange={(e) => update({ template: e.target.value })}
              placeholder="{name}-{n}"
            />
          </label>
          <div className="token-list">
            {['{name}', '{n}', '{width}', '{height}'].map((token) => (
              <button
                key={token}
                onClick={() =>
                  update({ template: (step.template + token).slice(0, 100) })
                }
              >
                {token}
              </button>
            ))}
          </div>
          <p className="field-help">
            Original name, sequence number, output width, and output height. The
            file extension is added for you.
          </p>
          <NumberField
            label="Start numbering at"
            value={step.start}
            min={0}
            max={99999}
            onChange={(start) => update({ start })}
          />
          <p className="field-help export-note">
            Names apply at export. Duplicates receive a numeric suffix.
          </p>
        </>
      );
  }
}
