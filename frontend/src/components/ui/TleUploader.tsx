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
        setSuccess(`\u0417\u0430\u0433\u0440\u0443\u0436\u0435\u043D\u043E ${satellites.length} \u0441\u043F\u0443\u0442\u043D\u0438\u043A\u043E\u0432`);
      } catch (err) {
        const message =
          err instanceof Error
            ? err.message
            : '\u041E\u0448\u0438\u0431\u043A\u0430 \u0437\u0430\u0433\u0440\u0443\u0437\u043A\u0438 \u0444\u0430\u0439\u043B\u0430';
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
        setSuccess(`\u041F\u0440\u0435\u0441\u0435\u0442 "${name}" \u0437\u0430\u0433\u0440\u0443\u0436\u0435\u043D`);
      } catch (err) {
        const message =
          err instanceof Error
            ? err.message
            : '\u041E\u0448\u0438\u0431\u043A\u0430 \u0437\u0430\u0433\u0440\u0443\u0437\u043A\u0438 \u043F\u0440\u0435\u0441\u0435\u0442\u0430';
        setError(message);
      } finally {
        setLoading(false);
      }
    },
    [setSatellites]
  );

  return (
    <div className="space-y-3">
      <p className="text-xs text-[#9ca3af] uppercase tracking-wider">
        {'\u0417\u0430\u0433\u0440\u0443\u0437\u043A\u0430 TLE'}
      </p>

      {/* Drag & drop area */}
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => fileInputRef.current?.click()}
        className={cn(
          'border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-all duration-200',
          isDragOver
            ? 'border-accent-cyan/60 bg-accent-cyan/5'
            : 'border-cosmos-border hover:border-accent-cyan/30 hover:bg-cosmos-surface/20'
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
          <Upload size={24} className="mx-auto text-[#9ca3af] mb-2" />
        )}
        <p className="text-xs text-[#9ca3af]">
          {loading
            ? '\u0417\u0430\u0433\u0440\u0443\u0437\u043A\u0430...'
            : '\u041F\u0435\u0440\u0435\u0442\u0430\u0449\u0438\u0442\u0435 TLE \u0444\u0430\u0439\u043B \u0438\u043B\u0438 \u043D\u0430\u0436\u043C\u0438\u0442\u0435'}
        </p>
      </div>

      {/* Presets */}
      {presets.length > 0 && (
        <div>
          <p className="text-xs text-[#9ca3af] mb-1.5">{'\u041F\u0440\u0435\u0441\u0435\u0442\u044B'}</p>
          <select
            onChange={(e) => handlePresetLoad(e.target.value)}
            defaultValue=""
            disabled={loading || presetsLoading}
            className="w-full bg-cosmos-surface/50 border border-cosmos-border rounded-lg py-2 px-3 text-sm text-[#e5e7eb] focus:outline-none focus:border-accent-cyan/40 transition-colors duration-200 appearance-none cursor-pointer disabled:opacity-50"
            style={{
              backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%239ca3af' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e")`,
              backgroundPosition: 'right 8px center',
              backgroundRepeat: 'no-repeat',
              backgroundSize: '20px',
            }}
          >
            <option value="" className="bg-cosmos-surface">
              {'\u0412\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u043F\u0440\u0435\u0441\u0435\u0442...'}
            </option>
            {presets.map((preset) => (
              <option key={preset} value={preset} className="bg-cosmos-surface">
                {preset}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Status messages */}
      {success && (
        <div className="flex items-center gap-2 text-xs text-green-400 animate-fade-in">
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
