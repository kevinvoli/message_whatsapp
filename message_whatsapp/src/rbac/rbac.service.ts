import {
  Injectable,
  Inject,
  NotFoundException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Role, Permission } from './entities/role.entity';
import { CommercialRole } from './entities/commercial-role.entity';
import { REDIS_CLIENT } from 'src/redis/redis.module';
import Redis from 'ioredis';

const CACHE_TTL = 300; // 5 minutes
const permCacheKey = (commercialId: string, tenantId: string) =>
  `rbac:perms:${tenantId}:${commercialId}`;

export class CreateRoleDto {
  tenant_id: string;
  name: string;
  description?: string;
  permissions: Permission[];
}

export class UpdateRoleDto {
  name?: string;
  description?: string;
  permissions?: Permission[];
}

@Injectable()
export class RbacService {
  constructor(
    @InjectRepository(Role)
    private readonly roleRepo: Repository<Role>,

    @InjectRepository(CommercialRole)
    private readonly comRoleRepo: Repository<CommercialRole>,

    @Inject(REDIS_CLIENT)
    private readonly redis: Redis | null,
  ) {}

  // ─── CRUD Rôles ───────────────────────────────────────────────────────────

  async createRole(dto: CreateRoleDto): Promise<Role> {
    const existing = await this.roleRepo.findOne({
      where: { tenant_id: dto.tenant_id, name: dto.name },
    });
    if (existing) {
      throw new ConflictException(`Le rôle "${dto.name}" existe déjà pour ce tenant`);
    }
    return this.roleRepo.save(this.roleRepo.create(dto));
  }

  async findAllRoles(tenantId: string): Promise<Role[]> {
    return this.roleRepo.find({
      where: { tenant_id: tenantId },
      order: { name: 'ASC' },
    });
  }

  async updateRole(id: string, tenantId: string, dto: UpdateRoleDto): Promise<Role> {
    const role = await this.roleRepo.findOne({ where: { id, tenant_id: tenantId } });
    if (!role) throw new NotFoundException(`Rôle ${id} introuvable`);
    if (role.is_system) throw new ForbiddenException('Les rôles système ne peuvent pas être modifiés');
    Object.assign(role, dto);
    const saved = await this.roleRepo.save(role);
    await this.invalidateTenantCache(tenantId);
    return saved;
  }

  async removeRole(id: string, tenantId: string): Promise<void> {
    const role = await this.roleRepo.findOne({ where: { id, tenant_id: tenantId } });
    if (!role) throw new NotFoundException(`Rôle ${id} introuvable`);
    if (role.is_system) throw new ForbiddenException('Les rôles système ne peuvent pas être supprimés');
    await this.roleRepo.delete(role.id);
    await this.invalidateTenantCache(tenantId);
  }

  // ─── Assignation commercial ↔ rôle ───────────────────────────────────────

  async assignRole(commercialId: string, roleId: string, tenantId: string): Promise<CommercialRole> {
    const role = await this.roleRepo.findOne({ where: { id: roleId, tenant_id: tenantId } });
    if (!role) throw new NotFoundException(`Rôle ${roleId} introuvable`);

    // Upsert : un commercial a un seul rôle par tenant
    let cr = await this.comRoleRepo.findOne({
      where: { commercial_id: commercialId, tenant_id: tenantId },
    });
    if (cr) {
      cr.role_id = roleId;
    } else {
      cr = this.comRoleRepo.create({ commercial_id: commercialId, role_id: roleId, tenant_id: tenantId });
    }
    const saved = await this.comRoleRepo.save(cr);
    await this.invalidateCache(commercialId, tenantId);
    return saved;
  }

  async removeAssignment(commercialId: string, tenantId: string): Promise<void> {
    await this.comRoleRepo.delete({ commercial_id: commercialId, tenant_id: tenantId });
    await this.invalidateCache(commercialId, tenantId);
  }

  // ─── Vérification de permission (avec cache Redis) ────────────────────────

  async getPermissions(commercialId: string, tenantId: string): Promise<Permission[]> {
    const cacheKey = permCacheKey(commercialId, tenantId);

    // 1. Tenter le cache Redis
    if (this.redis) {
      try {
        const cached = await this.redis.get(cacheKey);
        if (cached) return JSON.parse(cached) as Permission[];
      } catch {
        // Redis indisponible → fallback DB
      }
    }

    // 2. DB
    const cr = await this.comRoleRepo.findOne({
      where: { commercial_id: commercialId, tenant_id: tenantId },
      relations: ['role'],
    });
    const permissions = cr?.role?.permissions ?? [];

    // 3. Mettre en cache
    if (this.redis) {
      try {
        await this.redis.set(cacheKey, JSON.stringify(permissions), 'EX', CACHE_TTL);
      } catch {
        // Redis indisponible — silencieux
      }
    }

    return permissions;
  }

  async hasPermission(
    commercialId: string,
    tenantId: string,
    permission: Permission,
  ): Promise<boolean> {
    const perms = await this.getPermissions(commercialId, tenantId);
    return perms.includes(permission);
  }

  // ─── Cache invalidation ───────────────────────────────────────────────────

  private async invalidateCache(commercialId: string, tenantId: string): Promise<void> {
    if (!this.redis) return;
    try {
      await this.redis.del(permCacheKey(commercialId, tenantId));
    } catch {
      // silencieux
    }
  }

  private async invalidateTenantCache(tenantId: string): Promise<void> {
    if (!this.redis) return;
    try {
      const keys = await this.redis.keys(`rbac:perms:${tenantId}:*`);
      if (keys.length > 0) {
        await Promise.all(keys.map((k) => this.redis!.del(k)));
      }
    } catch {
      // silencieux
    }
  }
}
