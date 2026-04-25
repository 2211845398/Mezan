import { Upload } from 'lucide-react';
import { useId, useRef, useState } from 'react';

import { cn } from '@/lib/utils';

import { Button } from '../ui/button';

export type FileDropProps = {
  accept?: string;
  disabled?: boolean;
  className?: string;
  onFile?: (file: File) => void;
  onFiles?: (files: FileList) => void;
  'aria-label'?: string;
};

/**
 * Native drag/drop with fallback file input. For multipart uploads, build
 * `FormData` in the parent and `POST` through `apiClient`.
 */
export function FileDrop({
  accept,
  disabled,
  className,
  onFile,
  onFiles,
  'aria-label': ariaLabel = 'File upload',
}: FileDropProps) {
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  function handleFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) {
      return;
    }
    onFiles?.(fileList);
    if (onFile && fileList[0]) {
      onFile(fileList[0]);
    }
  }

  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed border-muted-foreground/40 p-6 text-center transition-colors',
        isDragging && 'border-primary bg-muted/40',
        disabled && 'pointer-events-none opacity-50',
        className,
      )}
      onDragEnter={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(true);
      }}
      onDragOver={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(true);
      }}
      onDragLeave={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);
        if (disabled) {
          return;
        }
        handleFiles(e.dataTransfer.files);
      }}
    >
      <Upload className="size-8 text-muted-foreground" aria-hidden="true" />
      <p className="text-sm text-muted-foreground" id={id + '-desc'}>
        {ariaLabel}
      </p>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="sr-only"
        tabIndex={-1}
        aria-label={ariaLabel}
        id={id + '-file'}
        disabled={disabled}
        onChange={(e) => {
          handleFiles(e.target.files);
          e.target.value = '';
        }}
      />
      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={() => inputRef.current?.click()}
        disabled={disabled}
        aria-describedby={id + '-desc'}
      >
        Select file
      </Button>
    </div>
  );
}

export function toFormDataWithFile(
  file: File,
  fieldName: string,
  extra?: Record<string, string>,
): FormData {
  const fd = new FormData();
  fd.append(fieldName, file);
  if (extra) {
    for (const [k, v] of Object.entries(extra)) {
      fd.append(k, v);
    }
  }
  return fd;
}
