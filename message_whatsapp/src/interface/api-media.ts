export interface ApiMedia {
  media_id: string;
  media_type: string; // image | voice | location | ...
  url?: string | null;

  duration_seconds?: number | null;
  caption?: string | null;

  latitude?: number | null;
  longitude?: number | null;
}
