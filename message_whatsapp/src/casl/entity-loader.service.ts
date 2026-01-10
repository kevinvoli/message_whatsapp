import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';

@Injectable()
export class EntityLoader {
  private readonly logger = new Logger(EntityLoader.name);

  constructor(private dataSource: DataSource) {}

  getAllEntities(): string[] {
    const entities = this.dataSource.entityMetadatas.map((meta) => meta.name);
    
    // Log des entités
    this.logger.log(`Entités chargées : ${entities.join(', ')}`);

    return entities;
  }
}
