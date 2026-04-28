/**
 * Tests unitaires — ClientDossierService.upsertByChatId
 * Couvre : création dossier, mise à jour, déclenchement upsert follow-up.
 */

import { ClientDossierService } from '../client-dossier.service';
import { ClientDossier } from '../entities/client-dossier.entity';
import { Contact } from 'src/contact/entities/contact.entity';
import { WhatsappChat } from 'src/whatsapp_chat/entities/whatsapp_chat.entity';
import { UpsertDossierDto } from '../dto/upsert-dossier.dto';

// ─── Factories ────────────────────────────────────────────────────────────────

function makeContact(overrides: Partial<Contact> = {}): Contact {
  return Object.assign(new Contact(), { id: 'contact-1', chat_id: 'chat-abc', phone: '0700000001', ...overrides });
}

function makeDossier(overrides: Partial<ClientDossier> = {}): ClientDossier {
  return Object.assign(new ClientDossier(), { id: 'dossier-1', contactId: 'contact-1', followUpAt: null, ...overrides });
}

function makeChat(overrides: Partial<WhatsappChat> = {}): WhatsappChat {
  return Object.assign(new WhatsappChat(), { id: 'chat-uuid-1', chat_id: 'chat-abc', ...overrides });
}

// ─── Mock repos ───────────────────────────────────────────────────────────────

function makeContactRepo(contact: Contact | null) {
  return { findOne: jest.fn().mockResolvedValue(contact) } as any;
}

function makeDossierRepo(dossier: ClientDossier | null) {
  return {
    findOne: jest.fn().mockResolvedValue(dossier),
    create:  jest.fn().mockImplementation((v) => Object.assign(new ClientDossier(), v)),
    save:    jest.fn().mockImplementation((v) => Promise.resolve(v)),
  } as any;
}

function makeChatRepo(chat: WhatsappChat | null) {
  return { findOne: jest.fn().mockResolvedValue(chat) } as any;
}

function makeFollowUpService() {
  return { upsertFromDossierOrReport: jest.fn().mockResolvedValue({ isNew: true }) } as any;
}

function buildService(contact: Contact | null, dossier: ClientDossier | null, chat: WhatsappChat | null = makeChat()) {
  const dossierRepo = makeDossierRepo(dossier);
  const followUpService = makeFollowUpService();

  const service = new ClientDossierService(
    makeContactRepo(contact),
    { find: jest.fn().mockResolvedValue([]), findOne: jest.fn().mockResolvedValue(null) } as any,
    { find: jest.fn().mockResolvedValue([]) } as any,
    makeChatRepo(chat),
    { find: jest.fn().mockResolvedValue([]) } as any,
    dossierRepo,
    { find: jest.fn().mockResolvedValue([]), create: jest.fn(), save: jest.fn() } as any,
    { findOne: jest.fn().mockResolvedValue(null) } as any,
    { sendNumberToCall: jest.fn() } as any,
    followUpService,
  );

  return { service, dossierRepo, followUpService };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('ClientDossierService.upsertByChatId', () => {
  const chatId = 'chat-abc';
  const commercialId = 'commercial-1';

  it('crée un nouveau dossier si inexistant', async () => {
    const contact = makeContact();
    const { service, dossierRepo } = buildService(contact, null);
    await service.upsertByChatId(chatId, { fullName: 'Jean Dupont' } as UpsertDossierDto, commercialId);
    expect(dossierRepo.create).toHaveBeenCalled();
    expect(dossierRepo.save).toHaveBeenCalled();
  });

  it('met à jour un dossier existant', async () => {
    const contact = makeContact();
    const dossier = makeDossier();
    const { service, dossierRepo } = buildService(contact, dossier);
    await service.upsertByChatId(chatId, { fullName: 'Marie Martin' } as UpsertDossierDto, commercialId);
    expect(dossierRepo.save).toHaveBeenCalledWith(expect.objectContaining({ fullName: 'Marie Martin' }));
  });

  it('déclenche upsertFromDossierOrReport si followUpAt renseigné', async () => {
    const contact = makeContact();
    const dossier = makeDossier();
    const { service, followUpService } = buildService(contact, dossier);
    await service.upsertByChatId(
      chatId,
      { followUpAt: '2026-05-10T09:00:00Z', nextAction: 'rappeler' } as UpsertDossierDto,
      commercialId,
    );
    expect(followUpService.upsertFromDossierOrReport).toHaveBeenCalledWith(
      expect.objectContaining({
        contact_id:    contact.id,
        commercial_id: commercialId,
      }),
    );
  });

  it('ne déclenche pas upsertFromDossierOrReport si followUpAt absent', async () => {
    const contact = makeContact();
    const dossier = makeDossier();
    const { service, followUpService } = buildService(contact, dossier);
    await service.upsertByChatId(chatId, { fullName: 'Test' } as UpsertDossierDto, commercialId);
    expect(followUpService.upsertFromDossierOrReport).not.toHaveBeenCalled();
  });

  it('ne déclenche pas upsertFromDossierOrReport si commercialId absent', async () => {
    const contact = makeContact();
    const dossier = makeDossier();
    const { service, followUpService } = buildService(contact, dossier);
    await service.upsertByChatId(chatId, { followUpAt: '2026-05-10T09:00:00Z' } as UpsertDossierDto);
    expect(followUpService.upsertFromDossierOrReport).not.toHaveBeenCalled();
  });

  it('ne lève pas d\'exception si upsertFromDossierOrReport échoue', async () => {
    const contact = makeContact();
    const dossier = makeDossier();
    const { service, followUpService } = buildService(contact, dossier);
    followUpService.upsertFromDossierOrReport.mockRejectedValue(new Error('DB error'));
    await expect(
      service.upsertByChatId(chatId, { followUpAt: '2026-05-10T09:00:00Z' } as UpsertDossierDto, commercialId),
    ).resolves.not.toThrow();
  });
});
