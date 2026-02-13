import { useEffect, useMemo, useState } from 'react';

type CrudConfig<TItem, TCreate, TUpdate> = {
  initialItems: TItem[];
  onRefresh: () => Promise<void> | void;
  createItem: (payload: TCreate) => Promise<unknown>;
  updateItem: (id: string, payload: TUpdate) => Promise<unknown>;
  deleteItem: (id: string) => Promise<unknown>;
  getId: (item: TItem) => string;
};

type OperationResult = {
  ok: boolean;
  error?: string;
};

export function useCrudResource<TItem, TCreate, TUpdate>(
  config: CrudConfig<TItem, TCreate, TUpdate>,
) {
  const [items, setItems] = useState<TItem[]>(config.initialItems);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    setItems(config.initialItems);
  }, [config.initialItems]);

  const clearStatus = () => {
    setError(null);
    setSuccess(null);
  };

  const runOperation = async (
    operation: () => Promise<void>,
    successMessage: string,
  ): Promise<OperationResult> => {
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      await operation();
      setSuccess(successMessage);
      return { ok: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Operation failed.';
      setError(message);
      return { ok: false, error: message };
    } finally {
      setLoading(false);
    }
  };

  const create = (payload: TCreate, successMessage = 'Element created.') =>
    runOperation(async () => {
      await config.createItem(payload);
      await config.onRefresh();
    }, successMessage);

  const update = (
    id: string,
    payload: TUpdate,
    successMessage = 'Element updated.',
  ) =>
    runOperation(async () => {
      await config.updateItem(id, payload);
      await config.onRefresh();
    }, successMessage);

  const remove = (id: string, successMessage = 'Element deleted.') =>
    runOperation(async () => {
      await config.deleteItem(id);
      await config.onRefresh();
    }, successMessage);

  const byId = useMemo(() => {
    const map = new Map<string, TItem>();
    for (const item of items) {
      map.set(config.getId(item), item);
    }
    return map;
  }, [config, items]);

  return {
    items,
    setItems,
    loading,
    error,
    success,
    clearStatus,
    create,
    update,
    remove,
    byId,
  };
}
