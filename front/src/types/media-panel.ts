export type PanelMedia = {
  id: string;
  local_url: string;
  media_type: 'image' | 'video' | 'audio' | 'document' | 'voice' | 'sticker' | 'gif';
  mime_type: string;
  file_name: string | null;
  file_size: string | null;
  duration_seconds: number | null;
  downloaded_at: string | null;
  createdAt: string;
  message: {
    direction: 'IN' | 'OUT';
    from_name: string;
    from: string;
  } | null;
};

export type PanelMediaResponse = {
  enabled: boolean;
  types: string[];
  items: PanelMedia[];
  total: number;
  pages: number;
};
