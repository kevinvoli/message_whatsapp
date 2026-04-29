import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useCrudResource } from '@/app/hooks/useCrudResource';

const addToastMock = vi.fn();

vi.mock('@/app/ui/ToastProvider', () => ({
  useToast: () => ({ addToast: addToastMock }),
}));

interface Item {
  id: string;
  name: string;
}

interface CreatePayload {
  name: string;
}

interface UpdatePayload {
  name: string;
}

function makeWrapper() {
  return ({ children }: { children: React.ReactNode }) => <>{children}</>;
}

function buildConfig(overrides: Partial<{
  initialItems: Item[];
  onRefresh: () => Promise<void> | void;
  createItem: (payload: CreatePayload) => Promise<unknown>;
  updateItem: (id: string, payload: UpdatePayload) => Promise<unknown>;
  deleteItem: (id: string) => Promise<unknown>;
}> = {}) {
  return {
    initialItems: overrides.initialItems ?? ([{ id: '1', name: 'A' }] as Item[]),
    onRefresh: overrides.onRefresh ?? vi.fn(async () => undefined),
    createItem: overrides.createItem ?? vi.fn(async () => ({ id: '2' })),
    updateItem: overrides.updateItem ?? vi.fn(async () => ({})),
    deleteItem: overrides.deleteItem ?? vi.fn(async () => ({})),
    getId: (item: Item) => item.id,
  };
}

