import { IsOptional, IsUUID } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class AssignPosteDto {
  @ApiPropertyOptional({
    description:
      'UUID du poste à assigner à ce channel. ' +
      'Envoyer null pour retirer l\'assignation (retour en mode pool global).',
    example: '550e8400-e29b-41d4-a716-446655440000',
    nullable: true,
  })
  @IsOptional()
  @IsUUID('4', { message: 'poste_id doit être un UUID valide' })
  poste_id: string | null;
}
