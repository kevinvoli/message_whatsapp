'use client';

import type { QuizPdf } from '@/lib/definitions';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3002';

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

interface PdfItemProps {
  pdf: QuizPdf;
  onView?: (pdf: QuizPdf) => void;
}

export function PdfItem({ pdf, onView }: PdfItemProps) {
  return (
    <div className="rounded-lg border bg-gray-50 p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-gray-800">{pdf.originalName}</p>
          <p className="text-xs text-gray-500">{formatFileSize(pdf.fileSize)}</p>
        </div>
        <div className="flex gap-2 shrink-0">
          {pdf.allowInlineView && onView && (
            <button
              onClick={() => onView(pdf)}
              aria-label={`Voir le document ${pdf.originalName}`}
              className="rounded bg-blue-100 px-2 py-1 text-xs text-blue-700 hover:bg-blue-200"
            >
              Voir
            </button>
          )}
          <button
            onClick={() => window.open(`${API_BASE_URL}/quiz/pdfs/${pdf.id}/download`, '_blank')}
            aria-label={`Telecharger ${pdf.originalName}`}
            className="rounded bg-gray-200 px-2 py-1 text-xs text-gray-700 hover:bg-gray-300"
          >
            Telecharger
          </button>
        </div>
      </div>
    </div>
  );
}
