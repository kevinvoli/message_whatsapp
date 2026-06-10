/**
 * Helper pour créer des modules NestJS de test de façon standardisée.
 * Centralise la configuration répétitive de Test.createTestingModule.
 *
 * Usage :
 *   import { createTestingModule } from '../../test/helpers/create-test-module';
 *   const module = await createTestingModule([MonService, { provide: ..., useValue: ... }]);
 *   service = module.get<MonService>(MonService);
 */

import { Test, TestingModule } from '@nestjs/testing';
import type { ModuleMetadata } from '@nestjs/common';

/**
 * Crée un TestingModule NestJS à partir d'un tableau de providers.
 * Nettoie automatiquement les mocks avant chaque test si appelé depuis beforeEach.
 *
 * @param providers - Liste des providers NestJS (classes, useValue, useClass, useFactory)
 * @param imports   - Modules NestJS optionnels à importer
 */
export async function createTestingModule(
  providers: NonNullable<ModuleMetadata['providers']>,
  imports: NonNullable<ModuleMetadata['imports']> = [],
): Promise<TestingModule> {
  const module = await Test.createTestingModule({
    imports,
    providers,
  }).compile();

  return module;
}
