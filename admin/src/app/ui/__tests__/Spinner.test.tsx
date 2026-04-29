import { render } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { Spinner } from '../Spinner';

describe('Spinner', () => {
  it('rend un SVG', () => {
    const { container } = render(<Spinner />);
    expect(container.querySelector('svg')).toBeInTheDocument();
  });

  it('contient la classe animate-spin', () => {
    const { container } = render(<Spinner />);
    expect(container.querySelector('svg')).toHaveClass('animate-spin');
  });

  it('a la couleur text-blue-600', () => {
    const { container } = render(<Spinner />);
    expect(container.querySelector('svg')).toHaveClass('text-blue-600');
  });
});
