import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import * as path from 'path';
import * as fs from 'fs';

@Injectable()
export class ProfilePicStorageService {
  private readonly logger = new Logger(ProfilePicStorageService.name);

  async storeProfilePic(
    cdnUrl: string,
    ownerKey: string,
    tenantId: string | null,
  ): Promise<{ localUrl: string; localPath: string } | null> {
    this.logger.debug(`PROFILE_PIC_STORE_START ownerKey=${ownerKey}`);
    try {
      const response = await axios.get<ArrayBuffer>(cdnUrl, {
        responseType: 'arraybuffer',
        timeout: 15_000,
      });

      const contentType = (response.headers['content-type'] as string | undefined) ?? 'image/jpeg';
      const ext = this.mimeToExt(contentType);

      const now = new Date();
      const yyyy = now.getFullYear().toString();
      const mm = String(now.getMonth() + 1).padStart(2, '0');
      const dd = String(now.getDate()).padStart(2, '0');
      const tenant = tenantId ?? 'default';
      const safeKey = ownerKey.replace(/[^a-zA-Z0-9_-]/g, '_');

      const relDir = path.posix.join('profile-pics', yyyy, mm, dd, tenant);
      const fileName = `${safeKey}.${ext}`;
      const uploadsRoot = path.join(__dirname, '..', '..', '..', 'uploads');
      const absDir = path.join(uploadsRoot, relDir);
      const absPath = path.join(absDir, fileName);
      const localUrl = `/uploads/${relDir}/${fileName}`;

      await fs.promises.mkdir(absDir, { recursive: true });
      await fs.promises.writeFile(absPath, Buffer.from(response.data));

      this.logger.log(`PROFILE_PIC_STORE_OK localUrl=${localUrl}`);
      return { localUrl, localPath: absPath };
    } catch (err) {
      this.logger.warn(`PROFILE_PIC_STORE_FAILED ownerKey=${ownerKey} error=${String(err)}`);
      return null;
    }
  }

  private mimeToExt(mimeType: string): string {
    const base = mimeType.split(';')[0].trim().toLowerCase();
    const map: Record<string, string> = {
      'image/jpeg': 'jpg',
      'image/jpg': 'jpg',
      'image/png': 'png',
      'image/webp': 'webp',
      'image/gif': 'gif',
    };
    return map[base] ?? 'jpg';
  }
}
