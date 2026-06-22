/** Payload envoyé à POST https://gate.whapi.cloud/messages/text */
export interface WhapiTextPayload {
  to: string;
  body: string;
  quoted?: string;
}

/** Payload envoyé à POST https://gate.whapi.cloud/messages/{image|video|audio|document} */
export interface WhapiMediaPayload {
  to: string;
  /** Contenu encodé en base64 avec son MIME : "data:<mime>;base64,<b64>" */
  media: string;
  caption?: string;
  filename?: string;
}

/** Payload envoyé à POST https://gate.whapi.cloud/messages/hsm */
export interface WhapiHsmPayload {
  to: string;
  template: {
    name: string;
    language: { code: string };
    parameters?: {
      body: {
        parameters: Array<{ type: 'text'; text: string }>;
      };
    };
  };
}

/** Réponse de GET https://gate.whapi.cloud/messages/{id} */
export interface WhapiGetMessageResponse {
  id: string;
  type: string;
  image?: { id?: string; link?: string; mime_type?: string };
  video?: { id?: string; link?: string; mime_type?: string };
  audio?: { id?: string; link?: string; mime_type?: string };
  voice?: { id?: string; link?: string; mime_type?: string };
  document?: { id?: string; link?: string; mime_type?: string };
  gif?: { id?: string; link?: string; mime_type?: string };
}
