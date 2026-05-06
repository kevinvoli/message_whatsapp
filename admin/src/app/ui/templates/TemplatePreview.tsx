'use client';

import React from 'react';
import { FileText, Image, Play } from 'lucide-react';
import { TemplateHeaderType } from '@/app/lib/definitions';

interface TemplatePreviewProps {
  headerType?: TemplateHeaderType | null;
  headerText?: string | null;
  headerExample?: string | null;
  bodyText: string;
  footerText?: string | null;
  buttons?: Record<string, unknown>[] | null;
  exampleVariables?: string[];
}

function renderBody(bodyText: string, vars: string[]): React.ReactNode[] {
  const parts = bodyText.split(/({{[0-9]+}})/g);
  return parts.map((part, index) => {
    const match = part.match(/^{{([0-9]+)}}$/);
    if (!match) return <span key={index}>{part}</span>;
    const varIndex = parseInt(match[1], 10) - 1;
    if (varIndex >= 0 && varIndex < vars.length && vars[varIndex]) {
      return (
        <span key={index} className="font-medium text-gray-900">
          {vars[varIndex]}
        </span>
      );
    }
    return (
      <span key={index} className="px-1 rounded text-xs font-mono bg-blue-100 text-blue-700">
        {part}
      </span>
    );
  });
}

export default function TemplatePreview({
  headerType,
  headerText,
  headerExample,
  bodyText,
  footerText,
  buttons,
  exampleVariables = [],
}: TemplatePreviewProps) {
  const hasHeader = headerType != null;
  const hasFooter = footerText != null && footerText.trim().length > 0;
  const hasButtons = buttons != null && buttons.length > 0;

  return (
    <div className="max-w-sm w-full">
      <div className="bg-white border border-gray-200 rounded-xl shadow-md overflow-hidden">
        {hasHeader && (
          <div>
            {headerType === 'TEXT' && headerText && (
              <div className="px-4 pt-4 pb-2">
                <p className="font-bold text-gray-900 text-sm">{headerText}</p>
              </div>
            )}
            {headerType === 'IMAGE' && (
              <div className="bg-gray-100 h-40 flex items-center justify-center">
                <div className="flex flex-col items-center gap-2 text-gray-400">
                  <Image className="w-10 h-10" aria-hidden="true" />
                  <span className="text-xs">
                    {headerExample ? headerExample : 'Apercu image'}
                  </span>
                </div>
              </div>
            )}
            {headerType === 'VIDEO' && (
              <div className="bg-gray-100 h-40 flex items-center justify-center">
                <div className="flex flex-col items-center gap-2 text-gray-400">
                  <Play className="w-10 h-10" aria-hidden="true" />
                  <span className="text-xs">
                    {headerExample ? headerExample : 'Apercu video'}
                  </span>
                </div>
              </div>
            )}
            {headerType === 'DOCUMENT' && (
              <div className="bg-gray-50 border-b border-gray-200 px-4 py-3 flex items-center gap-3">
                <FileText className="w-8 h-8 text-gray-400 flex-shrink-0" aria-hidden="true" />
                <span className="text-sm text-gray-500 truncate">
                  {headerExample ? headerExample : 'Document'}
                </span>
              </div>
            )}
          </div>
        )}

        <div className={`px-4 ${hasHeader && headerType === 'TEXT' ? 'pt-0' : 'pt-4'} ${hasFooter || hasButtons ? 'pb-2' : 'pb-4'}`}>
          <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
            {renderBody(bodyText || '', exampleVariables)}
          </p>
        </div>

        {hasFooter && (
          <div className="px-4 pb-3">
            <p className="text-xs text-gray-400">{footerText}</p>
          </div>
        )}

        {hasButtons && (
          <>
            <div className="border-t border-gray-200 mx-2" />
            <div className="px-2 py-2 flex flex-col gap-1">
              {buttons.map((btn, i) => {
                const label =
                  typeof btn['text'] === 'string'
                    ? btn['text']
                    : typeof btn['label'] === 'string'
                    ? btn['label']
                    : `Bouton ${i + 1}`;
                return (
                  <div
                    key={i}
                    className="text-center text-sm text-blue-600 py-1.5 font-medium"
                    aria-label={label}
                  >
                    {label}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
