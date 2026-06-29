/**
 * Factory générique pour mocker les repositories TypeORM dans les tests unitaires.
 * Centralise la création du mock afin d'éviter la duplication dans chaque spec.
 *
 * Usage :
 *   import { mockRepository } from '../../test/helpers/mock-repository';
 *   useValue: mockRepository()
 */

export interface MockQueryBuilder {
  select: jest.Mock;
  where: jest.Mock;
  andWhere: jest.Mock;
  orWhere: jest.Mock;
  leftJoin: jest.Mock;
  leftJoinAndSelect: jest.Mock;
  innerJoin: jest.Mock;
  innerJoinAndSelect: jest.Mock;
  orderBy: jest.Mock;
  addOrderBy: jest.Mock;
  limit: jest.Mock;
  offset: jest.Mock;
  skip: jest.Mock;
  take: jest.Mock;
  getOne: jest.Mock;
  getMany: jest.Mock;
  getManyAndCount: jest.Mock;
  getRawMany: jest.Mock;
  getRawOne: jest.Mock;
  getCount: jest.Mock;
  execute: jest.Mock;
  setParameter: jest.Mock;
  setParameters: jest.Mock;
  update: jest.Mock;
  set: jest.Mock;
  addSelect: jest.Mock;
  groupBy: jest.Mock;
  insert: jest.Mock;
  into: jest.Mock;
  values: jest.Mock;
  orUpdate: jest.Mock;
  whereInIds: jest.Mock;
}

export interface MockRepository<T = Record<string, unknown>> {
  find: jest.Mock<Promise<T[]>>;
  findOne: jest.Mock<Promise<T | null>>;
  findOneBy: jest.Mock<Promise<T | null>>;
  findBy: jest.Mock<Promise<T[]>>;
  save: jest.Mock<Promise<T>>;
  create: jest.Mock<T>;
  update: jest.Mock<Promise<{ affected?: number }>>;
  delete: jest.Mock;
  remove: jest.Mock;
  count: jest.Mock<Promise<number>>;
  createQueryBuilder: jest.Mock<MockQueryBuilder>;
}

function buildQueryBuilder(): MockQueryBuilder {
  const qb: MockQueryBuilder = {
    select: jest.fn(),
    where: jest.fn(),
    andWhere: jest.fn(),
    orWhere: jest.fn(),
    leftJoin: jest.fn(),
    leftJoinAndSelect: jest.fn(),
    innerJoin: jest.fn(),
    innerJoinAndSelect: jest.fn(),
    orderBy: jest.fn(),
    addOrderBy: jest.fn(),
    limit: jest.fn(),
    offset: jest.fn(),
    skip: jest.fn(),
    take: jest.fn(),
    getOne: jest.fn(),
    getMany: jest.fn(),
    getManyAndCount: jest.fn(),
    getRawMany: jest.fn(),
    getRawOne: jest.fn(),
    getCount: jest.fn(),
    execute: jest.fn(),
    setParameter: jest.fn(),
    setParameters: jest.fn(),
    update: jest.fn(),
    set: jest.fn(),
    addSelect: jest.fn(),
    groupBy: jest.fn(),
    insert: jest.fn(),
    into: jest.fn(),
    values: jest.fn(),
    orUpdate: jest.fn(),
    whereInIds: jest.fn(),
  };

  // Toutes les méthodes de construction retournent `this` pour permettre le chaînage
  const chainingMethods: Array<keyof MockQueryBuilder> = [
    'select', 'where', 'andWhere', 'orWhere',
    'leftJoin', 'leftJoinAndSelect', 'innerJoin', 'innerJoinAndSelect',
    'orderBy', 'addOrderBy', 'limit', 'offset', 'skip', 'take',
    'setParameter', 'setParameters', 'update', 'set', 'addSelect', 'groupBy',
    'insert', 'into', 'values', 'orUpdate', 'whereInIds',
  ];

  for (const method of chainingMethods) {
    (qb[method] as jest.Mock).mockReturnValue(qb);
  }

  return qb;
}

/**
 * Retourne un mock complet de Repository TypeORM.
 * Chaque appel retourne une nouvelle instance avec des mocks frais.
 */
export function mockRepository<T = Record<string, unknown>>(): MockRepository<T> {
  return {
    find: jest.fn<Promise<T[]>, []>(),
    findOne: jest.fn<Promise<T | null>, []>(),
    findOneBy: jest.fn<Promise<T | null>, []>(),
    findBy: jest.fn<Promise<T[]>, []>(),
    save: jest.fn<Promise<T>, []>(),
    create: jest.fn<T, []>(),
    update: jest.fn<Promise<{ affected?: number }>, []>(),
    delete: jest.fn(),
    remove: jest.fn(),
    count: jest.fn<Promise<number>, []>(),
    createQueryBuilder: jest.fn<MockQueryBuilder, []>().mockImplementation(buildQueryBuilder),
  };
}
