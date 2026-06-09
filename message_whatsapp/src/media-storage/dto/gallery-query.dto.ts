import { IsOptional, IsString, IsIn, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export class GalleryQueryDto {
  @IsOptional() @IsString() channelId?: string;
  @IsOptional() @IsString() posteId?: string;
  @IsOptional() @IsIn(['IN', 'OUT']) direction?: 'IN' | 'OUT';
  @IsOptional()
  @IsIn(['image', 'video', 'audio', 'document', 'voice', 'sticker', 'gif', 'location', 'contact'])
  mediaType?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit?: number = 24;
  @IsOptional() @IsIn(['createdAt', 'fileSize']) sort?: string = 'createdAt';
  @IsOptional() @IsIn(['asc', 'desc']) order?: 'asc' | 'desc' = 'desc';
}
