import { Test, TestingModule } from '@nestjs/testing';
import { AssignmentService } from './assignment.service';
import { WhatsappCommercial } from 'src/whatsapp_commercial/entities/user.entity';
import { QueuePosition } from '../entities/queue-position.entity';

describe('AssignmentService', () => {
  let service: AssignmentService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [AssignmentService],
    }).compile();

    service = module.get<AssignmentService>(AssignmentService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findNextOnlineAgent', () => {
    it('should return the first agent in the queue', () => {
      const agent1 = { id: '1', email: 'agent1@test.com' } as WhatsappCommercial;
      const agent2 = { id: '2', email: 'agent2@test.com' } as WhatsappCommercial;
      const queue = [
        { user: agent1, position: 1 },
        { user: agent2, position: 2 },
      ] as QueuePosition[];

      expect(service.findNextOnlineAgent(queue)).toBe(agent1);
    });

    it('should return null if the queue is empty', () => {
      expect(service.findNextOnlineAgent([])).toBeNull();
    });

    it('should return null if the queue is an empty array', () => {
      expect(service.findNextOnlineAgent([])).toBeNull();
    });
  });

  describe('findNextOfflineAgent', () => {
    it('should return the agent with the fewest chats', () => {
      const agent1 = { id: '1', chats: [{}, {}] } as unknown as WhatsappCommercial;
      const agent2 = { id: '2', chats: [{}] } as unknown as WhatsappCommercial;
      const agent3 = { id: '3', chats: [{}, {}, {}] } as unknown as WhatsappCommercial;
      const agents = [agent1, agent2, agent3];

      expect(service.findNextOfflineAgent(agents)).toBe(agent2);
    });

    it('should return an agent with no chats if one exists', () => {
      const agent1 = { id: '1', chats: [{}, {}] } as unknown as WhatsappCommercial;
      const agent2 = { id: '2', chats: [] } as unknown as WhatsappCommercial;
      const agents = [agent1, agent2];

      expect(service.findNextOfflineAgent(agents)).toBe(agent2);
    });

    it('should return null if there are no offline agents', () => {
      expect(service.findNextOfflineAgent([])).toBeNull();
    });

    it('should return the first agent if all have the same number of chats', () => {
        const agent1 = { id: '1', chats: [{}, {}] } as unknown as WhatsappCommercial;
        const agent2 = { id: '2', chats: [{}, {}] } as unknown as WhatsappCommercial;
        const agents = [agent1, agent2];

        expect(service.findNextOfflineAgent(agents)).toBe(agent1);
    });
  });
});
