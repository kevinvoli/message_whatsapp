import { HttpException, HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { Roles } from './entities/role.entity';

@Injectable()
export class RolesService {
  constructor(
      @InjectRepository(Roles)
      private readonly rolesRepository: Repository<Roles>
    ){}
  async create(createRoleDto: CreateRoleDto) {
    try {
          
          const roles= new Roles()
          roles.name = createRoleDto.name
          await this.rolesRepository.save(roles)
    
          return "le produit a ete cree avec success"
        } catch (error) {
          throw new HttpException("echec de la creation de l'article", HttpStatus.BAD_REQUEST)
        }
  }

  async findAll() {
    const categories = await this.rolesRepository.find({
      relations:{
       permissions:true,
      }
    })
    return categories;
  }
  

  async findOne(id: number) {
    const categories = await this.rolesRepository.findOne({
      where:{id:id},
      relations:{
        permissions:true
      }
    })
    return categories;
  }

  async update(id: number, updateRoleDto: UpdateRoleDto) {
     try {
      const categorie = await this.rolesRepository.findOne({
        where:{id:id}
      })
      if(!categorie) throw new NotFoundException('categorie')
      Object.assign(categorie, updateRoleDto)
      return await this.rolesRepository.save(categorie)
    } catch (error) {
      throw new NotFoundException(error)
    }
  }

  async remove(id: number) {
     try {
              const categorie = await this.rolesRepository.findOne({
                where: {id:id}
              });
              if(!categorie) throw new NotFoundException('user' );
          
              await this.rolesRepository.delete({id});
              return true
            } catch (error) {
              throw new NotFoundException(error)
            }
  }
}
