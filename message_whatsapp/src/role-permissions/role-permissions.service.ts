import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateRolePermissionDto } from './dto/create-role-permission.dto';
import { UpdateRolePermissionDto } from './dto/update-role-permission.dto';
import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { RolePermissions } from './entities/role-permission.entity';
import { Roles } from '../roles/entities/role.entity';
import { Permissions } from '../permissions/entities/permission.entity';



@Injectable()
export class RolePermissionsService {
  constructor(
      @InjectRepository(RolePermissions)
      private readonly rolePermissionRepository: Repository<RolePermissions>,
      @InjectRepository(Roles)
      private readonly rolesRepository: Repository<Roles>,
      @InjectRepository(Permissions)
      private readonly permissionRepository: Repository<Permissions>
    ){}

  async create(createRolePermissionDto: CreateRolePermissionDto) {
    try {
      const role =await this.rolesRepository.findOne({
        where:{id:createRolePermissionDto.roleId}
      })
      if (!role) {
        throw new NotFoundException("le role n'existe pas") 
      }

      const permission =await this.permissionRepository.findOne({
        where:{id:createRolePermissionDto.permissionId}
      })

      if (!permission) {
        throw new NotFoundException("le role n'existe pas") 
      }
      
      const newRolePermission = new RolePermissions;
      newRolePermission.permission= permission;
      newRolePermission.roles = role

      await this.rolePermissionRepository.save(newRolePermission)
      return "permission ajouter avec success"
    } catch (error) {
      throw new NotFoundException(error)
    }
    
  }

  async findAll() {
    const categories = await this.rolePermissionRepository.find({
      relations:{
       roles:true
      }
    })
    return categories;
  }
  async findAllRolePermission(roleId:number) {
    const categories = await this.rolePermissionRepository.find({
      where:{
        roleId:roleId
      },
      relations:{
       permission:true,
      }
    })
    return categories;
  }

  async findOne(id: number) {
    const categories = await this.rolePermissionRepository.findOne({
      where:{id:id},
      relations:{
        roles:true
      }
    })
    return categories;
  }

  async update(id: number, updateRolePermissionDto: UpdateRolePermissionDto) {
   try {
         const categorie = await this.rolePermissionRepository.findOne({
           where:{id:id}
         })
         if(!categorie) throw new NotFoundException('categorie')
         Object.assign(categorie, updateRolePermissionDto)
         return await this.rolePermissionRepository.save(categorie)
       } catch (error) {
         throw new NotFoundException(error)
       }
  }

  async remove(id: number) {
   try {
         const categorie = await this.rolePermissionRepository.findOne({
           where: {id:id}
         });
         if(!categorie) throw new NotFoundException('user' );
     
         await this.rolePermissionRepository.delete({id});
         return true
       } catch (error) {
         throw new NotFoundException(error)
       }
  }
}
