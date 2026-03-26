'use client';

import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div className="flex flex-col items-center justify-center min-h-screen gap-4 p-8 text-center">
          <p className="text-lg font-semibold text-gray-800">Une erreur inattendue s&apos;est produite.</p>
          <p className="text-sm text-gray-500">{this.state.error?.message}</p>
          <button
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
            onClick={() => this.setState({ hasError: false, error: null })}
          >
            Réessayer
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
