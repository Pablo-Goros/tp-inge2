import { useId, useRef, useState, type DragEvent } from 'react';
import { Alert } from './Alert';
import { Button } from './Button';

interface Props {
  /** Extensión aceptada, p. ej. ".pdf". */
  accept: string;
  maxBytes: number;
  title?: string;
  hint: string;
  buttonLabel?: string;
  disabled?: boolean;
  onFile: (file: File) => void;
  /** Mensaje de rechazo a medida; por defecto, genérico con tamaño y tipo. */
  rejectMessage?: (file: File) => string;
}

export function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export function FileDropzone({ accept, maxBytes, title = 'Arrastrá tu archivo acá', hint, buttonLabel = 'Seleccionar archivo', disabled, onFile, rejectMessage }: Props) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handle(file: File | undefined) {
    if (!file) return;
    const okType = file.name.toLowerCase().endsWith(accept.toLowerCase());
    if (!okType || file.size > maxBytes) {
      setError(
        rejectMessage?.(file) ??
          `Solo se aceptan archivos ${accept} de hasta ${formatSize(maxBytes)}. El archivo elegido pesa ${formatSize(file.size)}.`,
      );
      return;
    }
    setError(null);
    onFile(file);
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setOver(false);
    if (!disabled) handle(e.dataTransfer.files[0]);
  }

  return (
    <div className="stack" style={{ gap: 12 }}>
      <div
        className={['drop', over && 'drop-over', error && 'drop-err'].filter(Boolean).join(' ')}
        onDragOver={(e) => { e.preventDefault(); if (!disabled) setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={onDrop}
        data-testid="dropzone"
      >
        <div className="drop-ico" aria-hidden="true">↑</div>
        <b>{title}</b>
        <span className="help">o seleccionalo desde tu equipo</span>
        <input
          id={inputId}
          ref={inputRef}
          type="file"
          accept={accept}
          className="sr-only"
          tabIndex={-1}
          aria-label={buttonLabel}
          disabled={disabled}
          onChange={(e) => { handle(e.target.files?.[0]); e.target.value = ''; }}
        />
        <Button style={{ marginTop: 8 }} disabled={disabled} onClick={() => inputRef.current?.click()}>{buttonLabel}</Button>
        <span className="help">{hint}</span>
      </div>
      {error && <Alert tone="error">{error}</Alert>}
    </div>
  );
}
