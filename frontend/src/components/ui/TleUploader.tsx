'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { Upload, Check, AlertCircle, Loader2 } from 'lucide-react';
import { uploadTLE, fetchPresets, loadPreset } from '@/lib/api';
import { useSatelliteStore } from '@/store/satelliteStore';
import { cn } from '@/lib/utils';

export default function TleUploader() {
  const [isDragOver, setIsDragOver] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [presets, setPresets] = useState<string[]>([]);
  const [presetsLoading, setPresetsLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const setSatellites = useSatelliteStore((state) => state.setSatellites);

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
        const satellites = await uploadTLE(file);
        setSatellites(satellites);
        setSuccess(`Загружено ${satellites.length} спутников`);
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
    [setSatellites]
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

  const handlePresetLoad = useCallback(
    async (name: string) => {
      if (!name) return;

      setLoading(true);
      setError(null);
      setSuccess(null);

      try {
        const satellites = await loadPreset(name);
        setSatellites(satellites);
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
    [setSatellites]
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
