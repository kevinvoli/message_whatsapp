import { MessagingApplication } from 'src/application/entities/messaging-application.entity';
import { WhapiChannel } from 'src/channel/entities/channel.entity';
import { resolveChannelCredentials } from './resolve-channel-credentials.helper';

function makeChannel(overrides: Partial<WhapiChannel> = {}): WhapiChannel {
  return {
    id: 'chan-uuid',
    token: 'chan-token',
    meta_app_id: null,
    meta_app_secret: null,
    application: null,
    application_id: null,
    ...overrides,
  } as unknown as WhapiChannel;
}

function makeApp(overrides: Partial<MessagingApplication> = {}): MessagingApplication {
  return {
    id: 'app-uuid',
    appId: 'app-id-123',
    appSecret: 'app-secret-456',
    systemToken: null,
    ...overrides,
  } as MessagingApplication;
}

describe('resolveChannelCredentials', () => {
  it('canal sans application → retourne meta_app_id/meta_app_secret du canal', () => {
    const channel = makeChannel({ meta_app_id: 'cid', meta_app_secret: 'csecret' });
    const result = resolveChannelCredentials(channel);
    expect(result.appId).toBe('cid');
    expect(result.appSecret).toBe('csecret');
    expect(result.accessToken).toBe('chan-token');
    expect(result.isSystemToken).toBe(false);
  });

  it('canal sans application, meta_app_id null → retourne null pour appId/appSecret', () => {
    const result = resolveChannelCredentials(makeChannel());
    expect(result.appId).toBeNull();
    expect(result.appSecret).toBeNull();
    expect(result.accessToken).toBe('chan-token');
    expect(result.isSystemToken).toBe(false);
  });

  it('canal avec application sans system_token → credentials app + token canal', () => {
    const channel = makeChannel({ application: makeApp() });
    const result = resolveChannelCredentials(channel);
    expect(result.appId).toBe('app-id-123');
    expect(result.appSecret).toBe('app-secret-456');
    expect(result.accessToken).toBe('chan-token');
    expect(result.isSystemToken).toBe(false);
  });

  it('canal avec application avec system_token → credentials app + system_token', () => {
    const channel = makeChannel({ application: makeApp({ systemToken: 'sys-token' }) });
    const result = resolveChannelCredentials(channel);
    expect(result.appId).toBe('app-id-123');
    expect(result.accessToken).toBe('sys-token');
    expect(result.isSystemToken).toBe(true);
  });

  it('system_token vide string → traité comme null, retourne token canal', () => {
    const channel = makeChannel({ application: makeApp({ systemToken: '   ' }) });
    const result = resolveChannelCredentials(channel);
    expect(result.accessToken).toBe('chan-token');
    expect(result.isSystemToken).toBe(false);
  });

  it('canal avec application_id mais relation non chargée → fallback canal sans erreur', () => {
    const channel = makeChannel({ application_id: 'app-uuid', application: undefined });
    const result = resolveChannelCredentials(channel);
    expect(result.appId).toBeNull();
    expect(result.accessToken).toBe('chan-token');
    expect(result.isSystemToken).toBe(false);
  });
});
