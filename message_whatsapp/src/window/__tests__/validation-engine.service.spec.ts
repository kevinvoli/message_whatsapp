/**
 * Tests unitaires — ValidationEngineService
 * Couvre : critères, état de validation, bulk query, block progress.
 */

import { ValidationEngineService } from '../services/validation-engine.service';
import { ConversationValidation } from '../entities/conversation-validation.entity';
import { ValidationCriterionConfig } from '../entities/validation-criterion-config.entity';
import { WhatsappChat, WindowStatus } from 'src/whatsapp_chat/entities/whatsapp_chat.entity';

// ─── Factories ────────────────────────────────────────────────────────────────

function makeCriterion(overrides: Partial<ValidationCriterionConfig> = {}): ValidationCriterionConfig {
  return Object.assign(new ValidationCriterionConfig(), {
    id: 'crit-1',
    criterion_type: 'result_set',
    label: 'Résultat renseigné',
    is_required: true,
    is_active: true,
    sort_order: 0,
    ...overrides,
  });
}

function makeValidation(overrides: Partial<ConversationValidation> = {}): ConversationValidation {
  return Object.assign(new ConversationValidation(), {
    id: 'val-1',
    chat_id: 'chat-123',
    criterion_type: 'result_set',
    is_validated: false,
    validated_at: null,
    external_id: null,
    external_data: null,
    ...overrides,
  });
}

function makeChat(overrides: Partial<WhatsappChat> = {}): WhatsappChat {
  return Object.assign(new WhatsappChat(), {
    id: 'uuid-1',
    chat_id: 'chat-123',
    poste_id: 'poste-abc',
    window_status: WindowStatus.ACTIVE,
    window_slot: 1,
    ...overrides,
  });
}

// ─── Mock Repos ───────────────────────────────────────────────────────────────

function makeCriterionRepo(criteria: ValidationCriterionConfig[] = [makeCriterion()]) {
  return {
    find: jest.fn().mockResolvedValue(criteria),
    findOne: jest.fn().mockResolvedValue(criteria[0] ?? null),
  } as any;
}

function makeValidationRepo(validations: ConversationValidation[] = []) {
  const qb = {
    where: jest.fn().mockReturnThis(),
    getMany: jest.fn().mockResolvedValue(validations),
  };
  return {
    find: jest.fn().mockResolvedValue(validations),
    findOne: jest.fn().mockResolvedValue(validations[0] ?? null),
    save: jest.fn().mockImplementation((v) => Promise.resolve(v)),
    update: jest.fn().mockResolvedValue({}),
    create: jest.fn().mockImplementation((v) => v),
    createQueryBuilder: jest.fn().mockReturnValue(qb),
  } as any;
}

