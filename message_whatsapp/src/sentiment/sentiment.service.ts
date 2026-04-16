import { Injectable } from '@nestjs/common';

export interface SentimentResult {
  score: number; // [-1, 1]
  label: 'positive' | 'neutral' | 'negative';
}

/**
 * P6.1 — Analyse de sentiment lexicale (aucune dépendance externe).
 * Score = (positifs - négatifs) / total_mots_analysés, normalisé sur [-1, 1].
 * Fonctionne en français et en anglais.
 */
@Injectable()
export class SentimentService {
  private readonly POSITIVE = new Set([
    // Français
    'bien', 'super', 'excellent', 'parfait', 'merci', 'bravo', 'génial', 'top',
    'satisfait', 'content', 'heureux', 'rapide', 'efficace', 'sympa', 'agréable',
    'impeccable', 'formidable', 'magnifique', 'réussi', 'positif', 'aide', 'aidé',
    'résolu', 'solution', 'facile', 'simple', 'pratique', 'beau', 'belle',
    // Anglais
    'good', 'great', 'excellent', 'perfect', 'thanks', 'thank', 'awesome',
    'happy', 'satisfied', 'fast', 'efficient', 'nice', 'helpful', 'easy',
    'solved', 'best', 'love', 'amazing', 'wonderful', 'fantastic',
  ]);

  private readonly NEGATIVE = new Set([
    // Français
    'mal', 'nul', 'mauvais', 'horrible', 'terrible', 'problème', 'bug', 'erreur',
    'lent', 'lente', 'impossible', 'incompétent', 'nuls', 'déçu', 'déçue',
    'frustrant', 'catastrophe', 'inacceptable', 'ridicule', 'honte', 'scandale',
    'pire', 'jamais', 'refus', 'refusé', 'rien', 'inutile', 'cassé', 'bloqué',
    // Anglais
    'bad', 'terrible', 'horrible', 'awful', 'problem', 'issue', 'error', 'bug',
    'slow', 'useless', 'broken', 'failed', 'failure', 'disappointed', 'worst',
    'hate', 'impossible', 'frustrated', 'ridiculous', 'unacceptable', 'refused',
  ]);

  /**
   * Analyse le sentiment d'un texte.
   * Retourne { score: 0, label: 'neutral' } si le texte est vide ou non textuel.
   */
  analyze(text: string | null | undefined): SentimentResult {
    if (!text || text.trim().length === 0) {
      return { score: 0, label: 'neutral' };
    }

    const words = text
      .toLowerCase()
      .replace(/[^a-zàáâãäåæçèéêëìíîïñòóôõöùúûüýÿœ\s'-]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 1);

    if (words.length === 0) return { score: 0, label: 'neutral' };

    let positiveCount = 0;
    let negativeCount = 0;

    for (const word of words) {
      if (this.POSITIVE.has(word)) positiveCount++;
      else if (this.NEGATIVE.has(word)) negativeCount++;
    }

    const total = positiveCount + negativeCount;
    if (total === 0) return { score: 0, label: 'neutral' };

    // Normalisation : score ∈ [-1, 1]
    const raw = (positiveCount - negativeCount) / total;
    // Atténuation si peu de mots sentimentaux vs total
    const weight = Math.min(total / words.length / 0.3, 1);
    const score = parseFloat((raw * weight).toFixed(4));

    const label: SentimentResult['label'] =
      score > 0.15 ? 'positive' : score < -0.15 ? 'negative' : 'neutral';

    return { score, label };
  }
}
