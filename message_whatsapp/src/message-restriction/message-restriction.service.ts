import { Injectable } from '@nestjs/common';
import { SystemConfigService } from 'src/system-config/system-config.service';
import { MessageRestrictionConfigDto } from './dto/message-restriction-config.dto';

export interface ValidationViolation {
  rule: 'MAX_WORD_LENGTH' | 'MAX_REPEATED_CHARS' | 'MIN_AUDIO_DURATION';
  detail: string;
}

const CONFIG_KEYS = {
  MAX_WORD_LENGTH: 'MSG_RESTRICTION_MAX_WORD_LENGTH',
  MAX_REPEATED_CHARS: 'MSG_RESTRICTION_MAX_REPEATED_CHARS',
  MIN_AUDIO_DURATION: 'MSG_RESTRICTION_MIN_AUDIO_DURATION_SECONDS',
} as const;

const DEFAULTS = {
  maxWordLength: 26,
  maxRepeatedChars: 3,
  minAudioDurationSeconds: 10,
} as const;

@Injectable()
export class MessageRestrictionService {
  constructor(private readonly systemConfigService: SystemConfigService) {}

  async getConfig(): Promise<MessageRestrictionConfigDto> {
    const [maxWordStr, maxRepeatedStr, minAudioStr] = await Promise.all([
      this.systemConfigService.get(CONFIG_KEYS.MAX_WORD_LENGTH),
      this.systemConfigService.get(CONFIG_KEYS.MAX_REPEATED_CHARS),
      this.systemConfigService.get(CONFIG_KEYS.MIN_AUDIO_DURATION),
    ]);

    return {
      maxWordLength: maxWordStr !== null ? parseInt(maxWordStr, 10) : DEFAULTS.maxWordLength,
      maxRepeatedChars: maxRepeatedStr !== null ? parseInt(maxRepeatedStr, 10) : DEFAULTS.maxRepeatedChars,
      minAudioDurationSeconds: minAudioStr !== null ? parseInt(minAudioStr, 10) : DEFAULTS.minAudioDurationSeconds,
    };
  }

  async updateConfig(dto: MessageRestrictionConfigDto): Promise<MessageRestrictionConfigDto> {
    await this.systemConfigService.setBulk([
      { key: CONFIG_KEYS.MAX_WORD_LENGTH, value: String(dto.maxWordLength) },
      { key: CONFIG_KEYS.MAX_REPEATED_CHARS, value: String(dto.maxRepeatedChars) },
      { key: CONFIG_KEYS.MIN_AUDIO_DURATION, value: String(dto.minAudioDurationSeconds) },
    ]);
    return this.getConfig();
  }

  validateTextContent(text: string, config: MessageRestrictionConfigDto): ValidationViolation[] {
    const violations: ValidationViolation[] = [];

    const words = text.split(/\s+/).filter((w) => w.length > 0);
    for (const word of words) {
      if ([...word].length > config.maxWordLength) {
        violations.push({
          rule: 'MAX_WORD_LENGTH',
          detail: `Le mot "${word.slice(0, 30)}${word.length > 30 ? '…' : ''}" dépasse la longueur maximale de ${config.maxWordLength} caractères`,
        });
        break;
      }
    }

    const repeatedRegex = new RegExp(`(.)\\1{${config.maxRepeatedChars},}`, 'gi');
    const matches = text.match(repeatedRegex);
    if (matches) {
      violations.push({
        rule: 'MAX_REPEATED_CHARS',
        detail: `Le message contient des caractères répétés plus de ${config.maxRepeatedChars} fois consécutifs : "${matches[0].slice(0, 20)}"`,
      });
    }

    return violations;
  }

  validateAudioDuration(
    durationSeconds: number | undefined | null,
    config: MessageRestrictionConfigDto,
  ): ValidationViolation | null {
    if (durationSeconds === undefined || durationSeconds === null) {
      return null;
    }

    if (durationSeconds < config.minAudioDurationSeconds) {
      return {
        rule: 'MIN_AUDIO_DURATION',
        detail: `La durée du message audio (${durationSeconds}s) est inférieure au minimum requis de ${config.minAudioDurationSeconds}s`,
      };
    }

    return null;
  }
}
