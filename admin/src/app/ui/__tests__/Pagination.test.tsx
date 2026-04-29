import { render, screen, fireEvent } from '@testing-library/react';
import { vi, describe, it, expect } from 'vitest';
import { Pagination } from '../Pagination';

const defaults = {
  total: 100,
  limit: 50,
  offset: 0,
  onPageChange: vi.fn(),
};

describe('Pagination', () => {
  it('affiche "1–50 sur 100"', () => {
    render(<Pagination {...defaults} />);
    expect(screen.getByText('1–50 sur 100')).toBeInTheDocument();
  });

  it('affiche la page courante et le total de pages', () => {
    render(<Pagination {...defaults} />);
    expect(screen.getByText('1 / 2')).toBeInTheDocument();
  });

  it('le bouton précédent est désactivé à la première page', () => {
    render(<Pagination {...defaults} />);
    expect(screen.getByLabelText('Page précédente')).toBeDisabled();
  });

  it('le bouton suivant est désactivé à la dernière page', () => {
    render(<Pagination {...defaults} offset={50} />);
    expect(screen.getByLabelText('Page suivante')).toBeDisabled();
  });

  it('le bouton suivant appelle onPageChange avec offset+limit', () => {
    const onPageChange = vi.fn();
    render(<Pagination {...defaults} onPageChange={onPageChange} />);
    fireEvent.click(screen.getByLabelText('Page suivante'));
    expect(onPageChange).toHaveBeenCalledWith(50);
  });

  it('le bouton précédent appelle onPageChange avec offset-limit', () => {
    const onPageChange = vi.fn();
    render(<Pagination {...defaults} onPageChange={onPageChange} offset={50} />);
    fireEvent.click(screen.getByLabelText('Page précédente'));
    expect(onPageChange).toHaveBeenCalledWith(0);
  });

  it('affiche "0–0 sur 0" si total=0', () => {
    render(<Pagination {...defaults} total={0} />);
    expect(screen.getByText('0–0 sur 0')).toBeInTheDocument();
  });

  it('affiche le select de limite si onLimitChange fourni', () => {
    const onLimitChange = vi.fn();
    render(<Pagination {...defaults} onLimitChange={onLimitChange} />);
    expect(screen.getByRole('combobox')).toBeInTheDocument();
  });

  it('onLimitChange appelé et onPageChange remis à 0 au changement de select', () => {
    const onLimitChange = vi.fn();
    const onPageChange = vi.fn();
    render(<Pagination {...defaults} onPageChange={onPageChange} onLimitChange={onLimitChange} />);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: '100' } });
    expect(onLimitChange).toHaveBeenCalledWith(100);
    expect(onPageChange).toHaveBeenCalledWith(0);
  });
});
