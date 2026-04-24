import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, Eye, EyeOff, Plus, Trash2, X } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { Paint } from '../types';

type ColorModel = 'hex' | 'rgb' | 'hsl' | 'hsv';

interface RGBA {
  r: number;
  g: number;
  b: number;
  a: number;
}

interface HSVA {
  h: number;
  s: number;
  v: number;
  a: number;
}

interface HSLA {
  h: number;
  s: number;
  l: number;
  a: number;
}

interface FillEditorDialogProps {
  isOpen: boolean;
  fills: Paint[];
  initialFillIndex?: number;
  onChange: (fills: Paint[]) => void;
  onClose: () => void;
}

interface ColorPickerDialogProps {
  isOpen: boolean;
  title?: string;
  color: string;
  onChange: (value: string) => void;
  onClose: () => void;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const toHex = (value: number) => clamp(Math.round(value), 0, 255).toString(16).padStart(2, '0').toUpperCase();

const parseHexColor = (value: string): RGBA | null => {
  const raw = value.trim().replace('#', '');
  if (![3, 4, 6, 8].includes(raw.length)) return null;

  if (raw.length === 3 || raw.length === 4) {
    const r = parseInt(raw[0] + raw[0], 16);
    const g = parseInt(raw[1] + raw[1], 16);
    const b = parseInt(raw[2] + raw[2], 16);
    const a = raw.length === 4 ? parseInt(raw[3] + raw[3], 16) / 255 : 1;
    return { r, g, b, a };
  }

  const r = parseInt(raw.slice(0, 2), 16);
  const g = parseInt(raw.slice(2, 4), 16);
  const b = parseInt(raw.slice(4, 6), 16);
  const a = raw.length === 8 ? parseInt(raw.slice(6, 8), 16) / 255 : 1;
  return { r, g, b, a };
};

const parseRgbColor = (value: string): RGBA | null => {
  const match = value
    .replace(/\s+/g, '')
    .match(/^rgba?\(([-\d.]+),([-\d.]+),([-\d.]+)(?:,([-\d.]+))?\)$/i);
  if (!match) return null;

  return {
    r: clamp(Number(match[1]), 0, 255),
    g: clamp(Number(match[2]), 0, 255),
    b: clamp(Number(match[3]), 0, 255),
    a: match[4] !== undefined ? clamp(Number(match[4]), 0, 1) : 1,
  };
};

const parseColor = (value: string): RGBA => {
  return parseHexColor(value) || parseRgbColor(value) || { r: 217, g: 217, b: 217, a: 1 };
};

const rgbaToHex = (rgba: RGBA): string => {
  const alpha = clamp(rgba.a, 0, 1);
  const hasAlpha = alpha < 0.999;
  const base = `#${toHex(rgba.r)}${toHex(rgba.g)}${toHex(rgba.b)}`;
  if (!hasAlpha) return base;
  return `${base}${toHex(alpha * 255)}`;
};

const rgbaToCss = (rgba: RGBA): string => {
  const alpha = clamp(rgba.a, 0, 1);
  if (alpha >= 0.999) {
    return `rgb(${Math.round(rgba.r)} ${Math.round(rgba.g)} ${Math.round(rgba.b)})`;
  }
  return `rgb(${Math.round(rgba.r)} ${Math.round(rgba.g)} ${Math.round(rgba.b)} / ${alpha.toFixed(3)})`;
};

const rgbToHsv = ({ r, g, b, a }: RGBA): HSVA => {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const d = max - min;

  let h = 0;
  if (d !== 0) {
    if (max === rn) h = ((gn - bn) / d) % 6;
    else if (max === gn) h = (bn - rn) / d + 2;
    else h = (rn - gn) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }

  const s = max === 0 ? 0 : d / max;
  return { h, s, v: max, a };
};

const hsvToRgb = ({ h, s, v, a }: HSVA): RGBA => {
  const safeH = ((h % 360) + 360) % 360;
  const c = v * s;
  const x = c * (1 - Math.abs(((safeH / 60) % 2) - 1));
  const m = v - c;

  let rp = 0;
  let gp = 0;
  let bp = 0;

  if (safeH < 60) {
    rp = c;
    gp = x;
  } else if (safeH < 120) {
    rp = x;
    gp = c;
  } else if (safeH < 180) {
    gp = c;
    bp = x;
  } else if (safeH < 240) {
    gp = x;
    bp = c;
  } else if (safeH < 300) {
    rp = x;
    bp = c;
  } else {
    rp = c;
    bp = x;
  }

  return {
    r: Math.round((rp + m) * 255),
    g: Math.round((gp + m) * 255),
    b: Math.round((bp + m) * 255),
    a: clamp(a, 0, 1),
  };
};

const rgbToHsl = ({ r, g, b, a }: RGBA): HSLA => {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const d = max - min;
  const l = (max + min) / 2;

  let h = 0;
  let s = 0;

  if (d !== 0) {
    s = d / (1 - Math.abs(2 * l - 1));
    if (max === rn) h = ((gn - bn) / d) % 6;
    else if (max === gn) h = (bn - rn) / d + 2;
    else h = (rn - gn) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }

  return { h, s, l, a };
};

const hslToRgb = ({ h, s, l, a }: HSLA): RGBA => {
  const safeH = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((safeH / 60) % 2) - 1));
  const m = l - c / 2;

  let rp = 0;
  let gp = 0;
  let bp = 0;

  if (safeH < 60) {
    rp = c;
    gp = x;
  } else if (safeH < 120) {
    rp = x;
    gp = c;
  } else if (safeH < 180) {
    gp = c;
    bp = x;
  } else if (safeH < 240) {
    gp = x;
    bp = c;
  } else if (safeH < 300) {
    rp = x;
    bp = c;
  } else {
    rp = c;
    bp = x;
  }

  return {
    r: Math.round((rp + m) * 255),
    g: Math.round((gp + m) * 255),
    b: Math.round((bp + m) * 255),
    a: clamp(a, 0, 1),
  };
};

