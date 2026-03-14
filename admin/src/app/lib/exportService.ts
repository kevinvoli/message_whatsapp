import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  getOverviewMetriques,
  getPerformanceCommerciaux,
  getChats,
  getMessages,
  getClients,
  getPostes,
  getChannels,
  getMessageAuto,
} from './api';
import { formatDateShort } from './dateUtils';

export type ExportFormat = 'csv' | 'json' | 'excel' | 'pdf';

function periodeToDateRange(periode: string): string {
  const now = new Date();
  const fmt = (d: Date) => d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const joursMap: Record<string, number> = { today: 0, week: 7, month: 30, year: 365 };
  const jours = joursMap[periode] ?? 0;
  const start = new Date(now);
  if (jours === 0) {
    start.setHours(0, 0, 0, 0);
  } else {
    start.setDate(start.getDate() - jours);
    start.setHours(0, 0, 0, 0);
  }
  return `du ${fmt(start)} au ${fmt(now)}`;
}

interface ExportMeta {
  title: string;
  periodeLabel: string;
  generatedAt: string;
}

// ─── Téléchargement fichier ────────────────────────────────────────────────────

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function csvCell(val: unknown): string {
  const str = String(val ?? '').replace(/"/g, '""');
  return str.includes(';') || str.includes('\n') || str.includes('"') ? `"${str}"` : str;
}

function downloadCSV(rows: Record<string, unknown>[], filename: string, meta: ExportMeta) {
  if (rows.length === 0) return;
  const headers = Object.keys(rows[0]);
  const lines = [
    `Rapport;${csvCell(meta.title)}`,
    `Période;${csvCell(meta.periodeLabel)}`,
    `Généré le;${csvCell(meta.generatedAt)}`,
    '',
    headers.map(csvCell).join(';'),
    ...rows.map((r) => headers.map((h) => csvCell(r[h])).join(';')),
  ];
  const blob = new Blob(['\uFEFF' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
  downloadBlob(blob, filename);
}

function downloadJSON(rows: Record<string, unknown>[], filename: string, meta: ExportMeta) {
  const payload = {
    rapport: meta.title,
    periode: meta.periodeLabel,
    generatedAt: meta.generatedAt,
    total: rows.length,
    data: rows,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  downloadBlob(blob, filename);
}

function downloadExcel(rows: Record<string, unknown>[], filename: string, meta: ExportMeta) {
  if (rows.length === 0) return;
  const headers = Object.keys(rows[0]);
  // Lignes de métadonnées en tête de feuille
  const aoa: unknown[][] = [
    ['Rapport', meta.title],
    ['Période', meta.periodeLabel],
    ['Généré le', meta.generatedAt],
    ['Nombre de lignes', rows.length],
    [],
    headers,
    ...rows.map((r) => headers.map((h) => r[h] ?? '')),
  ];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  // Style basique : largeur colonnes
  ws['!cols'] = headers.map(() => ({ wch: 20 }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, meta.title.substring(0, 31));
  XLSX.writeFile(wb, filename);
}

function downloadPDF(
  columns: string[],
  rows: string[][],
  filename: string,
  meta: ExportMeta,
) {
  const doc = new jsPDF({ orientation: 'landscape' });
  doc.setFontSize(14);
  doc.text(meta.title, 14, 16);
  doc.setFontSize(10);
  doc.setTextColor(80, 80, 80);
  doc.text(`Période : ${meta.periodeLabel}`, 14, 23);
  doc.setFontSize(8);
  doc.text(`Généré le ${meta.generatedAt} — ${rows.length} ligne(s)`, 14, 29);
  doc.setTextColor(0, 0, 0);

  autoTable(doc, {
    head: [columns],
    body: rows,
    startY: 34,
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [30, 41, 59], textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [248, 250, 252] },
  });

  doc.save(filename);
}

// ─── Transformateurs de données ───────────────────────────────────────────────

function formatSec(s: number): string {
  if (!s) return '0s';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}min`;
  return `${Math.floor(m / 60)}h${m % 60}min`;
}

function safe(val: unknown): string {
  if (val === null || val === undefined) return '';
  return String(val);
}

// ─── Définition des exports par vue ──────────────────────────────────────────

interface ExportDef {
  title: string;
  fetchData: (periode: string) => Promise<Record<string, unknown>[]>;
  columns: string[];
}

const EXPORT_VIEWS: Partial<Record<string, ExportDef>> = {
  commerciaux: {
    title: 'Performance Commerciaux',
    columns: ['Nom', 'Email', 'Poste', 'Connecté', 'Chats actifs', 'Msgs envoyés', 'Msgs reçus', 'Taux réponse (%)', 'Tps réponse moy'],
    fetchData: async (periode) => {
      const data = await getPerformanceCommerciaux(periode);
      return data.map((c) => ({
        Nom: safe(c.name),
        Email: safe(c.email),
        Poste: safe(c.poste_name),
        Connecté: c.isConnected ? 'Oui' : 'Non',
        'Chats actifs': c.nbChatsActifs,
        'Msgs envoyés': c.nbMessagesEnvoyes,
        'Msgs reçus': c.nbMessagesRecus,
        'Taux réponse (%)': c.tauxReponse,
        'Tps réponse moy': formatSec(c.tempsReponseMoyen),
      }));
    },
  },
  conversations: {
    title: 'Conversations',
    columns: ['Chat ID', 'Contact', 'Téléphone', 'Statut', 'Poste', 'Canal', 'Msgs non lus', 'Archivé', 'Dernière activité'],
    fetchData: async (periode) => {
      const result = await getChats(500, 0, periode);
      return result.data.map((c) => ({
        'Chat ID': safe(c.chat_id),
        Contact: safe(c.name || c.contact_client),
        Téléphone: safe(c.client_phone),
        Statut: safe(c.status),
        Poste: safe(c.poste?.name),
        Canal: safe(c.channel?.channel_id),
        'Msgs non lus': c.unread_count ?? c.unreadCount ?? 0,
        Archivé: c.is_archived ? 'Oui' : 'Non',
        'Dernière activité': c.last_activity_at ? formatDateShort(c.last_activity_at) : '',
      }));
    },
  },
  messages: {
    title: 'Messages',
    columns: ['ID', 'Chat ID', 'Direction', 'Type', 'Contenu', 'Poste', 'Statut', 'Timestamp'],
    fetchData: async (periode) => {
      const result = await getMessages(500, 0, periode);
      return (result.data as Record<string, unknown>[]).map((m) => ({
        ID: safe(m.id),
        'Chat ID': safe(m.chat_id),
        Direction: safe(m.direction),
        Type: safe(m.type),
        Contenu: safe(m.text).substring(0, 100),
        Poste: safe((m.poste as Record<string, unknown>)?.name),
        Statut: safe(m.status),
        Timestamp: m.timestamp ? formatDateShort(safe(m.timestamp)) : '',
      }));
    },
  },
  clients: {
    title: 'Clients',
    columns: ['ID', 'Nom', 'Téléphone', 'Actif', 'Statut appel', 'Nb messages', 'Créé le'],
    fetchData: async () => {
      const result = await getClients(500, 0);
      return result.data.map((c) => ({
        ID: safe(c.id),
        Nom: safe(c.name),
        Téléphone: safe(c.phone),
        Actif: c.is_active ? 'Oui' : 'Non',
        'Statut appel': safe(c.call_status),
        'Nb messages': c.total_messages ?? 0,
        'Créé le': c.createdAt ? formatDateShort(c.createdAt) : '',
      }));
    },
  },
  postes: {
    title: 'Postes',
    columns: ['ID', 'Nom', 'Code', 'Actif', 'Queue activée'],
    fetchData: async () => {
      const data = await getPostes();
      return data.map((p) => ({
        ID: safe(p.id),
        Nom: safe(p.name),
        Code: safe(p.code),
        Actif: p.is_active ? 'Oui' : 'Non',
        'Queue activée': p.is_queue_enabled ? 'Oui' : 'Non',
      }));
    },
  },
  canaux: {
    title: 'Canaux',
    columns: ['ID', 'Channel ID', 'Provider', 'Business', 'Uptime', 'Version', 'IP', 'Créé le'],
    fetchData: async () => {
      const data = await getChannels();
      return data.map((ch) => ({
        ID: safe(ch.id),
        'Channel ID': safe(ch.channel_id),
        Provider: safe(ch.provider),
        Business: ch.is_business ? 'Oui' : 'Non',
        Uptime: ch.uptime,
        Version: safe(ch.version),
        IP: safe(ch.ip),
        'Créé le': ch.createdAt ? formatDateShort(ch.createdAt) : '',
      }));
    },
  },
  automessages: {
    title: 'Messages Automatiques',
    columns: ['ID', 'Canal', 'Position', 'Actif', 'Délai (s)', 'Contenu'],
    fetchData: async () => {
      const data = await getMessageAuto();
      return data.map((m) => ({
        ID: safe(m.id),
        Canal: safe(m.canal),
        Position: m.position,
        Actif: m.actif ? 'Oui' : 'Non',
        'Délai (s)': m.delai ?? 0,
        Contenu: safe(m.body).substring(0, 150),
      }));
    },
  },
  overview: {
    title: 'Métriques Globales',
    columns: ['Métrique', 'Valeur'],
    fetchData: async (periode) => {
      const data = await getOverviewMetriques(periode);
      const m = data.metriques;
      return [
        { Métrique: 'Total messages', Valeur: m.totalMessages },
        { Métrique: 'Messages entrants', Valeur: m.messagesEntrants },
        { Métrique: 'Messages sortants', Valeur: m.messagesSortants },
        { Métrique: 'Messages période', Valeur: m.messagesAujourdhui },
        { Métrique: 'Taux de réponse (%)', Valeur: m.tauxReponse },
        { Métrique: 'Tps réponse moyen', Valeur: formatSec(m.tempsReponseMoyen) },
        { Métrique: 'Total conversations', Valeur: m.totalChats },
        { Métrique: 'Conversations actives', Valeur: m.chatsActifs },
        { Métrique: 'En attente', Valeur: m.chatsEnAttente },
        { Métrique: 'Fermées', Valeur: m.chatsFermes },
        { Métrique: 'Non lues', Valeur: m.chatsNonLus },
        { Métrique: 'Commerciaux total', Valeur: m.commerciauxTotal },
        { Métrique: 'Commerciaux connectés', Valeur: m.commerciauxConnectes },
        { Métrique: 'Commerciaux actifs', Valeur: m.commerciauxActifs },
        { Métrique: 'Total contacts', Valeur: m.totalContacts },
        { Métrique: 'Nouveaux contacts période', Valeur: m.nouveauxContactsAujourdhui },
        { Métrique: 'Postes actifs', Valeur: `${m.postesActifs} / ${m.totalPostes}` },
        { Métrique: 'Channels actifs', Valeur: `${m.channelsActifs} / ${m.totalChannels}` },
      ];
    },
  },
  performance: {
    title: 'Performance Temporelle',
    columns: ['Date', 'Total messages', 'Entrants', 'Sortants', 'Conversations'],
    fetchData: async (periode) => {
      const data = await getOverviewMetriques(periode);
      return (data.performanceTemporelle ?? []).map((p) => ({
        Date: safe(p.periode),
        'Total messages': p.nb_messages,
        Entrants: p.messages_in,
        Sortants: p.messages_out,
        Conversations: p.nb_conversations,
      }));
    },
  },
};

// ─── Point d'entrée principal ─────────────────────────────────────────────────

export const EXPORTABLE_VIEWS = Object.keys(EXPORT_VIEWS);

export async function exportData(
  viewMode: string,
  selectedPeriod: string,
  format: ExportFormat,
): Promise<void> {
  const def = EXPORT_VIEWS[viewMode];
  if (!def) throw new Error(`Export non disponible pour la vue: ${viewMode}`);

  const rows = await def.fetchData(selectedPeriod);

  const now = new Date();
  const periodeLabel = periodeToDateRange(selectedPeriod);
  const generatedAt = now.toLocaleDateString('fr-FR', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
  // Nom fichier : NomExport_YYYY-MM-DD_HHhMM
  const pad = (n: number) => String(n).padStart(2, '0');
  const dateTimeSlug = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}h${pad(now.getMinutes())}`;
  const meta: ExportMeta = { title: def.title, periodeLabel, generatedAt };
  const filename = `${def.title.replace(/\s+/g, '_')}_${dateTimeSlug}`;

  switch (format) {
    case 'csv':
      downloadCSV(rows, `${filename}.csv`, meta);
      break;
    case 'json':
      downloadJSON(rows, `${filename}.json`, meta);
      break;
    case 'excel':
      downloadExcel(rows, `${filename}.xlsx`, meta);
      break;
    case 'pdf': {
      const pdfRows = rows.map((r) => def.columns.map((col) => safe(r[col])));
      downloadPDF(def.columns, pdfRows, `${filename}.pdf`, meta);
      break;
    }
  }
}
