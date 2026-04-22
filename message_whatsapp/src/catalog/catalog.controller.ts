import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { AdminGuard } from 'src/auth/admin.guard';
import { CatalogService, CreateAssetDto, UpdateAssetDto } from './catalog.service';
import { AssetCategory } from './entities/information-category-asset.entity';

@ApiTags('Catalogue')
@Controller('catalog')
export class CatalogController {
  constructor(private readonly service: CatalogService) {}

  /** Lecture publique (commerciaux) — liste les assets actifs */
  @Get()
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({ summary: 'Lister les assets du catalogue (actifs uniquement pour les commerciaux)' })
  findAll(
    @Query('category') category?: AssetCategory,
    @Query('all') all?: string,
  ) {
    const activeOnly = all !== 'true';
    return this.service.findAll(category, activeOnly);
  }

  @Get(':id')
  @UseGuards(AuthGuard('jwt'))
  findOne(@Param('id') id: string) {
    return this.service.findById(id);
  }

  /** Mutations réservées à l'admin */
  @Post()
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Créer un asset catalogue' })
  create(@Body() dto: CreateAssetDto) {
    return this.service.create(dto);
  }

  @Put(':id')
  @UseGuards(AdminGuard)
  update(@Param('id') id: string, @Body() dto: UpdateAssetDto) {
    return this.service.update(id, dto);
  }

  @Patch(':id/activate')
  @UseGuards(AdminGuard)
  activate(@Param('id') id: string) {
    return this.service.activate(id);
  }

  @Patch(':id/deactivate')
  @UseGuards(AdminGuard)
  deactivate(@Param('id') id: string) {
    return this.service.deactivate(id);
  }

  @Delete(':id')
  @UseGuards(AdminGuard)
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
