import { Logger } from '@nestjs/common';
import { BusinessMenuService } from '../business-menu.service';
import { Contact, ClientCategory } from '../entities/contact.entity';
import { CommercialIdentityMapping } from 'src/integration/entities/commercial-identity-mapping.entity';
import { SegmentedClient } from 'src/order-read/services/order-segmentation-read.service';

// ─── Factories ────────────────────────────────────────────────────────────────

function makeContact(overrides: Partial<Contact> = {}): Contact {
  return Object.assign(new Contact(), {
    id:              'contact-1',
    name:            'Kouassi Aya',
    phone:           '0700000001',
    chat_id:         'chat-wa-1',
    client_category: 'jamais_commande',
    ...overrides,
  });
}

function makeSegmentedClient(overrides: Partial<SegmentedClient> = {}): SegmentedClient {
  return {
    idClientDb2:     1,
    contactId:       'contact-1',
    phoneNormalized: '0700000001',
    lastOrderDate:   new Date('2026-01-01'),
    ...overrides,
  };
}

// ─── Mock helpers ─────────────────────────────────────────────────────────────

function makeSegmentationService(
  withoutDelivery: SegmentedClient[] = [],
  cancelled:       SegmentedClient[] = [],
  dormant:         SegmentedClient[] = [],
) {
  return {
    findWithoutDeliveryClients: jest.fn().mockResolvedValue(withoutDelivery),
    findCancelledOrderClients:  jest.fn().mockResolvedValue(cancelled),
    findDormantClients:         jest.fn().mockResolvedValue(dormant),
    resolveIdCommercialDb2:     jest.fn().mockResolvedValue(7),
  } as any;
}

function makeContactService(contacts: Contact[] = []) {
  return {
    findByCategory: jest.fn().mockResolvedValue(contacts),
    findInactive:   jest.fn().mockResolvedValue(contacts),
  } as any;
}

function makeCommercialMappingRepo(externalId: number | null = 7) {
  return {
    findOne: jest.fn().mockResolvedValue(
      externalId !== null
        ? Object.assign(new CommercialIdentityMapping(), { external_id: externalId })
        : null,
    ),
  } as any;
}

function makeContactRepo(contacts: Contact[] = [makeContact()]) {
  return {
    find: jest.fn().mockResolvedValue(contacts),
  } as any;
}

function buildService(
  dbAvailable         = true,
  segmentation        = makeSegmentationService(),
  contactService      = makeContactService(),
  commercialMappingRepo = makeCommercialMappingRepo(),
  contactRepo         = makeContactRepo(),
): BusinessMenuService {
  jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);

  return new BusinessMenuService(dbAvailable, segmentation, contactService, commercialMappingRepo, contactRepo);
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('BusinessMenuService', () => {

  describe('getProspects', () => {

    it('utilise DB2 si disponible et mapping commercial trouvé', async () => {
      const seg = makeSegmentationService([makeSegmentedClient()]);
      const svc = buildService(true, seg);
      const result = await svc.getProspects('commercial-uuid-1');
      expect(seg.findWithoutDeliveryClients).toHaveBeenCalledWith(7, 50);
      expect(result.length).toBe(1);
      expect(result[0].phone).toBe('0700000001');
    });

    it('fallback DB1 si DB2 non disponible', async () => {
      const contactSvc = makeContactService([makeContact()]);
      const svc        = buildService(false, makeSegmentationService(), contactSvc);
      const result     = await svc.getProspects('commercial-uuid-1');
      expect(contactSvc.findByCategory).toHaveBeenCalledWith(
        'commercial-uuid-1',
        ['jamais_commande', 'commande_sans_livraison'],
        50,
      );
      expect(result.length).toBe(1);
    });

    it('fallback DB1 si pas de mapping commercial en DB2', async () => {
      const contactSvc = makeContactService([makeContact()]);
      const svc        = buildService(true, makeSegmentationService(), contactSvc, makeCommercialMappingRepo(null));
      const result     = await svc.getProspects('commercial-uuid-1');
      expect(contactSvc.findByCategory).toHaveBeenCalled();
      expect(result.length).toBe(1);
    });
  });

  describe('getAnnulee', () => {

    it('utilise DB2 si disponible', async () => {
      const seg = makeSegmentationService([], [makeSegmentedClient()]);
      const svc = buildService(true, seg);
      const result = await svc.getAnnulee('commercial-uuid-1');
      expect(seg.findCancelledOrderClients).toHaveBeenCalledWith(7, 50);
      expect(result.length).toBe(1);
    });

    it('fallback DB1 si DB2 indisponible', async () => {
      const contactSvc = makeContactService([makeContact({ client_category: ClientCategory.COMMANDE_ANNULEE })]);
      const svc        = buildService(false, makeSegmentationService(), contactSvc);
      await svc.getAnnulee('commercial-uuid-1');
      expect(contactSvc.findByCategory).toHaveBeenCalledWith(
        'commercial-uuid-1',
        ['commande_annulee'],
        50,
      );
    });
  });

  describe('getAnciennes', () => {

    it('utilise DB2 si disponible', async () => {
      const seg = makeSegmentationService([], [], [makeSegmentedClient()]);
      const svc = buildService(true, seg);
      const result = await svc.getAnciennes('commercial-uuid-1', 60);
      expect(seg.findDormantClients).toHaveBeenCalledWith(7, 60, 50);
      expect(result.length).toBe(1);
    });

    it('fallback DB1 si DB2 indisponible', async () => {
      const contactSvc = makeContactService([makeContact()]);
      const svc        = buildService(false, makeSegmentationService(), contactSvc);
      await svc.getAnciennes('commercial-uuid-1', 60);
      expect(contactSvc.findInactive).toHaveBeenCalledWith('commercial-uuid-1', 60, 50);
    });
  });

  describe('enrichissement DB1', () => {

    it('filtre les résultats sans numéro de téléphone', async () => {
      const segClient = makeSegmentedClient({ phoneNormalized: null, contactId: null });
      const seg       = makeSegmentationService([segClient]);
      const svc       = buildService(true, seg, makeContactService(), makeCommercialMappingRepo(), makeContactRepo([]));
      const result    = await svc.getProspects('commercial-uuid-1');
      expect(result.length).toBe(0);
    });

    it('enrichit avec le nom et le chat_id depuis DB1', async () => {
      const seg     = makeSegmentationService([makeSegmentedClient({ contactId: 'contact-1' })]);
      const contact = makeContact({ name: 'Bamba Kouamé', chat_id: 'chat-wa-enrichi' });
      const svc     = buildService(true, seg, makeContactService(), makeCommercialMappingRepo(), makeContactRepo([contact]));
      const result  = await svc.getProspects('commercial-uuid-1');
      expect(result[0].name).toBe('Bamba Kouamé');
      expect(result[0].chat_id).toBe('chat-wa-enrichi');
    });
  });
});
