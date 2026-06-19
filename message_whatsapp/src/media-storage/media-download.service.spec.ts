import { getRepositoryToken } from '@nestjs/typeorm';
import { MediaDownloadService } from './media-download.service';
import { MediaStorageService } from './media-storage.service';
import { CommunicationMetaService } from 'src/communication_whapi/communication_meta.service';
import { CommunicationWhapiService } from 'src/communication_whapi/communication_whapi.service';
import { CommunicationMessengerService } from 'src/communication_whapi/communication_messenger.service';
import { ChannelService } from 'src/channel/channel.service';
import { WhatsappMedia } from 'src/whatsapp_media/entities/whatsapp_media.entity';
import { WhapiChannel } from 'src/channel/entities/channel.entity';
import { createTestingModule } from '../../test/helpers/create-test-module';
import { mockRepository } from '../../test/helpers/mock-repository';
import type { MockRepository } from '../../test/helpers/mock-repository';

// ─── Factories locales ────────────────────────────────────────────────────────

function makeChannel(overrides: Partial<WhapiChannel> = {}): WhapiChannel {
  return {
    id: 'chan-uuid-001',
    channel_id: 'channel-test-001',
    token: 'token-test',
    provider: 'whapi',
    external_id: null,
    label: null,
    tenant_id: null,
    webhook_secret: null,
    verify_token: null,
    poste_id: null,
    ...overrides,
  } as WhapiChannel;
}

function makeMedia(overrides: Partial<WhatsappMedia> = {}): WhatsappMedia {
  return {
    id: 'media-uuid-001',
    media_id: 'whapi-media-001',
    whapi_media_id: 'whapi-media-001',
    provider: 'whapi',
    provider_media_id: null,
    media_type: 'image',
    mime_type: 'image/jpeg',
    view_once: 'false',
    local_url: null,
    local_path: null,
    provider_url_expired: false,
    downloaded_at: null,
    tenant_id: null,
    channel: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    ...overrides,
  } as WhatsappMedia;
}

// ─── Suite principale ─────────────────────────────────────────────────────────

