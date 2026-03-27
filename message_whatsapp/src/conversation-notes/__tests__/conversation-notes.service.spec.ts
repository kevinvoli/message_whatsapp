import { NotFoundException } from '@nestjs/common';
import { ConversationNotesService } from '../conversation-notes.service';
import { ConversationNote } from '../entities/conversation-note.entity';
import { WhatsappCommercial } from 'src/whatsapp_commercial/entities/user.entity';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeNote(overrides: Partial<ConversationNote> = {}): ConversationNote {
  return {
    id: 'note-uuid-1',
    chatId: '33612345678@c.us',
    authorId: 'commercial-uuid-1',
    authorName: 'Alice Dupont',
    authorType: 'commercial',
    content: 'Client très intéressé.',
    createdAt: new Date('2026-01-01T10:00:00Z'),
    updatedAt: new Date('2026-01-01T10:00:00Z'),
    deletedAt: null,
    ...overrides,
  } as ConversationNote;
}

function makeCommercial(overrides: Partial<WhatsappCommercial> = {}): WhatsappCommercial {
  return {
    id: 'commercial-uuid-1',
    name: 'Alice Dupont',
    email: 'alice@example.com',
    ...overrides,
  } as WhatsappCommercial;
}

// ── Mock repositories ─────────────────────────────────────────────────────────

function makeNoteRepo() {
  return {
    find: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    softDelete: jest.fn(),
  };
}

function makeCommercialRepo() {
  return {
    findOne: jest.fn(),
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ConversationNotesService', () => {
  let service: ConversationNotesService;
  let noteRepo: ReturnType<typeof makeNoteRepo>;
  let commercialRepo: ReturnType<typeof makeCommercialRepo>;

  beforeEach(() => {
    noteRepo = makeNoteRepo();
    commercialRepo = makeCommercialRepo();
    service = new ConversationNotesService(noteRepo as any, commercialRepo as any);
    jest.clearAllMocks();
  });

  // ── findByChatId ───────────────────────────────────────────────────────────

  describe('findByChatId', () => {
    it('retourne les notes triées par date ASC', async () => {
      const notes = [makeNote(), makeNote({ id: 'note-uuid-2' })];
      noteRepo.find.mockResolvedValue(notes);

      const result = await service.findByChatId('33612345678@c.us');

      expect(noteRepo.find).toHaveBeenCalledWith({
        where: { chatId: '33612345678@c.us' },
        order: { createdAt: 'ASC' },
      });
      expect(result).toBe(notes);
    });

    it('retourne un tableau vide si aucune note', async () => {
      noteRepo.find.mockResolvedValue([]);

      const result = await service.findByChatId('inconnu@c.us');

      expect(result).toHaveLength(0);
    });
  });

  // ── createByCommercial ─────────────────────────────────────────────────────

  describe('createByCommercial', () => {
    it('crée la note avec le nom du commercial résolu', async () => {
      const commercial = makeCommercial();
      commercialRepo.findOne.mockResolvedValue(commercial);

      const note = makeNote();
      noteRepo.create.mockReturnValue(note);
      noteRepo.save.mockResolvedValue(note);

      const result = await service.createByCommercial(
        '33612345678@c.us',
        'commercial-uuid-1',
        'Client très intéressé.',
      );

      expect(noteRepo.create).toHaveBeenCalledWith({
        chatId: '33612345678@c.us',
        authorId: 'commercial-uuid-1',
        authorName: 'Alice Dupont',
        authorType: 'commercial',
        content: 'Client très intéressé.',
      });
      expect(result).toBe(note);
    });

    it('stocke authorName null si le commercial est introuvable', async () => {
      commercialRepo.findOne.mockResolvedValue(null);

      const note = makeNote({ authorName: null });
      noteRepo.create.mockReturnValue(note);
      noteRepo.save.mockResolvedValue(note);

      await service.createByCommercial('chat@c.us', 'unknown-id', 'Contenu');

      expect(noteRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ authorName: null }),
      );
    });
  });

  // ── createByAdmin ─────────────────────────────────────────────────────────

  describe('createByAdmin', () => {
    it('crée la note avec authorType admin', async () => {
      const note = makeNote({ authorType: 'admin', authorName: 'SuperAdmin' });
      noteRepo.create.mockReturnValue(note);
      noteRepo.save.mockResolvedValue(note);

      const result = await service.createByAdmin(
        '33612345678@c.us',
        'admin-uuid-1',
        'SuperAdmin',
        'Relance nécessaire.',
      );

      expect(noteRepo.create).toHaveBeenCalledWith({
        chatId: '33612345678@c.us',
        authorId: 'admin-uuid-1',
        authorName: 'SuperAdmin',
        authorType: 'admin',
        content: 'Relance nécessaire.',
      });
      expect(result).toBe(note);
    });

    it('accepte authorName null (admin anonyme)', async () => {
      const note = makeNote({ authorType: 'admin', authorName: null });
      noteRepo.create.mockReturnValue(note);
      noteRepo.save.mockResolvedValue(note);

      await service.createByAdmin('chat@c.us', 'admin-id', null, 'Note');

      expect(noteRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ authorName: null, authorType: 'admin' }),
      );
    });
  });

  // ── softDelete ────────────────────────────────────────────────────────────

  describe('softDelete', () => {
    it('supprime softement la note existante', async () => {
      noteRepo.softDelete.mockResolvedValue({ affected: 1 });

      await expect(service.softDelete('note-uuid-1')).resolves.toBeUndefined();
      expect(noteRepo.softDelete).toHaveBeenCalledWith('note-uuid-1');
    });

    it('lève NotFoundException si la note est introuvable', async () => {
      noteRepo.softDelete.mockResolvedValue({ affected: 0 });

      await expect(service.softDelete('fantome')).rejects.toThrow(NotFoundException);
    });
  });
});
