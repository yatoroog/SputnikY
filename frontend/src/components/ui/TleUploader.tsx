'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { Upload, Check, AlertCircle, Loader2, ClipboardPaste } from 'lucide-react';
import { uploadTLE, uploadTLEText, fetchPresets, loadPreset } from '@/lib/api';
import { useSatelliteStore } from '@/store/satelliteStore';
import { cn } from '@/lib/utils';
import type { FilterFacets, Satellite } from '@/types';

function hasFilterFacets(facets: FilterFacets | null): facets is FilterFacets {
  return !!facets && (facets.countries.length > 0 || facets.purposes.length > 0);
}

function deriveFilterFacets(satellites: Satellite[]): FilterFacets {
  return {
    countries: Array.from(
      new Set(satellites.map((satellite) => satellite.country).filter(Boolean))
    ).sort((left, right) => left.localeCompare(right, 'ru')),
    purposes: Array.from(
      new Set(satellites.map((satellite) => satellite.purpose).filter(Boolean))
    ).sort((left, right) => left.localeCompare(right, 'ru')),
  };
}

function validateTLELine(line: string, lineNum: 1 | 2): string | null {
  if (line.length < 69) return `Строка ${lineNum} TLE слишком короткая (${line.length} символов, нужно 69)`;
  if (line[0] !== String(lineNum)) return `Строка ${lineNum} TLE должна начинаться с "${lineNum}"`;
  return null;
}

function validateTLEText(text: string): { valid: boolean; error?: string; count: number } {
  const lines = text.trim().split('\n').map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) return { valid: false, error: 'Минимум 2 строки TLE данных', count: 0 };

  let count = 0;
  let i = 0;
  while (i < lines.length) {
    if (lines[i].startsWith('1 ') || lines[i].startsWith('2 ')) {
      // Two-line format without name
      if (i + 1 >= lines.length) return { valid: false, error: `Неполная пара TLE на строке ${i + 1}`, count };
      const err1 = validateTLELine(lines[i], 1);
      if (err1) return { valid: false, error: err1, count };
      const err2 = validateTLELine(lines[i + 1], 2);
      if (err2) return { valid: false, error: err2, count };
      count++;
      i += 2;
    } else {
      // Three-line format: name + line1 + line2
      if (i + 2 >= lines.length) return { valid: false, error: `Неполный TLE блок на строке ${i + 1}`, count };
      const err1 = validateTLELine(lines[i + 1], 1);
      if (err1) return { valid: false, error: err1, count };
      const err2 = validateTLELine(lines[i + 2], 2);
      if (err2) return { valid: false, error: err2, count };
      count++;
      i += 3;
    }
  }

  return { valid: true, count };
}