describe('MediaDownloadService', () => {
  let service: MediaDownloadService;
  let mediaRepo: MockRepository<WhatsappMedia>;
  let mockMetaService: { downloadMedia: jest.Mock };
  let mockWhapiService: { downloadMedia: jest.Mock };
  let mockMessengerService: { downloadMedia: jest.Mock };
  let mockChannelService: { findOne: jest.Mock };
  let mockMediaStorageService: { store: jest.Mock; deleteFile: jest.Mock };

  const fakeBuffer = Buffer.from('fake-image-data');

  beforeEach(async () => {
    jest.clearAllMocks();

    mediaRepo = mockRepository<WhatsappMedia>();
    mockMetaService = { downloadMedia: jest.fn() };
    mockWhapiService = { downloadMedia: jest.fn() };
    mockMessengerService = { downloadMedia: jest.fn() };
    mockChannelService = { findOne: jest.fn() };
    mockMediaStorageService = { store: jest.fn(), deleteFile: jest.fn() };

    const module = await createTestingModule([
      MediaDownloadService,
      { provide: getRepositoryToken(WhatsappMedia), useValue: mediaRepo },
      { provide: CommunicationMetaService, useValue: mockMetaService },
      { provide: CommunicationWhapiService, useValue: mockWhapiService },
      { provide: CommunicationMessengerService, useValue: mockMessengerService },
      { provide: ChannelService, useValue: mockChannelService },
      { provide: MediaStorageService, useValue: mockMediaStorageService },
    ]);

    service = module.get<MediaDownloadService>(MediaDownloadService);
  });

  // ─── Idempotence (local_path déjà présent) ────────────────────────────────

  it('idempotence : local_path déjà présent → skip sans appel provider', async () => {
    const media = makeMedia({ local_path: '/uploads/media/2026/06/10/default/media-uuid-001.jpg' });

    await service.downloadForMedia(media);

    expect(mockWhapiService.downloadMedia).not.toHaveBeenCalled();
    expect(mockMetaService.downloadMedia).not.toHaveBeenCalled();
    expect(mediaRepo.update).not.toHaveBeenCalled();
  });

  it('idempotence : appeler downloadForMedia deux fois sur le même média → update appelé une seule fois', async () => {
    const channel = makeChannel();
    const media = makeMedia({ channel });
    mockWhapiService.downloadMedia.mockResolvedValue({ buffer: fakeBuffer, mimeType: 'image/jpeg' });
    mockMediaStorageService.store.mockResolvedValue({
      localPath: '/uploads/media/2026/06/10/default/media-uuid-001.jpg',
      localUrl: '/uploads/media/2026/06/10/default/media-uuid-001.jpg',
    });
    mediaRepo.update.mockResolvedValue({ affected: 1 });

    await service.downloadForMedia(media);

    // Simuler que local_path est maintenant défini (persisté)
    media.local_path = '/uploads/media/2026/06/10/default/media-uuid-001.jpg';
    await service.downloadForMedia(media);

    expect(mediaRepo.update).toHaveBeenCalledTimes(1);
    expect(mockWhapiService.downloadMedia).toHaveBeenCalledTimes(1);
  });

  // ─── URL provider expirée ─────────────────────────────────────────────────

  it('provider_url_expired = true → skip sans appel provider', async () => {
    const media = makeMedia({ provider_url_expired: true });

    await service.downloadForMedia(media);

    expect(mockWhapiService.downloadMedia).not.toHaveBeenCalled();
    expect(mediaRepo.update).not.toHaveBeenCalled();
  });

  // ─── Channel introuvable ──────────────────────────────────────────────────

  it('channel introuvable → skip, warn loggué, pas de crash', async () => {
    const media = makeMedia({ channel: null });
    mediaRepo.findOne.mockResolvedValue(null);

    await expect(service.downloadForMedia(media)).resolves.toBeUndefined();
    expect(mockWhapiService.downloadMedia).not.toHaveBeenCalled();
  });

  // ─── Téléchargement réussi (provider whapi) ───────────────────────────────

  it('provider whapi : téléchargement réussi → local_url mis à jour en base', async () => {
    const channel = makeChannel({ provider: 'whapi', channel_id: 'ch-001' });
    const media = makeMedia({ channel, whapi_media_id: 'whapi-media-001' });
    mockWhapiService.downloadMedia.mockResolvedValue({ buffer: fakeBuffer, mimeType: 'image/jpeg' });
    mockMediaStorageService.store.mockResolvedValue({
      localPath: '/uploads/media/2026/06/10/default/media-uuid-001.jpg',
      localUrl: '/uploads/media/2026/06/10/default/media-uuid-001.jpg',
    });
    mediaRepo.update.mockResolvedValue({ affected: 1 });

    await service.downloadForMedia(media);

    expect(mockWhapiService.downloadMedia).toHaveBeenCalledTimes(1);
    expect(mockMediaStorageService.store).toHaveBeenCalledTimes(1);
    expect(mediaRepo.update).toHaveBeenCalledWith(
      media.id,
      expect.objectContaining({
        local_url: '/uploads/media/2026/06/10/default/media-uuid-001.jpg',
        local_path: '/uploads/media/2026/06/10/default/media-uuid-001.jpg',
        downloaded_at: expect.any(Date),
      }),
    );
  });

  // ─── Téléchargement réussi (provider meta) ────────────────────────────────

  it('provider meta : téléchargement réussi → local_url mis à jour en base', async () => {
    const channel = makeChannel({ provider: 'meta', token: 'meta-token', channel_id: 'ch-meta-001' });
    const media = makeMedia({
      channel,
      provider: 'meta',
      provider_media_id: 'meta-media-id-001',
    });
    mockMetaService.downloadMedia.mockResolvedValue({ buffer: fakeBuffer, mimeType: 'image/png' });
    mockMediaStorageService.store.mockResolvedValue({
      localPath: '/uploads/media/2026/06/10/default/media-uuid-001.png',
      localUrl: '/uploads/media/2026/06/10/default/media-uuid-001.png',
    });
    mediaRepo.update.mockResolvedValue({ affected: 1 });

    await service.downloadForMedia(media);

    expect(mockMetaService.downloadMedia).toHaveBeenCalledTimes(1);
    expect(mediaRepo.update).toHaveBeenCalledWith(
      media.id,
      expect.objectContaining({ local_url: expect.stringContaining('/uploads/media/') }),
    );
  });

  // ─── Provider retourne null (URL expirée) ─────────────────────────────────

  it('provider retourne null → média marqué provider_url_expired = true', async () => {
    const channel = makeChannel();
    const media = makeMedia({ channel });
    mockWhapiService.downloadMedia.mockResolvedValue(null);
    mediaRepo.update.mockResolvedValue({ affected: 1 });

    await service.downloadForMedia(media);

    expect(mediaRepo.update).toHaveBeenCalledWith(media.id, { provider_url_expired: true });
    expect(mockMediaStorageService.store).not.toHaveBeenCalled();
  });

  // ─── Provider whapi sans whapi_media_id ──────────────────────────────────

  it('provider whapi sans whapi_media_id → skip, pas de crash', async () => {
    const channel = makeChannel();
    const media = makeMedia({ channel, whapi_media_id: '' });
    (media as WhatsappMedia & { whapi_media_id: string | undefined }).whapi_media_id = undefined as unknown as string;

    await expect(service.downloadForMedia(media)).resolves.toBeUndefined();
    expect(mockWhapiService.downloadMedia).not.toHaveBeenCalled();
  });

  // ─── Erreur HTTP (exception inattendue) ───────────────────────────────────

  it('erreur HTTP du provider → pas de crash, exception absorbée', async () => {
    const channel = makeChannel();
    const media = makeMedia({ channel });
    mockWhapiService.downloadMedia.mockRejectedValue(new Error('HTTP 503 Service Unavailable'));

    await expect(service.downloadForMedia(media)).resolves.toBeUndefined();
    expect(mediaRepo.update).not.toHaveBeenCalledWith(
      media.id,
      expect.objectContaining({ local_url: expect.anything() }),
    );
  });

  // ─── Provider inconnu ────────────────────────────────────────────────────

  it('provider inconnu → skip sans appel à aucun service provider', async () => {
    const channel = makeChannel({ provider: 'telegram' });
    const media = makeMedia({ channel, provider: 'telegram' });

    await service.downloadForMedia(media);

    expect(mockWhapiService.downloadMedia).not.toHaveBeenCalled();
    expect(mockMetaService.downloadMedia).not.toHaveBeenCalled();
    expect(mockMessengerService.downloadMedia).not.toHaveBeenCalled();
    expect(mediaRepo.update).not.toHaveBeenCalled();
  });

  // ─── Channel chargé depuis la DB si non résolu dans l'entité ─────────────

  it('channel null dans media → chargé depuis la DB via findOne', async () => {
    const channel = makeChannel();
    const media = makeMedia({ channel: null });
    mediaRepo.findOne.mockResolvedValue({ ...media, channel });
    mockWhapiService.downloadMedia.mockResolvedValue({ buffer: fakeBuffer, mimeType: 'image/jpeg' });
    mockMediaStorageService.store.mockResolvedValue({
      localPath: '/uploads/media/2026/06/10/default/media-uuid-001.jpg',
      localUrl: '/uploads/media/2026/06/10/default/media-uuid-001.jpg',
    });
    mediaRepo.update.mockResolvedValue({ affected: 1 });

    await service.downloadForMedia(media);

    expect(mediaRepo.findOne).toHaveBeenCalledTimes(1);
    expect(mockWhapiService.downloadMedia).toHaveBeenCalledTimes(1);
  });

  // ─── Détection N+1 ───────────────────────────────────────────────────────

  it('pas de N+1 : downloadForMedia appelle findOne au plus une fois par média', async () => {
    const media = makeMedia({ channel: null });
    mediaRepo.findOne.mockResolvedValue(null);

    await service.downloadForMedia(media);

    expect(mediaRepo.findOne).toHaveBeenCalledTimes(1);
  });
});
