import { Injectable } from '@nestjs/common';

@Injectable()
export class AgentConnectionService {
  private readonly connectedIds = new Set<string>();

  markConnected(commercialId: string): void {
    this.connectedIds.add(commercialId);
  }

  markDisconnected(commercialId: string): void {
    this.connectedIds.delete(commercialId);
  }

  getConnectedCommercialIds(): string[] {
    return [...this.connectedIds];
  }

  isConnected(commercialId: string): boolean {
    return this.connectedIds.has(commercialId);
  }
}
