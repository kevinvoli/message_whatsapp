"use client";

import React, { ReactNode } from 'react';
import { Spinner } from '@/app/ui/Spinner';

type EntityFormModalProps = {
  isOpen: boolean;
  title: string;
  onClose: () => void;
  onSubmit: (e: React.FormEvent) => void | Promise<void>;
  loading: boolean;
  submitLabel: string;
  loadingLabel: string;
  children: ReactNode;
};

export function EntityFormModal({
  isOpen,
  title,
  onClose,
  onSubmit,
  loading,
  submitLabel,
  loadingLabel,
  children,
}: EntityFormModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex h-full w-full items-center justify-center overflow-y-auto bg-gray-600 bg-opacity-50">
      <div className="w-full max-w-md rounded-lg bg-white p-8 shadow-xl">
        <h3 className="mb-4 text-lg font-semibold text-gray-900">{title}</h3>
        <form onSubmit={onSubmit}>
          {children}
          <div className="mt-6 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded bg-gray-300 px-4 py-2 font-bold text-gray-800 hover:bg-gray-400"
              disabled={loading}
            >
              Annuler
            </button>
            <button
              type="submit"
              className="flex items-center rounded bg-blue-600 px-4 py-2 font-bold text-white hover:bg-blue-700"
              disabled={loading}
            >
              {loading && <Spinner />}
              {loading ? loadingLabel : submitLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
