import { Injectable, NotFoundException } from '@nestjs/common';
import { CreatePermissionDto } from './dto/create-permission.dto';
import { UpdatePermissionDto } from './dto/update-permission.dto';
import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { Permissions } from './entities/permission.entity';
import { error } from 'console';

@Injectable()
export class PermissionsService {
  constructor(
      @InjectRepository(Permissions)
      private readonly permissionsRepository: Repository<Permissions>
    ){}

  async create(createPermissionDto: CreatePermissionDto) {
    try {
     
          
      let  permission = await this.permissionsRepository.findOne({
      where:{action:createPermissionDto.action, ressource:createPermissionDto.resource}
      })
      if (permission) {
        throw new error("cette permission existe deja")
      }
      const newPremission = new Permissions;
      newPremission.action = createPermissionDto.action;
      newPremission.conditions = createPermissionDto.conditions;
      newPremission.ressource = createPermissionDto.resource;

        
      await this.permissionsRepository.save(newPremission)
  
      return 'This action adds a new permission';
    } catch (error) {
      throw new error(error)
    }
  }

  async findAll() {
    const categories = await this.permissionsRepository.find({
      relations:{
       roles:true
      }
    })
    return categories;
  }

  async findOne(id: number) {
    const categories = await this.permissionsRepository.findOne({
      where:{id:id},
      relations:{
        roles:true
      }
    })
    return categories;
  }

  async update(id: number, updatePermissionDto: UpdatePermissionDto) {
    try {
      const categorie = await this.permissionsRepository.findOne({
        where:{id:id}
      })
      if(!categorie) throw new NotFoundException('categorie')
      Object.assign(categorie, updatePermissionDto)
      return await this.permissionsRepository.save(categorie)
    } catch (error) {
      throw new NotFoundException(error)
    }
  }

  async remove(id: number) {
    try {
      const categorie = await this.permissionsRepository.findOne({
        where: {id:id}
      });
      if(!categorie) throw new NotFoundException('user' );
  
      await this.permissionsRepository.delete({id});
      return true
    } catch (error) {
      throw new NotFoundException(error)
    }
  }
}