describe('useCrudResource', () => {
  beforeEach(() => {
    addToastMock.mockClear();
  });

  it("expose les items initiaux", () => {
    const config = buildConfig({ initialItems: [{ id: 'a', name: 'one' }] });
    const { result } = renderHook(() =>
      useCrudResource<Item, CreatePayload, UpdatePayload>(config),
    { wrapper: makeWrapper() });
    expect(result.current.items).toEqual([{ id: 'a', name: 'one' }]);
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.success).toBeNull();
  });

  it('construit byId à partir des items', () => {
    const config = buildConfig({ initialItems: [
      { id: 'a', name: 'A' },
      { id: 'b', name: 'B' },
    ]});
    const { result } = renderHook(() =>
      useCrudResource<Item, CreatePayload, UpdatePayload>(config),
    { wrapper: makeWrapper() });
    expect(result.current.byId.get('a')).toEqual({ id: 'a', name: 'A' });
    expect(result.current.byId.get('b')).toEqual({ id: 'b', name: 'B' });
  });

  it('create — succès, met success et appelle onRefresh', async () => {
    const onRefresh = vi.fn(async () => undefined);
    const createItem = vi.fn(async () => ({ id: '2' }));
    const config = buildConfig({ onRefresh, createItem });

    const { result } = renderHook(() =>
      useCrudResource<Item, CreatePayload, UpdatePayload>(config),
    { wrapper: makeWrapper() });

    let opResult: { ok: boolean; error?: string } | undefined;
    await act(async () => {
      opResult = await result.current.create({ name: 'X' });
    });

    expect(opResult).toEqual({ ok: true });
    expect(createItem).toHaveBeenCalledWith({ name: 'X' });
    expect(onRefresh).toHaveBeenCalled();
    expect(result.current.success).toBe('Element created.');
    expect(result.current.error).toBeNull();
    expect(result.current.loading).toBe(false);
    expect(addToastMock).toHaveBeenCalledWith({ type: 'success', message: 'Element created.' });
  });

  it('create — message custom', async () => {
    const config = buildConfig();
    const { result } = renderHook(() =>
      useCrudResource<Item, CreatePayload, UpdatePayload>(config),
    { wrapper: makeWrapper() });

    await act(async () => {
      await result.current.create({ name: 'X' }, 'Created!');
    });
    expect(result.current.success).toBe('Created!');
  });

  it('create — erreur, met error et toast error', async () => {
    const createItem = vi.fn(async () => {
      throw new Error('boom');
    });
    const config = buildConfig({ createItem });
    const { result } = renderHook(() =>
      useCrudResource<Item, CreatePayload, UpdatePayload>(config),
    { wrapper: makeWrapper() });

    let opResult: { ok: boolean; error?: string } | undefined;
    await act(async () => {
      opResult = await result.current.create({ name: 'X' });
    });

    expect(opResult).toEqual({ ok: false, error: 'boom' });
    expect(result.current.error).toBe('boom');
    expect(result.current.success).toBeNull();
    expect(result.current.loading).toBe(false);
    expect(addToastMock).toHaveBeenCalledWith({ type: 'error', message: 'boom' });
  });

  it('create — erreur non-Error (string) → message générique', async () => {
    const createItem = vi.fn(async () => {
      // eslint-disable-next-line @typescript-eslint/no-throw-literal
      throw 'oops';
    });
    const config = buildConfig({ createItem });
    const { result } = renderHook(() =>
      useCrudResource<Item, CreatePayload, UpdatePayload>(config),
    { wrapper: makeWrapper() });

    await act(async () => {
      await result.current.create({ name: 'X' });
    });
    expect(result.current.error).toBe('Operation failed.');
  });

  it('update — succès', async () => {
    const updateItem = vi.fn(async () => ({}));
    const onRefresh = vi.fn(async () => undefined);
    const config = buildConfig({ updateItem, onRefresh });
    const { result } = renderHook(() =>
      useCrudResource<Item, CreatePayload, UpdatePayload>(config),
    { wrapper: makeWrapper() });

    let opResult: { ok: boolean; error?: string } | undefined;
    await act(async () => {
      opResult = await result.current.update('1', { name: 'B' });
    });

    expect(opResult).toEqual({ ok: true });
    expect(updateItem).toHaveBeenCalledWith('1', { name: 'B' });
    expect(onRefresh).toHaveBeenCalled();
    expect(result.current.success).toBe('Element updated.');
  });

  it('update — erreur', async () => {
    const updateItem = vi.fn(async () => {
      throw new Error('update failed');
    });
    const config = buildConfig({ updateItem });
    const { result } = renderHook(() =>
      useCrudResource<Item, CreatePayload, UpdatePayload>(config),
    { wrapper: makeWrapper() });

    await act(async () => {
      const r = await result.current.update('1', { name: 'B' });
      expect(r.ok).toBe(false);
      expect(r.error).toBe('update failed');
    });
    expect(result.current.error).toBe('update failed');
  });

  it('remove — succès', async () => {
    const deleteItem = vi.fn(async () => ({}));
    const onRefresh = vi.fn(async () => undefined);
    const config = buildConfig({ deleteItem, onRefresh });
    const { result } = renderHook(() =>
      useCrudResource<Item, CreatePayload, UpdatePayload>(config),
    { wrapper: makeWrapper() });

    await act(async () => {
      await result.current.remove('1');
    });

    expect(deleteItem).toHaveBeenCalledWith('1');
    expect(onRefresh).toHaveBeenCalled();
    expect(result.current.success).toBe('Element deleted.');
  });

  it('remove — erreur', async () => {
    const deleteItem = vi.fn(async () => {
      throw new Error('delete failed');
    });
    const config = buildConfig({ deleteItem });
    const { result } = renderHook(() =>
      useCrudResource<Item, CreatePayload, UpdatePayload>(config),
    { wrapper: makeWrapper() });

    await act(async () => {
      await result.current.remove('1');
    });
    expect(result.current.error).toBe('delete failed');
  });

  it('clearStatus — réinitialise error et success', async () => {
    const config = buildConfig();
    const { result } = renderHook(() =>
      useCrudResource<Item, CreatePayload, UpdatePayload>(config),
    { wrapper: makeWrapper() });

    await act(async () => {
      await result.current.create({ name: 'X' });
    });
    expect(result.current.success).toBe('Element created.');

    act(() => {
      result.current.clearStatus();
    });
    expect(result.current.success).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it('setItems — modifie les items', () => {
    const config = buildConfig();
    const { result } = renderHook(() =>
      useCrudResource<Item, CreatePayload, UpdatePayload>(config),
    { wrapper: makeWrapper() });

    act(() => {
      result.current.setItems([{ id: 'z', name: 'Z' }]);
    });
    expect(result.current.items).toEqual([{ id: 'z', name: 'Z' }]);
  });
});