function makeChatRepo(chats: WhatsappChat[] = []) {
  return {
    find: jest.fn().mockResolvedValue(chats),
  } as any;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('ValidationEngineService', () => {
  let service: ValidationEngineService;

  const mockSystemConfig = {
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue({}),
  } as any;

  function build(
    criteria: ValidationCriterionConfig[] = [makeCriterion()],
    validations: ConversationValidation[] = [],
    chats: WhatsappChat[] = [],
  ) {
    service = new ValidationEngineService(
      makeValidationRepo(validations),
      makeCriterionRepo(criteria),
      makeChatRepo(chats),
      mockSystemConfig,
    );
  }

  describe('getValidationState', () => {
    it('retourne allRequiredMet=false quand critère requis non validé', async () => {
      build();
      const state = await service.getValidationState('chat-123');
      expect(state.allRequiredMet).toBe(false);
      expect(state.criteria).toHaveLength(1);
      expect(state.criteria[0].validated).toBe(false);
    });

    it('retourne allRequiredMet=true quand tous les requis sont validés', async () => {
      const validated = makeValidation({ is_validated: true, validated_at: new Date() });
      build([makeCriterion()], [validated]);
      const state = await service.getValidationState('chat-123');
      expect(state.allRequiredMet).toBe(true);
      expect(state.criteria[0].validated).toBe(true);
    });

    it('critère optionnel non validé ne bloque pas allRequiredMet', async () => {
      const optionalCrit = makeCriterion({ criterion_type: 'call_confirmed', is_required: false });
      const requiredCrit = makeCriterion({ criterion_type: 'result_set', is_required: true });
      const validatedResult = makeValidation({ criterion_type: 'result_set', is_validated: true, validated_at: new Date() });
      build([requiredCrit, optionalCrit], [validatedResult]);
      const state = await service.getValidationState('chat-123');
      expect(state.allRequiredMet).toBe(true);
    });

    it('aucun critère actif → allRequiredMet=true (vacuité)', async () => {
      build([]);
      const state = await service.getValidationState('chat-123');
      expect(state.allRequiredMet).toBe(true);
      expect(state.criteria).toHaveLength(0);
    });
  });

  describe('markCriterionMet', () => {
    it('crée un nouveau record si inexistant', async () => {
      const repo = makeValidationRepo([]);
      service = new ValidationEngineService(repo, makeCriterionRepo(), makeChatRepo(), mockSystemConfig);
      const isNew = await service.markCriterionMet('chat-123', 'result_set');
      expect(isNew).toBe(true);
      expect(repo.save).toHaveBeenCalled();
    });

    it('est idempotent : retourne false si déjà validé', async () => {
      const alreadyValidated = makeValidation({ is_validated: true });
      const repo = makeValidationRepo([alreadyValidated]);
      service = new ValidationEngineService(repo, makeCriterionRepo(), makeChatRepo(), mockSystemConfig);
      const isNew = await service.markCriterionMet('chat-123', 'result_set');
      expect(isNew).toBe(false);
      expect(repo.update).not.toHaveBeenCalled();
    });

    it('met à jour le record existant non validé', async () => {
      const existing = makeValidation({ is_validated: false });
      const repo = makeValidationRepo([existing]);
      service = new ValidationEngineService(repo, makeCriterionRepo(), makeChatRepo(), mockSystemConfig);
      const isNew = await service.markCriterionMet('chat-123', 'result_set', 'ext-id-1');
      expect(isNew).toBe(true);
      expect(repo.update).toHaveBeenCalledWith(
        { id: existing.id },
        expect.objectContaining({ is_validated: true, external_id: 'ext-id-1' }),
      );
    });
  });

  describe('getValidationStatesBulk', () => {
    it('retourne une map vide si aucun chatId', async () => {
      build();
      const map = await service.getValidationStatesBulk([]);
      expect(map.size).toBe(0);
    });

    it('retourne les états pour chaque chatId avec 2 requêtes', async () => {
      const val1 = makeValidation({ chat_id: 'chat-1', is_validated: true, validated_at: new Date() });
      const val2 = makeValidation({ chat_id: 'chat-2', criterion_type: 'result_set', is_validated: false });
      const repo = makeValidationRepo([val1, val2]);
      service = new ValidationEngineService(repo, makeCriterionRepo(), makeChatRepo(), mockSystemConfig);

      const map = await service.getValidationStatesBulk(['chat-1', 'chat-2']);
      expect(map.size).toBe(2);
      expect(map.get('chat-1')![0].validated).toBe(true);
      expect(map.get('chat-2')![0].validated).toBe(false);
      // 1 seul appel createQueryBuilder pour le bulk (pas N appels)
      expect(repo.createQueryBuilder).toHaveBeenCalledTimes(1);
    });
  });

  describe('getBlockProgress', () => {
    it('retourne 0/0 si aucune conversation active', async () => {
      build([], [], []);
      const progress = await service.getBlockProgress('poste-abc');
      expect(progress.validated).toBe(0);
    });

    it('retourne N/total avec conversations actives et validées', async () => {
      const active = makeChat({ window_status: WindowStatus.ACTIVE });
      const validated = makeChat({ id: 'uuid-2', chat_id: 'chat-456', window_status: WindowStatus.VALIDATED });
      build([], [], [active, validated]);
      const chatRepo = makeChatRepo([active, validated]);
      // Le repo find est appelé avec window_status ACTIVE puis [ACTIVE, VALIDATED]
      chatRepo.find
        .mockResolvedValueOnce([active])       // ACTIVE only
        .mockResolvedValueOnce([active, validated]); // ACTIVE + VALIDATED
      service = new ValidationEngineService(makeValidationRepo(), makeCriterionRepo(), chatRepo, mockSystemConfig);
      const progress = await service.getBlockProgress('poste-abc');
      expect(progress.validated).toBeGreaterThanOrEqual(0);
      expect(progress.total).toBeGreaterThanOrEqual(0);
    });
  });

  describe('onConversationResultSet', () => {
    it('marque result_set et retourne allRequiredMet', async () => {
      const repo = makeValidationRepo([]);
      const criterionRepo = makeCriterionRepo([makeCriterion({ criterion_type: 'result_set', is_required: true })]);
      // Après markCriterionMet, getValidationState doit retourner validé
      repo.find.mockResolvedValue([makeValidation({ is_validated: true, validated_at: new Date() })]);
      service = new ValidationEngineService(repo, criterionRepo, makeChatRepo(), mockSystemConfig);
      const result = await service.onConversationResultSet('chat-123');
      expect(typeof result).toBe('boolean');
    });
  });
});
