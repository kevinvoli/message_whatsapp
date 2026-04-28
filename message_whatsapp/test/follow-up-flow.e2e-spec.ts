/**
 * REL-028 — E2E : relance depuis rapport GICOP → gestion complète
 *
 * Scénario :
 *  1. Authentification commercial
 *  2. Créer une relance manuellement via POST /follow-ups
 *  3. Vérifier qu'elle apparaît dans GET /follow-ups/mine
 *  4. Vérifier qu'elle apparaît dans GET /follow-ups/due-today (si dans la journée)
 *  5. Marquer comme effectuée via PATCH /follow-ups/:id/complete
 *  6. Vérifier qu'elle sort des relances ouvertes
 *  7. Créer une 2e relance et l'annuler avec motif
 *  8. Vérifier cancelled_at et cancel_reason
 *
 * Guard : uniquement si E2E_RUN=true — sinon describe.skip.
 * Contrainte : aucune interaction DB2.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import * as cookieParser from 'cookie-parser';

const shouldRun = process.env.E2E_RUN === 'true';
const describeMaybe = shouldRun ? describe : describe.skip;

describeMaybe('FollowUp flow (e2e)', () => {
  let app: INestApplication<App>;

  const commercialEmail    = process.env.COMMERCIAL_EMAIL    ?? '';
  const commercialPassword = process.env.COMMERCIAL_PASSWORD ?? '';

  let cookies: string[] = [];
  let followUpId  = '';
  let followUpId2 = '';

  const logStep = (step: string) => console.log(`[e2e][follow-up-flow] ${step}`);

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    await app.init();

    if (!commercialEmail || !commercialPassword) {
      throw new Error('COMMERCIAL_EMAIL / COMMERCIAL_PASSWORD requis pour les tests E2E');
    }

    // Authentification commercial
    logStep('Authentification commercial');
    const loginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: commercialEmail, password: commercialPassword });

    expect(loginRes.status).toBe(200);
    cookies = loginRes.headers['set-cookie'] as unknown as string[];
  });

  afterAll(async () => {
    await app.close();
  });

  it('crée une relance via POST /follow-ups', async () => {
    logStep('Création relance');
    const tomorrow = new Date(Date.now() + 86400_000).toISOString();

    const res = await request(app.getHttpServer())
      .post('/follow-ups')
      .set('Cookie', cookies)
      .send({
        type:         'rappel',
        scheduled_at: tomorrow,
        notes:        'Note e2e test',
      });

    expect(res.status).toBe(201);
    expect(res.body.id).toBeDefined();
    expect(res.body.status).toBe('planifiee');
    expect(res.body.notes).toBe('Note e2e test');
    followUpId = res.body.id as string;
    logStep(`Relance créée : ${followUpId}`);
  });

  it('apparaît dans GET /follow-ups/mine', async () => {
    logStep('Vérification dans mes relances');
    const res = await request(app.getHttpServer())
      .get('/follow-ups/mine')
      .set('Cookie', cookies);

    expect(res.status).toBe(200);
    const ids = (res.body.data as Array<{ id: string }>).map((f) => f.id);
    expect(ids).toContain(followUpId);
  });

  it('marque la relance comme effectuée via PATCH /follow-ups/:id/complete', async () => {
    logStep('Complétion relance');
    const res = await request(app.getHttpServer())
      .patch(`/follow-ups/${followUpId}/complete`)
      .set('Cookie', cookies)
      .send({ result: 'Commande passée', notes: 'E2E complété' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('effectuee');
    expect(res.body.completed_at).toBeDefined();
    expect(res.body.result).toBe('Commande passée');
  });

  it('n\'apparaît plus parmi les relances planifiées après complétion', async () => {
    logStep('Vérification exclusion des planifiées');
    const res = await request(app.getHttpServer())
      .get('/follow-ups/mine?status=planifiee')
      .set('Cookie', cookies);

    expect(res.status).toBe(200);
    const ids = (res.body.data as Array<{ id: string }>).map((f) => f.id);
    expect(ids).not.toContain(followUpId);
  });

  it('crée une 2e relance et l\'annule avec motif', async () => {
    logStep('Création relance 2');
    const nextWeek = new Date(Date.now() + 7 * 86400_000).toISOString();

    const createRes = await request(app.getHttpServer())
      .post('/follow-ups')
      .set('Cookie', cookies)
      .send({ type: 'relance_sans_commande', scheduled_at: nextWeek });

    expect(createRes.status).toBe(201);
    followUpId2 = createRes.body.id as string;

    logStep('Annulation avec motif');
    const cancelRes = await request(app.getHttpServer())
      .patch(`/follow-ups/${followUpId2}/cancel`)
      .set('Cookie', cookies)
      .send({ reason: 'Client injoignable' });

    expect(cancelRes.status).toBe(200);
    expect(cancelRes.body.status).toBe('annulee');
    expect(cancelRes.body.cancelled_at).toBeDefined();
    expect(cancelRes.body.cancel_reason).toBe('Client injoignable');
    expect(cancelRes.body.cancelled_by).toBeDefined();
  });

  it('annulation sans motif reste compatible (rétrocompatibilité)', async () => {
    logStep('Création relance 3 pour annulation sans motif');
    const nextWeek = new Date(Date.now() + 7 * 86400_000).toISOString();

    const createRes = await request(app.getHttpServer())
      .post('/follow-ups')
      .set('Cookie', cookies)
      .send({ type: 'rappel', scheduled_at: nextWeek });

    expect(createRes.status).toBe(201);
    const id3 = createRes.body.id as string;

    const cancelRes = await request(app.getHttpServer())
      .patch(`/follow-ups/${id3}/cancel`)
      .set('Cookie', cookies)
      .send({});

    expect(cancelRes.status).toBe(200);
    expect(cancelRes.body.status).toBe('annulee');
    expect(cancelRes.body.cancel_reason).toBeNull();
  });
});