export default function TleUploader() {
  const [isDragOver, setIsDragOver] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [presets, setPresets] = useState<string[]>([]);
  const [presetsLoading, setPresetsLoading] = useState(false);
  const [tleText, setTleText] = useState('');
  const [tleValidation, setTleValidation] = useState<{ valid: boolean; error?: string; count: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const setSatellites = useSatelliteStore((state) => state.setSatellites);
  const setCatalogStatus = useSatelliteStore((state) => state.setCatalogStatus);
  const setFilterFacets = useSatelliteStore((state) => state.setFilterFacets);

  useEffect(() => {
    let cancelled = false;

    async function loadPresets() {
      setPresetsLoading(true);
      try {
        const data = await fetchPresets();
        if (!cancelled) {
          setPresets(data);
        }
      } catch {
        // Presets not available
      } finally {
        if (!cancelled) {
          setPresetsLoading(false);
        }
      }
    }

    loadPresets();

    return () => {
      cancelled = true;
    };
  }, []);

  const handleFile = useCallback(
    async (file: File) => {
      setLoading(true);
      setError(null);
      setSuccess(null);

      try {
        const catalog = await uploadTLE(file);
        setSatellites(catalog.satellites);
        setCatalogStatus(catalog.catalogStatus);
        setFilterFacets(
          hasFilterFacets(catalog.filterFacets)
            ? catalog.filterFacets
            : deriveFilterFacets(catalog.satellites)
        );
        setSuccess(`Загружено ${catalog.satellites.length} спутников`);
      } catch (err) {
        const message =
          err instanceof Error
            ? err.message
            : 'Ошибка загрузки файла';
        setError(message);
      } finally {
        setLoading(false);
      }
    },
    [setSatellites, setCatalogStatus, setFilterFacets]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsDragOver(false);

      const file = e.dataTransfer.files[0];
      if (file) {
        handleFile(file);
      }
    },
    [handleFile]
  );

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragOver(false);
  }, []);

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        handleFile(file);
      }
    },
    [handleFile]
  );

  const handleTleTextChange = useCallback((text: string) => {
    setTleText(text);
    if (text.trim().length === 0) {
      setTleValidation(null);
      return;
    }
    setTleValidation(validateTLEText(text));
  }, []);

  const handleTleTextSubmit = useCallback(async () => {
    if (!tleText.trim() || !tleValidation?.valid) return;

    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const catalog = await uploadTLEText(tleText.trim());
      setSatellites(catalog.satellites);
      setCatalogStatus(catalog.catalogStatus);
      setFilterFacets(
        hasFilterFacets(catalog.filterFacets)
          ? catalog.filterFacets
          : deriveFilterFacets(catalog.satellites)
      );
      setSuccess(`Загружено ${catalog.satellites.length} спутников`);
      setTleText('');
      setTleValidation(null);
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : 'Ошибка загрузки TLE данных';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [tleText, tleValidation, setSatellites, setCatalogStatus, setFilterFacets]);

  const handlePresetLoad = useCallback(
    async (name: string) => {
      if (!name) return;

      setLoading(true);
      setError(null);
      setSuccess(null);

      try {
        const catalog = await loadPreset(name);
        setSatellites(catalog.satellites);
        setCatalogStatus(catalog.catalogStatus);
        setFilterFacets(
          hasFilterFacets(catalog.filterFacets)
            ? catalog.filterFacets
            : deriveFilterFacets(catalog.satellites)
        );
        setSuccess(`Пресет "${name}" загружен`);
      } catch (err) {
        const message =
          err instanceof Error
            ? err.message
            : 'Ошибка загрузки пресета';
        setError(message);
      } finally {
        setLoading(false);
      }
    },
    [setSatellites, setCatalogStatus, setFilterFacets]
  );

  return (
    <div className="space-y-3">
      <p className="text-[11px] text-[#637196] uppercase tracking-[0.24em] font-medium">
        {'Загрузка TLE'}
      </p>

      {/* Drag & drop area — glass style */}
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => fileInputRef.current?.click()}
        className={cn(
          'border border-dashed rounded-2xl p-4 text-center cursor-pointer transition-all duration-300',
          isDragOver
            ? 'border-accent-cyan/40 bg-accent-cyan/5'
            : 'border-white/10 hover:border-white/20 hover:bg-white/[0.03]'
        )}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".tle,.txt"
          onChange={handleFileInput}
          className="hidden"
        />
        {loading ? (
          <Loader2 size={24} className="mx-auto text-accent-cyan animate-spin" />
        ) : (
          <Upload size={24} className="mx-auto text-[#4a5578] mb-2" />
        )}
        <p className="text-xs text-[#637196]">
          {loading
            ? 'Загрузка...'
            : 'Перетащите TLE файл или нажмите'}
        </p>
      </div>

      {/* Manual TLE input */}
      <div>
        <p className="text-[11px] text-[#637196] mb-2 font-medium flex items-center gap-1.5">
          <ClipboardPaste size={12} />
          {'Вставить TLE вручную'}
        </p>
        <textarea
          value={tleText}
          onChange={(e) => handleTleTextChange(e.target.value)}
          placeholder={'ISS (ZARYA)\n1 25544U 98067A   24...\n2 25544  51.6416...'}
          disabled={loading}
          rows={4}
          className="w-full premium-field rounded-2xl py-2.5 px-3.5 text-xs text-[#eef2ff] font-mono focus:outline-none resize-none placeholder:text-[#3a4565] disabled:opacity-40"
        />
        {tleValidation && (
          <div className="mt-1.5 flex items-center gap-1.5">
            {tleValidation.valid ? (
              <span className="text-[10px] text-emerald-400">
                {tleValidation.count} {tleValidation.count === 1 ? 'спутник' : tleValidation.count < 5 ? 'спутника' : 'спутников'} распознано
              </span>
            ) : (
              <span className="text-[10px] text-red-400">{tleValidation.error}</span>
            )}
          </div>
        )}
        <button
          type="button"
          onClick={handleTleTextSubmit}
          disabled={loading || !tleValidation?.valid}
          className={cn(
            'mt-2 w-full rounded-2xl py-2 px-3 text-xs font-medium uppercase tracking-wider transition-all duration-300',
            tleValidation?.valid
              ? 'bg-accent-cyan/15 border border-accent-cyan/30 text-accent-cyan hover:bg-accent-cyan/25'
              : 'bg-white/5 border border-white/10 text-[#4a5578] cursor-not-allowed'
          )}
        >
          {loading ? 'Загрузка...' : 'Добавить на карту'}
        </button>
      </div>

      {/* Presets */}
      {presets.length > 0 && (
        <div>
          <p className="text-[11px] text-[#637196] mb-2 font-medium">{'Пресеты'}</p>
          <select
            onChange={(e) => handlePresetLoad(e.target.value)}
            defaultValue=""
            disabled={loading || presetsLoading}
            className="w-full premium-field rounded-2xl py-2.5 px-3.5 text-sm text-[#eef2ff] focus:outline-none appearance-none cursor-pointer disabled:opacity-40"
            style={{
              backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%23637196' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e")`,
              backgroundPosition: 'right 10px center',
              backgroundRepeat: 'no-repeat',
              backgroundSize: '18px',
            }}
          >
            <option value="" className="bg-[#0d1120]">
              {'Выберите пресет...'}
            </option>
            {presets.map((preset) => (
              <option key={preset} value={preset} className="bg-[#0d1120]">
                {preset}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Status messages */}
      {success && (
        <div className="flex items-center gap-2 text-xs text-emerald-400 animate-fade-in">
          <Check size={14} />
          {success}
        </div>
      )}
      {error && (
        <div className="flex items-center gap-2 text-xs text-red-400 animate-fade-in">
          <AlertCircle size={14} />
          {error}
        </div>
      )}
    </div>
  );
}