const parseGradientStopOffset = (token: string): number | null => {
  const percentMatch = token.match(/([-\d.]+)%/);
  if (percentMatch) {
    return clamp(Number(percentMatch[1]) / 100, 0, 1);
  }

  const numericMatch = token.match(/([-\d.]+)$/);
  if (numericMatch) {
    return clamp(Number(numericMatch[1]), 0, 1);
  }
  return null;
};

const paintPreview = (paint: Paint): string => {
  if (paint.type === 'solid') {
    const color = paint.color || '#D9D9D9';
    return `linear-gradient(135deg, ${color} 0%, ${color} 100%)`;
  }

  const stops = paint.gradientStops || [];
  const gradientStops =
    stops.length > 0
      ? stops
          .map((stop) => {
            const offset = `${Math.round(clamp(stop.offset, 0, 1) * 100)}%`;
            return `${stop.color} ${offset}`;
          })
          .join(', ')
      : '#FFFFFF 0%, #000000 100%';

  if (paint.type === 'gradient-radial') {
    const center = paint.gradientCenter || { x: 0.5, y: 0.5 };
    const radius = clamp(paint.gradientRadius ?? 0.5, 0.05, 1);
    return `radial-gradient(circle ${Math.round(radius * 100)}% at ${Math.round(center.x * 100)}% ${Math.round(center.y * 100)}%, ${gradientStops})`;
  }

  const angle = Number.isFinite(paint.gradientAngle) ? paint.gradientAngle : 90;
  return `linear-gradient(${angle}deg, ${gradientStops})`;
};

const createDefaultPaint = (type: Paint['type']): Paint => {
  if (type === 'solid') {
    return {
      id: uuidv4(),
      type,
      color: '#D9D9D9',
      opacity: 1,
      visible: true,
    };
  }

  if (type === 'gradient-radial') {
    return {
      id: uuidv4(),
      type,
      gradientStops: [
        { offset: 0, color: '#FFFFFF' },
        { offset: 1, color: '#000000' },
      ],
      gradientCenter: { x: 0.5, y: 0.5 },
      gradientRadius: 0.5,
      opacity: 1,
      visible: true,
    };
  }

  return {
    id: uuidv4(),
    type,
    gradientStops: [
      { offset: 0, color: '#FFFFFF' },
      { offset: 1, color: '#000000' },
    ],
    gradientAngle: 90,
    opacity: 1,
    visible: true,
  };
};

const normalizePaint = (paint: Paint): Paint => {
  if (paint.type === 'solid') {
    return {
      ...paint,
      color: paint.color || '#D9D9D9',
      opacity: clamp(paint.opacity ?? 1, 0, 1),
      visible: paint.visible !== false,
    };
  }

  const stops = (paint.gradientStops || [
    { offset: 0, color: '#FFFFFF' },
    { offset: 1, color: '#000000' },
  ]).map((stop) => ({
    offset: clamp(stop.offset, 0, 1),
    color: stop.color || '#FFFFFF',
  }));

  return {
    ...paint,
    gradientStops: stops,
    gradientAngle: Number.isFinite(paint.gradientAngle) ? paint.gradientAngle : 90,
    gradientCenter: {
      x: clamp(paint.gradientCenter?.x ?? 0.5, 0, 1),
      y: clamp(paint.gradientCenter?.y ?? 0.5, 0, 1),
    },
    gradientRadius: clamp(paint.gradientRadius ?? 0.5, 0.05, 1),
    opacity: clamp(paint.opacity ?? 1, 0, 1),
    visible: paint.visible !== false,
  };
};

