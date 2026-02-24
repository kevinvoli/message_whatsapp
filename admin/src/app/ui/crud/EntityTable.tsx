"use client";

import React from 'react';
import { Spinner } from '@/app/ui/Spinner';

type EntityTableColumn<T> = {
  header: string;
  className?: string;
  render: (item: T) => React.ReactNode;
};

type EntityTableProps<T> = {
  items: T[];
  columns: EntityTableColumn<T>[];
  loading: boolean;
  emptyMessage: string;
  getRowKey: (item: T) => string;
};

export function EntityTable<T>({
  items,
  columns,
  loading,
  emptyMessage,
  getRowKey,
}: EntityTableProps<T>) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead className="border-b border-gray-200 bg-gray-50">
          <tr>
            {columns.map((column) => (
              <th
                key={column.header}
                className={`px-6 py-3 text-left text-xs font-medium uppercase text-gray-500 ${column.className ?? ''}`}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200">
          {items.map((item) => (
            <tr key={getRowKey(item)} className="hover:bg-gray-50">
              {columns.map((column) => (
                <td key={`${getRowKey(item)}_${column.header}`} className="px-6 py-4">
                  {column.render(item)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {!loading && items.length === 0 && (
        <p className="py-4 text-center text-gray-500">{emptyMessage}</p>
      )}
      {loading && (
        <div className="flex justify-center py-4">
          <Spinner />
        </div>
      )}
    </div>
  );
}
