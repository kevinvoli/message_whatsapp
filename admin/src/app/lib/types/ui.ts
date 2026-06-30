import React from 'react';
import type {
  MetriquesGlobales,
  PerformanceCommercial,
  StatutChannel,
  PerformanceTemporelle,
  Alerte,
} from './api';

// ============================================
// VIEW MODE
// ============================================

export type ViewMode =
  | 'overview'
  | 'commerciaux'
  | 'performance'
  | 'analytics'
  | 'messages'
  | 'message-traffic'
  | 'clients'
  | 'rapports'
  | 'postes'
  | 'canaux'
  | 'templates'
  | 'automessages'
  | 'conversations'
  | 'queue'
  | 'dispatch'
  | 'lecture-seule'
  | 'crons'
  | 'observabilite'
  | 'go_no_go'
  | 'notifications'
  | 'alert-config'
  | 'flowbot'
  | 'contexts'
  | 'follow-ups'
  | 'portfolio'
  | 'targets'
  | 'ip-access'
  | 'sessions'
  | 'capacity'
  | 'system-health'
  | 'integration'
  | 'ranking'
  | 'ia-governance'
  | 'gicop-supervision'
  | 'outbox-sync'
  | 'work-schedule'
  | 'complaints'
  | 'login-logs'
  | 'relance-config'
  | 'call-devices'
  | 'presence'
  | 'commercial-groups'
  | 'commercial-subgroups'
  | 'commercial-planning'
  | 'break-supervision'
  | 'appels'
  | 'missed-calls'
  | 'applications'
  | 'campaign-links'
  | 'mediatheque'
  | 'settings'
  | 'channel-stats'
  | 'canaux-dedies'
  | 'campagnes-meta'
  | 'galerie-media'
  | 'quiz';

// ============================================
// NAVIGATION
// ============================================

export type NavigationItem = {
  id: ViewMode;
  name: string;
  icon: React.ElementType;
  badge: string | null;
};

export type NavigationGroup = {
  label: string;
  icon: React.ElementType;
  items: NavigationItem[];
};

// ============================================
// CONFIGURATION PANNEAU POSTE
// ============================================

export type PostePanelConfig = {
  enabled: boolean;
  types: string[];
};

// ============================================
// PROPS COMPOSANT OVERVIEW
// ============================================

/**
 * Props du composant OverviewView
 */
export type OverviewViewProps = {
  metriques: MetriquesGlobales;
  performanceCommercial: PerformanceCommercial[];
  statutChannels: StatutChannel[];
  performanceTemporelle?: PerformanceTemporelle[];
  alertes?: Alerte[];
};
