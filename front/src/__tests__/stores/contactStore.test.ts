import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useContactStore } from '@/store/contactStore';
import type { CallLog, Contact } from '@/types/chat';

vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

function makeContact(overrides: Partial<Contact> = {}): Contact {
  return {
    id: 'contact-1',
    name: 'John',
    contact: '+33612345678',
    chat_id: 'chat-1',
    is_active: true,
    call_status: 'à_appeler',
    call_count: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeCallLog(overrides: Partial<CallLog> = {}): CallLog {
  return {
    id: 'log-1',
    contact_id: 'contact-1',
    commercial_id: 'commercial-1',
    commercial_name: 'Bob',
    called_at: new Date(),
    call_status: 'appelé',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('useContactStore', () => {
  beforeEach(() => {
    useContactStore.setState({
      socket: null,
      selectedContactDetail: null,
      isLoadingDetail: false,
      callLogs: {},
    });
  });

  it('a un état initial vide', () => {
    const state = useContactStore.getState();
    expect(state.socket).toBeNull();
    expect(state.selectedContactDetail).toBeNull();
    expect(state.isLoadingDetail).toBe(false);
    expect(state.callLogs).toEqual({});
  });

  it('setSocket stocke la socket', () => {
    const fakeSocket = { emit: vi.fn() };
    useContactStore.getState().setSocket(fakeSocket as never);
    expect(useContactStore.getState().socket).toBe(fakeSocket);
  });

  it('setSelectedContactDetail met le contact et reset isLoadingDetail', () => {
    useContactStore.setState({ isLoadingDetail: true });
    const contact = makeContact();
    useContactStore.getState().setSelectedContactDetail(contact);
    const state = useContactStore.getState();
    expect(state.selectedContactDetail).toEqual(contact);
    expect(state.isLoadingDetail).toBe(false);
  });

  it('setSelectedContactDetail émet call_logs:get si une socket existe', () => {
    const emit = vi.fn();
    useContactStore.setState({ socket: { emit } as never });
    const contact = makeContact({ id: 'contact-42' });
    useContactStore.getState().setSelectedContactDetail(contact);
    expect(emit).toHaveBeenCalledWith('call_logs:get', { contact_id: 'contact-42' });
  });

  it('upsertContact merge si l\'id correspond au contact sélectionné', () => {
    const contact = makeContact({ id: 'c1', name: 'Old' });
    useContactStore.setState({ selectedContactDetail: contact });
    useContactStore.getState().upsertContact({ id: 'c1', name: 'New' });
    expect(useContactStore.getState().selectedContactDetail?.name).toBe('New');
  });

  it('upsertContact ne fait rien si aucun contact sélectionné', () => {
    useContactStore.getState().upsertContact({ id: 'c1', name: 'Test' });
    expect(useContactStore.getState().selectedContactDetail).toBeNull();
  });

  it('upsertContact ne fait rien si l\'id ne correspond pas', () => {
    const contact = makeContact({ id: 'c1', name: 'Original' });
    useContactStore.setState({ selectedContactDetail: contact });
    useContactStore.getState().upsertContact({ id: 'c2', name: 'Other' });
    expect(useContactStore.getState().selectedContactDetail?.name).toBe('Original');
  });

  it('removeContact vide selectedContactDetail si l\'id correspond', () => {
    const contact = makeContact({ id: 'c1' });
    useContactStore.setState({ selectedContactDetail: contact });
    useContactStore.getState().removeContact('c1');
    expect(useContactStore.getState().selectedContactDetail).toBeNull();
  });

  it('removeContact préserve selectedContactDetail si l\'id ne correspond pas', () => {
    const contact = makeContact({ id: 'c1' });
    useContactStore.setState({ selectedContactDetail: contact });
    useContactStore.getState().removeContact('other');
    expect(useContactStore.getState().selectedContactDetail).toEqual(contact);
  });

  it('setCallLogs stocke les logs sous l\'id du contact', () => {
    const logs = [makeCallLog({ id: 'l1' }), makeCallLog({ id: 'l2' })];
    useContactStore.getState().setCallLogs('contact-1', logs);
    expect(useContactStore.getState().callLogs['contact-1']).toEqual(logs);
  });

  it('addCallLog ajoute le log en tête de liste', () => {
    const initial = [makeCallLog({ id: 'old' })];
    useContactStore.setState({ callLogs: { 'contact-1': initial } });
    const newLog = makeCallLog({ id: 'new', contact_id: 'contact-1' });
    useContactStore.getState().addCallLog(newLog);
    const updated = useContactStore.getState().callLogs['contact-1'];
    expect(updated).toHaveLength(2);
    expect(updated[0].id).toBe('new');
    expect(updated[1].id).toBe('old');
  });

  it('addCallLog crée la liste si vide', () => {
    const log = makeCallLog({ id: 'first', contact_id: 'contact-99' });
    useContactStore.getState().addCallLog(log);
    expect(useContactStore.getState().callLogs['contact-99']).toEqual([log]);
  });

  it('reset remet l\'état initial', () => {
    useContactStore.setState({
      selectedContactDetail: makeContact(),
      isLoadingDetail: true,
      callLogs: { c1: [makeCallLog()] },
    });
    useContactStore.getState().reset();
    const state = useContactStore.getState();
    expect(state.selectedContactDetail).toBeNull();
    expect(state.isLoadingDetail).toBe(false);
    expect(state.callLogs).toEqual({});
  });

  it('selectContactByChatId ne fait rien si aucune socket', () => {
    useContactStore.setState({ socket: null });
    useContactStore.getState().selectContactByChatId('chat-1');
    expect(useContactStore.getState().isLoadingDetail).toBe(false);
  });

  it('selectContactByChatId émet contact:get_detail et active isLoadingDetail', () => {
    const emit = vi.fn();
    useContactStore.setState({ socket: { emit } as never });
    useContactStore.getState().selectContactByChatId('chat-42');
    expect(emit).toHaveBeenCalledWith('contact:get_detail', { chat_id: 'chat-42' });
    expect(useContactStore.getState().isLoadingDetail).toBe(true);
  });

  it('selectContactByChatId ne réémet pas si même chat sélectionné', () => {
    const emit = vi.fn();
    const contact = makeContact({ chat_id: 'chat-A' });
    useContactStore.setState({ socket: { emit } as never, selectedContactDetail: contact });
    useContactStore.getState().selectContactByChatId('chat-A');
    expect(emit).not.toHaveBeenCalled();
  });
});
