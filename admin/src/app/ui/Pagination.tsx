"use client";

import React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface PaginationProps {
  total: number;
  limit: number;
  offset: number;
  onPageChange: (offset: number) => void;
  onLimitChange?: (limit: number) => void;
}

export function Pagination({
  total,
  limit,
  offset,
  onPageChange,
  onLimitChange,
}: PaginationProps) {
  const currentPage = Math.floor(offset / limit) + 1;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const from = total === 0 ? 0 : offset + 1;
  const to = Math.min(offset + limit, total);

  return (
    <div className="flex items-center justify-between border-t border-gray-200 bg-white px-4 py-3">
      <div className="flex items-center gap-3 text-sm text-gray-500">
        <span>
          {from}–{to} sur {total}
        </span>
        {onLimitChange && (
          <select
            value={limit}
            onChange={(e) => {
              onLimitChange(parseInt(e.target.value, 10));
              onPageChange(0);
            }}
            className="rounded border border-gray-300 px-2 py-1 text-sm"
          >
            {[50, 100, 200].map((n) => (
              <option key={n} value={n}>
                {n} / page
              </option>
            ))}
          </select>
        )}
      </div>

      <div className="flex items-center gap-1">
        <button
          onClick={() => onPageChange(Math.max(0, offset - limit))}
          disabled={currentPage === 1}
          className="rounded p-1 text-gray-500 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed"
          aria-label="Page précédente"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>

        <span className="px-3 text-sm font-medium text-gray-700">
          {currentPage} / {totalPages}
        </span>

        <button
          onClick={() => onPageChange(Math.min((totalPages - 1) * limit, offset + limit))}
          disabled={currentPage === totalPages}
          className="rounded p-1 text-gray-500 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed"
          aria-label="Page suivante"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