export const AdvancedColorPicker = ({ color, onChange }: { color: string; onChange: (value: string) => void }) => {
  const [model, setModel] = useState<ColorModel>('hex');
  const [hsva, setHsva] = useState<HSVA>(() => rgbToHsv(parseColor(color)));
  const [hexInput, setHexInput] = useState('');

  const svRef = useRef<HTMLDivElement>(null);
  const [isDraggingSV, setIsDraggingSV] = useState(false);

  useEffect(() => {
    const parsed = parseColor(color);
    const nextHsva = rgbToHsv(parsed);
    setHsva(nextHsva);
    setHexInput(rgbaToHex(parsed).replace('#', ''));
  }, [color]);

  useEffect(() => {
    if (!isDraggingSV) return;

    const onMouseMove = (event: MouseEvent) => {
      const element = svRef.current;
      if (!element) return;
      const rect = element.getBoundingClientRect();
      const x = clamp((event.clientX - rect.left) / rect.width, 0, 1);
      const y = clamp((event.clientY - rect.top) / rect.height, 0, 1);
      const next = { ...hsva, s: x, v: 1 - y };
      setHsva(next);
      onChange(rgbaToHex(hsvToRgb(next)));
    };

    const onMouseUp = () => setIsDraggingSV(false);

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [hsva, isDraggingSV, onChange]);

  const hueColor = useMemo(() => {
    const hueOnly: HSVA = { h: hsva.h, s: 1, v: 1, a: 1 };
    return rgbaToHex(hsvToRgb(hueOnly));
  }, [hsva.h]);

  const rgb = useMemo(() => hsvToRgb(hsva), [hsva]);
  const hsl = useMemo(() => rgbToHsl(rgb), [rgb]);
  const hexValue = useMemo(() => rgbaToHex(rgb), [rgb]);

  const commitHsva = (next: HSVA) => {
    const normalized = {
      h: ((next.h % 360) + 360) % 360,
      s: clamp(next.s, 0, 1),
      v: clamp(next.v, 0, 1),
      a: clamp(next.a, 0, 1),
    };
    setHsva(normalized);
    onChange(rgbaToHex(hsvToRgb(normalized)));
  };

  const onHexCommit = (value: string) => {
    const parsed = parseHexColor(`#${value}`);
    setHexInput(value.toUpperCase());
    if (!parsed) return;
    const nextHsva = rgbToHsv(parsed);
    setHsva(nextHsva);
    onChange(rgbaToHex(parsed));
  };

  return (
    <div className="space-y-3">
      <div className="relative">
        <div
          ref={svRef}
          onMouseDown={(event) => {
            event.preventDefault();
            const element = svRef.current;
            if (!element) return;
            const rect = element.getBoundingClientRect();
            const x = clamp((event.clientX - rect.left) / rect.width, 0, 1);
            const y = clamp((event.clientY - rect.top) / rect.height, 0, 1);
            const next = { ...hsva, s: x, v: 1 - y };
            setHsva(next);
            onChange(rgbaToHex(hsvToRgb(next)));
            setIsDraggingSV(true);
          }}
          className="relative h-44 rounded-md overflow-hidden border border-[#2A2A2A] cursor-crosshair"
          style={{ backgroundColor: hueColor }}
        >
          <div className="absolute inset-0" style={{ background: 'linear-gradient(to right, #FFFFFF, transparent)' }} />
          <div className="absolute inset-0" style={{ background: 'linear-gradient(to top, #000000, transparent)' }} />
          <div
            className="absolute w-4 h-4 rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.55)]"
            style={{
              left: `calc(${hsva.s * 100}% - 8px)`,
              top: `calc(${(1 - hsva.v) * 100}% - 8px)`,
            }}
          />
        </div>
      </div>

      <div className="space-y-2">
        <div className="space-y-1">
          <div className="text-[10px] uppercase tracking-widest text-[#666] font-bold">Hue</div>
          <input
            type="range"
            min={0}
            max={360}
            value={Math.round(hsva.h)}
            onChange={(event) => commitHsva({ ...hsva, h: Number(event.target.value) })}
            className="w-full h-2 rounded-lg appearance-none cursor-pointer"
            style={{
              background:
                'linear-gradient(90deg, #FF0000 0%, #FFFF00 17%, #00FF00 33%, #00FFFF 50%, #0000FF 67%, #FF00FF 83%, #FF0000 100%)',
            }}
          />
        </div>

        <div className="space-y-1">
          <div className="text-[10px] uppercase tracking-widest text-[#666] font-bold">Alpha</div>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={hsva.a}
            onChange={(event) => commitHsva({ ...hsva, a: Number(event.target.value) })}
            className="w-full h-2 rounded-lg appearance-none cursor-pointer"
            style={{
              background: `linear-gradient(90deg, transparent 0%, ${rgbaToCss({ ...rgb, a: 1 })} 100%)`,
            }}
          />
        </div>
      </div>

      <div className="flex gap-1 bg-[#171717] rounded-md p-1">
        {(['hex', 'rgb', 'hsl', 'hsv'] as ColorModel[]).map((entry) => (
          <button
            key={entry}
            onClick={() => setModel(entry)}
            className={`flex-1 h-7 text-[10px] uppercase tracking-wider rounded-sm transition-colors ${
              model === entry ? 'bg-[#2A2A2A] text-[#F5F5F5]' : 'text-[#777] hover:text-[#CCC]'
            }`}
          >
            {entry}
          </button>
        ))}
      </div>

      {model === 'hex' && (
        <div className="grid grid-cols-[1fr_80px] gap-2">
          <div className="h-8 rounded-sm border border-[#2A2A2A] bg-[#131313] px-2 flex items-center">
            <span className="text-[11px] text-[#666] mr-1">#</span>
            <input
              value={hexInput || hexValue.replace('#', '')}
              onChange={(event) => {
                const next = event.target.value.replace(/[^0-9a-fA-F]/g, '').slice(0, 8).toUpperCase();
                setHexInput(next);
              }}
              onBlur={() => onHexCommit(hexInput || hexValue.replace('#', ''))}
              className="w-full bg-transparent outline-none text-[11px] text-[#ECECEC] font-mono"
            />
          </div>
          <div className="h-8 rounded-sm border border-[#2A2A2A] bg-[#131313] px-2 flex items-center gap-1">
            <span className="text-[11px] text-[#666]">A</span>
            <input
              value={Math.round(hsva.a * 100)}
              onChange={(event) => {
                const alpha = clamp((parseInt(event.target.value, 10) || 0) / 100, 0, 1);
                commitHsva({ ...hsva, a: alpha });
              }}
              className="w-full bg-transparent outline-none text-[11px] text-[#ECECEC] font-mono"
            />
          </div>
        </div>
      )}

      {model === 'rgb' && (
        <div className="grid grid-cols-4 gap-2">
          {[
            { label: 'R', value: Math.round(rgb.r), max: 255, key: 'r' as const },
            { label: 'G', value: Math.round(rgb.g), max: 255, key: 'g' as const },
            { label: 'B', value: Math.round(rgb.b), max: 255, key: 'b' as const },
            { label: 'A', value: Math.round(rgb.a * 100), max: 100, key: 'a' as const },
          ].map((field) => (
            <div key={field.label} className="h-8 rounded-sm border border-[#2A2A2A] bg-[#131313] px-2 flex items-center gap-1">
              <span className="text-[10px] text-[#666]">{field.label}</span>
              <input
                value={field.value}
                onChange={(event) => {
                  const nextValue = clamp(parseInt(event.target.value, 10) || 0, 0, field.max);
                  if (field.key === 'a') {
                    commitHsva({ ...hsva, a: nextValue / 100 });
                    return;
                  }
                  const nextRgb = { ...rgb, [field.key]: nextValue } as RGBA;
                  commitHsva(rgbToHsv(nextRgb));
                }}
                className="w-full bg-transparent outline-none text-[11px] text-[#ECECEC] font-mono"
              />
            </div>
          ))}
        </div>
      )}

      {model === 'hsl' && (
        <div className="grid grid-cols-4 gap-2">
          {[
            { label: 'H', value: Math.round(hsl.h), max: 360, key: 'h' as const },
            { label: 'S', value: Math.round(hsl.s * 100), max: 100, key: 's' as const },
            { label: 'L', value: Math.round(hsl.l * 100), max: 100, key: 'l' as const },
            { label: 'A', value: Math.round(hsl.a * 100), max: 100, key: 'a' as const },
          ].map((field) => (
            <div key={field.label} className="h-8 rounded-sm border border-[#2A2A2A] bg-[#131313] px-2 flex items-center gap-1">
              <span className="text-[10px] text-[#666]">{field.label}</span>
              <input
                value={field.value}
                onChange={(event) => {
                  const nextValue = clamp(parseInt(event.target.value, 10) || 0, 0, field.max);
                  const nextHsl: HSLA = {
                    ...hsl,
                    [field.key]: field.key === 'h' ? nextValue : nextValue / 100,
                  } as HSLA;
                  commitHsva(rgbToHsv(hslToRgb(nextHsl)));
                }}
                className="w-full bg-transparent outline-none text-[11px] text-[#ECECEC] font-mono"
              />
            </div>
          ))}
        </div>
      )}

      {model === 'hsv' && (
        <div className="grid grid-cols-4 gap-2">
          {[
            { label: 'H', value: Math.round(hsva.h), max: 360, key: 'h' as const },
            { label: 'S', value: Math.round(hsva.s * 100), max: 100, key: 's' as const },
            { label: 'V', value: Math.round(hsva.v * 100), max: 100, key: 'v' as const },
            { label: 'A', value: Math.round(hsva.a * 100), max: 100, key: 'a' as const },
          ].map((field) => (
            <div key={field.label} className="h-8 rounded-sm border border-[#2A2A2A] bg-[#131313] px-2 flex items-center gap-1">
              <span className="text-[10px] text-[#666]">{field.label}</span>
              <input
                value={field.value}
                onChange={(event) => {
                  const nextValue = clamp(parseInt(event.target.value, 10) || 0, 0, field.max);
                  const next = {
                    ...hsva,
                    [field.key]: field.key === 'h' ? nextValue : nextValue / 100,
                  } as HSVA;
                  commitHsva(next);
                }}
                className="w-full bg-transparent outline-none text-[11px] text-[#ECECEC] font-mono"
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export const ColorPickerDialog = ({ isOpen, title = 'Color Picker', color, onChange, onClose }: ColorPickerDialogProps) => {
  const dialogRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [positionReady, setPositionReady] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const dragOffsetRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    if (!isOpen || positionReady) return;
    const defaultX = Math.max(12, window.innerWidth - 372);
    const defaultY = 72;
    setPosition({ x: defaultX, y: defaultY });
    setPositionReady(true);
  }, [isOpen, positionReady]);

  useEffect(() => {
    if (!isOpen) return;
    const onMouseDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (dialogRef.current && !dialogRef.current.contains(target)) {
        onClose();
      }
    };
    window.addEventListener('mousedown', onMouseDown);
    return () => window.removeEventListener('mousedown', onMouseDown);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!isDragging) return;
    const onMouseMove = (event: MouseEvent) => {
      const nextX = Math.max(8, event.clientX - dragOffsetRef.current.x);
      const nextY = Math.max(8, event.clientY - dragOffsetRef.current.y);
      setPosition({ x: nextX, y: nextY });
    };
    const onMouseUp = () => setIsDragging(false);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [isDragging]);

  if (!isOpen) return null;

  return (
    <div className="fixed z-[1300]" style={{ left: `${position.x}px`, top: `${position.y}px` }}>
      <div ref={dialogRef} className="w-[360px] max-w-[calc(100vw-1rem)] bg-[#111111] border border-[#2A2A2A] rounded-xl overflow-hidden shadow-[0_24px_80px_rgba(0,0,0,0.55)]">
        <div
          className="h-10 px-3 border-b border-[#2A2A2A] bg-[#151515] flex items-center justify-between cursor-move select-none"
          onMouseDown={(event) => {
            const rect = dialogRef.current?.getBoundingClientRect();
            if (!rect) return;
            dragOffsetRef.current = { x: event.clientX - rect.left, y: event.clientY - rect.top };
            setIsDragging(true);
          }}
        >
          <div className="text-[11px] text-[#EDEDED] font-semibold">{title}</div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-md text-[#888] hover:text-white hover:bg-[#232323] transition-colors flex items-center justify-center"
          >
            <X size={14} />
          </button>
        </div>
        <div className="p-3">
          <AdvancedColorPicker color={color} onChange={onChange} />
        </div>
      </div>
    </div>
  );
};

export const FillEditorDialog = ({ isOpen, fills, initialFillIndex = 0, onChange, onClose }: FillEditorDialogProps) => {
  const [localFills, setLocalFills] = useState<Paint[]>([]);
  const [selectedFillIndex, setSelectedFillIndex] = useState(0);
  const [selectedStopIndex, setSelectedStopIndex] = useState(0);
  const dialogRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [positionReady, setPositionReady] = useState(false);
  const [isDraggingDialog, setIsDraggingDialog] = useState(false);
  const dragOffsetRef = useRef({ x: 0, y: 0 });

  const gradientTrackRef = useRef<HTMLDivElement>(null);
  const [draggingStopIndex, setDraggingStopIndex] = useState<number | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const normalized = (fills.length > 0 ? fills : [createDefaultPaint('solid')]).map(normalizePaint);
    setLocalFills(normalized);
    setSelectedFillIndex(clamp(initialFillIndex, 0, Math.max(0, normalized.length - 1)));
    setSelectedStopIndex(0);
  }, [fills, initialFillIndex, isOpen]);

  useEffect(() => {
    if (!isOpen || positionReady) return;
    const defaultX = Math.max(16, window.innerWidth - 608);
    const defaultY = 56;
    setPosition({ x: defaultX, y: defaultY });
    setPositionReady(true);
  }, [isOpen, positionReady]);

  useEffect(() => {
    if (draggingStopIndex === null) return;

    const onMouseMove = (event: MouseEvent) => {
      const targetPaint = localFills[selectedFillIndex];
      if (!targetPaint || targetPaint.type === 'solid') return;
      const track = gradientTrackRef.current;
      if (!track) return;

      const rect = track.getBoundingClientRect();
      const nextOffset = clamp((event.clientX - rect.left) / rect.width, 0, 1);
      const nextFills = [...localFills];
      const editablePaint = nextFills[selectedFillIndex];
      if (!editablePaint || editablePaint.type === 'solid') return;
      const nextStops = [...(editablePaint.gradientStops || [])];
      if (!nextStops[draggingStopIndex]) return;
      nextStops[draggingStopIndex] = { ...nextStops[draggingStopIndex], offset: nextOffset };
      nextFills[selectedFillIndex] = { ...nextFills[selectedFillIndex], gradientStops: nextStops };
      setLocalFills(nextFills);
      onChange(nextFills);
    };

    const onMouseUp = () => setDraggingStopIndex(null);

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [draggingStopIndex, localFills, onChange, selectedFillIndex]);

  useEffect(() => {
    if (!isOpen) return;

    const onMouseDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (dialogRef.current && !dialogRef.current.contains(target)) {
        onClose();
      }
    };

    window.addEventListener('mousedown', onMouseDown);
    return () => window.removeEventListener('mousedown', onMouseDown);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!isDraggingDialog) return;
    const onMouseMove = (event: MouseEvent) => {
      const nextX = Math.max(8, event.clientX - dragOffsetRef.current.x);
      const nextY = Math.max(8, event.clientY - dragOffsetRef.current.y);
      setPosition({ x: nextX, y: nextY });
    };
    const onMouseUp = () => setIsDraggingDialog(false);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [isDraggingDialog]);

  const updateFills = (nextFills: Paint[], nextFillIndex = selectedFillIndex) => {
    const normalized = nextFills.map(normalizePaint);
    setLocalFills(normalized);
    setSelectedFillIndex(clamp(nextFillIndex, 0, Math.max(0, normalized.length - 1)));
    onChange(normalized);
  };

  const updateSelectedPaint = (patch: Partial<Paint>) => {
    const next = [...localFills];
    if (!next[selectedFillIndex]) return;
    next[selectedFillIndex] = normalizePaint({ ...next[selectedFillIndex], ...patch });
    updateFills(next);
  };

  const selectedPaint = localFills[selectedFillIndex];
  const selectedStops = selectedPaint && selectedPaint.type !== 'solid' ? selectedPaint.gradientStops || [] : [];
  const selectedStop = selectedStops[selectedStopIndex];

  const selectedColor = useMemo(() => {
    if (!selectedPaint) return '#D9D9D9';
    if (selectedPaint.type === 'solid') return selectedPaint.color || '#D9D9D9';
    return selectedStop?.color || selectedStops[0]?.color || '#D9D9D9';
  }, [selectedPaint, selectedStop, selectedStops]);

  if (!isOpen) return null;

  return (
    <div className="fixed z-[1200]" style={{ left: `${position.x}px`, top: `${position.y}px` }}>
      <div
        ref={dialogRef}
        className="w-[560px] max-w-[calc(100vw-1rem)] max-h-[82vh] bg-[#111111] border border-[#2A2A2A] rounded-xl overflow-hidden shadow-[0_24px_80px_rgba(0,0,0,0.55)] flex flex-col"
      >
        <div
          className="h-12 px-4 border-b border-[#2A2A2A] bg-[#151515] flex items-center justify-between cursor-move select-none"
          onMouseDown={(event) => {
            const rect = dialogRef.current?.getBoundingClientRect();
            if (!rect) return;
            dragOffsetRef.current = { x: event.clientX - rect.left, y: event.clientY - rect.top };
            setIsDraggingDialog(true);
          }}
        >
          <div>
            <div className="text-[10px] uppercase tracking-[0.14em] text-[#666] font-black">Fill Pop-up</div>
            <div className="text-[13px] text-[#EDEDED] font-semibold">Paint Editor</div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-md text-[#888] hover:text-white hover:bg-[#232323] transition-colors flex items-center justify-center"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 min-h-0 flex">
          <aside className="w-[220px] border-r border-[#2A2A2A] bg-[#131313] p-3 flex flex-col gap-3">
            <div className="grid grid-cols-3 gap-2">
              <button
                onClick={() => updateFills([...localFills, createDefaultPaint('solid')], localFills.length)}
                className="h-8 rounded-sm text-[10px] uppercase tracking-wider bg-[#1F1F1F] border border-[#2A2A2A] text-[#DDD] hover:border-[#3A3A3A]"
              >
                Solid
              </button>
              <button
                onClick={() => updateFills([...localFills, createDefaultPaint('gradient-linear')], localFills.length)}
                className="h-8 rounded-sm text-[10px] uppercase tracking-wider bg-[#1F1F1F] border border-[#2A2A2A] text-[#DDD] hover:border-[#3A3A3A]"
              >
                Linear
              </button>
              <button
                onClick={() => updateFills([...localFills, createDefaultPaint('gradient-radial')], localFills.length)}
                className="h-8 rounded-sm text-[10px] uppercase tracking-wider bg-[#1F1F1F] border border-[#2A2A2A] text-[#DDD] hover:border-[#3A3A3A]"
              >
                Radial
              </button>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto space-y-2 custom-scrollbar">
              {localFills.map((paint, index) => (
                <button
                  key={paint.id}
                  onClick={() => {
                    setSelectedFillIndex(index);
                    setSelectedStopIndex(0);
                  }}
                  className={`w-full text-left p-2 rounded-md border transition-colors ${
                    selectedFillIndex === index
                      ? 'border-indigo-500/60 bg-indigo-500/10'
                      : 'border-[#2A2A2A] bg-[#181818] hover:border-[#3A3A3A]'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <div
                        className="w-10 h-10 shrink-0 rounded-sm border border-[#2A2A2A]"
                      style={{ background: paintPreview(paint) }}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-[11px] text-[#ECECEC] font-semibold truncate">
                        {paint.type === 'solid' ? 'Solid Fill' : paint.type === 'gradient-linear' ? 'Linear Gradient' : 'Radial Gradient'}
                      </div>
                      <div className="text-[10px] text-[#777] font-mono">Opacity {Math.round((paint.opacity ?? 1) * 100)}%</div>
                    </div>
                    <div className="flex flex-col gap-1">
                      <button
                        onClick={(event) => {
                          event.stopPropagation();
                          const next = [...localFills];
                          next[index] = { ...next[index], visible: !next[index].visible };
                          updateFills(next);
                        }}
                        className="w-6 h-6 rounded-sm text-[#7E7E7E] hover:text-[#ECECEC] hover:bg-[#232323] flex items-center justify-center"
                      >
                        {paint.visible === false ? <EyeOff size={12} /> : <Eye size={12} />}
                      </button>
                      <button
                        onClick={(event) => {
                          event.stopPropagation();
                          const next = localFills.filter((_, i) => i !== index);
                          updateFills(next, next.length === 0 ? 0 : Math.max(0, index - 1));
                        }}
                        className="w-6 h-6 rounded-sm text-[#7E7E7E] hover:text-[#FF7474] hover:bg-[#232323] flex items-center justify-center"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>

                  <div className="mt-2 flex justify-end gap-1">
                    <button
                      onClick={(event) => {
                        event.stopPropagation();
                        if (index === 0) return;
                        const next = [...localFills];
                        [next[index - 1], next[index]] = [next[index], next[index - 1]];
                        updateFills(next, index - 1);
                      }}
                      className="w-6 h-6 rounded-sm text-[#777] hover:text-[#EEE] hover:bg-[#232323] flex items-center justify-center"
                    >
                      <ChevronUp size={12} />
                    </button>
                    <button
                      onClick={(event) => {
                        event.stopPropagation();
                        if (index === localFills.length - 1) return;
                        const next = [...localFills];
                        [next[index + 1], next[index]] = [next[index], next[index + 1]];
                        updateFills(next, index + 1);
                      }}
                      className="w-6 h-6 rounded-sm text-[#777] hover:text-[#EEE] hover:bg-[#232323] flex items-center justify-center"
                    >
                      <ChevronDown size={12} />
                    </button>
                  </div>
                </button>
              ))}
            </div>
          </aside>

          <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-4 space-y-4 bg-[#0F0F0F]">
            {!selectedPaint ? (
              <div className="h-full flex items-center justify-center text-[11px] text-[#666]">Select a fill layer.</div>
            ) : (
              <>
                <div className="grid grid-cols-3 gap-3">
                  <div className="col-span-1">
                    <div className="text-[10px] uppercase tracking-widest text-[#666] font-bold mb-1">Type</div>
                    <select
                      value={selectedPaint.type}
                      onChange={(event) => {
                        const nextType = event.target.value as Paint['type'];
                        if (nextType === selectedPaint.type) return;
                        const nextPaint = createDefaultPaint(nextType);
                        updateSelectedPaint({ ...nextPaint, id: selectedPaint.id, opacity: selectedPaint.opacity, visible: selectedPaint.visible });
                        setSelectedStopIndex(0);
                      }}
                      className="w-full h-9 rounded-sm border border-[#2A2A2A] bg-[#171717] text-[11px] text-[#ECECEC] px-2 outline-none"
                    >
                      <option value="solid">Solid</option>
                      <option value="gradient-linear">Gradient Linear</option>
                      <option value="gradient-radial">Gradient Radial</option>
                    </select>
                  </div>
                  <div className="col-span-2">
                    <div className="flex items-center justify-between text-[10px] uppercase tracking-widest text-[#666] font-bold mb-1">
                      <span>Layer Opacity</span>
                      <span>{Math.round((selectedPaint.opacity ?? 1) * 100)}%</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.01}
                      value={selectedPaint.opacity ?? 1}
                      onChange={(event) => updateSelectedPaint({ opacity: Number(event.target.value) })}
                      className="w-full h-2 rounded-lg appearance-none cursor-pointer accent-indigo-500 bg-[#262626]"
                    />
                  </div>
                </div>

                {selectedPaint.type !== 'solid' && (
                  <div className="space-y-3 rounded-lg border border-[#2A2A2A] bg-[#141414] p-3">
                    <div className="flex items-center justify-between">
                      <div className="text-[10px] uppercase tracking-widest text-[#666] font-bold">Gradient Stops</div>
                      <button
                        onClick={() => {
                          const nextStops = [...selectedStops, { offset: 0.5, color: selectedColor || '#D9D9D9' }];
                          updateSelectedPaint({ gradientStops: nextStops });
                          setSelectedStopIndex(nextStops.length - 1);
                        }}
                        className="h-7 px-2 rounded-sm border border-[#2A2A2A] bg-[#1C1C1C] text-[10px] text-[#E6E6E6] uppercase tracking-wider hover:border-[#3A3A3A]"
                      >
                        <span className="inline-flex items-center gap-1">
                          <Plus size={11} /> Add Stop
                        </span>
                      </button>
                    </div>

                    <div
                      ref={gradientTrackRef}
                      onMouseDown={(event) => {
                        const track = gradientTrackRef.current;
                        if (!track) return;
                        const rect = track.getBoundingClientRect();
                        const nextOffset = clamp((event.clientX - rect.left) / rect.width, 0, 1);
                        const nextStops = [...selectedStops, { offset: nextOffset, color: selectedColor || '#D9D9D9' }];
                        updateSelectedPaint({ gradientStops: nextStops });
                        setSelectedStopIndex(nextStops.length - 1);
                      }}
                      className="relative h-12 rounded-md border border-[#2A2A2A] cursor-pointer"
                      style={{ background: paintPreview(selectedPaint) }}
                    >
                      {selectedStops.map((stop, index) => (
                        <button
                          key={`${index}-${stop.offset}`}
                          onMouseDown={(event) => {
                            event.stopPropagation();
                            setSelectedStopIndex(index);
                            setDraggingStopIndex(index);
                          }}
                          className={`absolute -bottom-1 w-3 h-3 rounded-full border-2 transition-transform ${
                            selectedStopIndex === index ? 'border-white scale-110' : 'border-[#181818]'
                          }`}
                          style={{
                            left: `calc(${clamp(stop.offset, 0, 1) * 100}% - 6px)`,
                            backgroundColor: stop.color,
                          }}
                        />
                      ))}
                    </div>

                    {selectedStops.length > 0 && (
                      <div className="grid grid-cols-[1fr_110px_110px] gap-2">
                        <select
                          value={selectedStopIndex}
                          onChange={(event) => setSelectedStopIndex(Number(event.target.value))}
                          className="h-8 rounded-sm border border-[#2A2A2A] bg-[#131313] text-[11px] text-[#ECECEC] px-2"
                        >
                          {selectedStops.map((_, index) => (
                            <option key={index} value={index}>{`Stop ${index + 1}`}</option>
                          ))}
                        </select>

                        <div className="h-8 rounded-sm border border-[#2A2A2A] bg-[#131313] px-2 flex items-center gap-1">
                          <span className="text-[10px] text-[#666]">Pos</span>
                          <input
                            value={Math.round((selectedStops[selectedStopIndex]?.offset ?? 0) * 100)}
                            onChange={(event) => {
                              const next = clamp((parseInt(event.target.value, 10) || 0) / 100, 0, 1);
                              const nextStops = [...selectedStops];
                              if (!nextStops[selectedStopIndex]) return;
                              nextStops[selectedStopIndex] = { ...nextStops[selectedStopIndex], offset: next };
                              updateSelectedPaint({ gradientStops: nextStops });
                            }}
                            className="w-full bg-transparent outline-none text-[11px] text-[#ECECEC] font-mono"
                          />
                          <span className="text-[10px] text-[#666]">%</span>
                        </div>

                        <button
                          onClick={() => {
                            if (selectedStops.length <= 2) return;
                            const nextStops = selectedStops.filter((_, index) => index !== selectedStopIndex);
                            updateSelectedPaint({ gradientStops: nextStops });
                            setSelectedStopIndex(Math.max(0, selectedStopIndex - 1));
                          }}
                          className="h-8 rounded-sm border border-[#2A2A2A] bg-[#131313] text-[10px] uppercase tracking-wider text-[#C4C4C4] hover:text-[#FF7F7F]"
                        >
                          Remove Stop
                        </button>
                      </div>
                    )}

                    {selectedPaint.type === 'gradient-linear' && (
                      <div>
                        <div className="flex items-center justify-between text-[10px] uppercase tracking-widest text-[#666] font-bold mb-1">
                          <span>Angle</span>
                          <span>{Math.round(selectedPaint.gradientAngle ?? 90)}deg</span>
                        </div>
                        <input
                          type="range"
                          min={-180}
                          max={180}
                          value={Math.round(selectedPaint.gradientAngle ?? 90)}
                          onChange={(event) => updateSelectedPaint({ gradientAngle: Number(event.target.value) })}
                          className="w-full h-2 rounded-lg appearance-none cursor-pointer accent-indigo-500 bg-[#262626]"
                        />
                      </div>
                    )}

                    {selectedPaint.type === 'gradient-radial' && (
                      <div className="grid grid-cols-3 gap-2">
                        <div className="h-8 rounded-sm border border-[#2A2A2A] bg-[#131313] px-2 flex items-center gap-1">
                          <span className="text-[10px] text-[#666]">X</span>
                          <input
                            value={Math.round((selectedPaint.gradientCenter?.x ?? 0.5) * 100)}
                            onChange={(event) => {
                              const x = clamp((parseInt(event.target.value, 10) || 0) / 100, 0, 1);
                              updateSelectedPaint({
                                gradientCenter: {
                                  x,
                                  y: selectedPaint.gradientCenter?.y ?? 0.5,
                                },
                              });
                            }}
                            className="w-full bg-transparent outline-none text-[11px] text-[#ECECEC] font-mono"
                          />
                          <span className="text-[10px] text-[#666]">%</span>
                        </div>
                        <div className="h-8 rounded-sm border border-[#2A2A2A] bg-[#131313] px-2 flex items-center gap-1">
                          <span className="text-[10px] text-[#666]">Y</span>
                          <input
                            value={Math.round((selectedPaint.gradientCenter?.y ?? 0.5) * 100)}
                            onChange={(event) => {
                              const y = clamp((parseInt(event.target.value, 10) || 0) / 100, 0, 1);
                              updateSelectedPaint({
                                gradientCenter: {
                                  x: selectedPaint.gradientCenter?.x ?? 0.5,
                                  y,
                                },
                              });
                            }}
                            className="w-full bg-transparent outline-none text-[11px] text-[#ECECEC] font-mono"
                          />
                          <span className="text-[10px] text-[#666]">%</span>
                        </div>
                        <div className="h-8 rounded-sm border border-[#2A2A2A] bg-[#131313] px-2 flex items-center gap-1">
                          <span className="text-[10px] text-[#666]">R</span>
                          <input
                            value={Math.round((selectedPaint.gradientRadius ?? 0.5) * 100)}
                            onChange={(event) => {
                              const radius = clamp((parseInt(event.target.value, 10) || 0) / 100, 0.05, 1);
                              updateSelectedPaint({ gradientRadius: radius });
                            }}
                            className="w-full bg-transparent outline-none text-[11px] text-[#ECECEC] font-mono"
                          />
                          <span className="text-[10px] text-[#666]">%</span>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                <div className="rounded-lg border border-[#2A2A2A] bg-[#141414] p-3">
                  <div className="text-[10px] uppercase tracking-widest text-[#666] font-bold mb-2">
                    {selectedPaint.type === 'solid' ? 'Fill Color' : `Stop Color ${selectedStopIndex + 1}`}
                  </div>
                  <AdvancedColorPicker
                    color={selectedColor}
                    onChange={(nextColor) => {
                      if (selectedPaint.type === 'solid') {
                        updateSelectedPaint({ color: nextColor });
                        return;
                      }
                      const nextStops = [...selectedStops];
                      if (!nextStops[selectedStopIndex]) return;
                      nextStops[selectedStopIndex] = { ...nextStops[selectedStopIndex], color: nextColor };
                      updateSelectedPaint({ gradientStops: nextStops });
                    }}
                  />
                </div>
              </>
            )}
          </div>
        </div>

        <div className="h-12 px-4 border-t border-[#2A2A2A] bg-[#111111] flex items-center justify-end">
          <button
            onClick={onClose}
            className="h-8 px-4 rounded-sm bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] uppercase tracking-widest font-black"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
