import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FlowBot } from '../entities/flow-bot.entity';
import { FlowNode } from '../entities/flow-node.entity';
import { FlowEdge } from '../entities/flow-edge.entity';
import { FlowTrigger } from '../entities/flow-trigger.entity';

@Injectable()
export class FlowCrudService {
  constructor(
    @InjectRepository(FlowBot)
    private readonly flowRepo: Repository<FlowBot>,
    @InjectRepository(FlowNode)
    private readonly nodeRepo: Repository<FlowNode>,
    @InjectRepository(FlowEdge)
    private readonly edgeRepo: Repository<FlowEdge>,
    @InjectRepository(FlowTrigger)
    private readonly triggerRepo: Repository<FlowTrigger>,
  ) {}

  // ─── FlowBot ──────────────────────────────────────────────────────────────

  async findAllFlows(): Promise<FlowBot[]> {
    return this.flowRepo.find({ order: { priority: 'DESC' } });
  }

  async findFlowById(id: string): Promise<FlowBot> {
    const flow = await this.flowRepo.findOne({
      where: { id },
      relations: ['triggers', 'nodes', 'edges'],
    });
    if (!flow) throw new NotFoundException(`Flow ${id} introuvable`);
    return flow;
  }

  async createFlow(dto: Partial<FlowBot>): Promise<FlowBot> {
    return this.flowRepo.save(this.flowRepo.create(dto));
  }

  async updateFlow(id: string, dto: Partial<FlowBot>): Promise<FlowBot> {
    await this.flowRepo.update(id, dto);
    return this.findFlowById(id);
  }

  async deleteFlow(id: string): Promise<void> {
    const flow = await this.findFlowById(id);
    await this.flowRepo.remove(flow);
  }

  async setActive(id: string, isActive: boolean): Promise<FlowBot> {
    await this.flowRepo.update(id, { isActive });
    return this.findFlowById(id);
  }

  // ─── Nœuds ───────────────────────────────────────────────────────────────

  async upsertNodes(flowId: string, nodes: Partial<FlowNode>[]): Promise<FlowNode[]> {
    const entities = nodes.map((n) => this.nodeRepo.create({ ...n, flowId }));
    return this.nodeRepo.save(entities);
  }

  async deleteNode(id: string): Promise<void> {
    await this.nodeRepo.delete(id);
  }

  // ─── Arêtes ───────────────────────────────────────────────────────────────

  async upsertEdges(flowId: string, edges: Partial<FlowEdge>[]): Promise<FlowEdge[]> {
    const entities = edges.map((e) => this.edgeRepo.create({ ...e, flowId }));
    return this.edgeRepo.save(entities);
  }

  async deleteEdge(id: string): Promise<void> {
    await this.edgeRepo.delete(id);
  }

  // ─── Triggers ─────────────────────────────────────────────────────────────

  async upsertTriggers(flowId: string, triggers: Partial<FlowTrigger>[]): Promise<FlowTrigger[]> {
    const entities = triggers.map((t) => this.triggerRepo.create({ ...t, flowId }));
    return this.triggerRepo.save(entities);
  }
}
