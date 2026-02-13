import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import * as cookieParser from 'cookie-parser';

const shouldRun = process.env.E2E_RUN === 'true';
const describeMaybe = shouldRun ? describe : describe.skip;

describeMaybe('Auth/Chat/Admin (e2e)', () => {
  let app: INestApplication<App>;

  const adminEmail = process.env.ADMIN_EMAIL ?? '';
  const adminPassword = process.env.ADMIN_PASSWORD ?? '';

  const unique = `${Date.now()}`;
  const postePayload = {
    name: `E2E Poste ${unique}`,
    code: `E2E${unique.slice(-6)}`,
    is_active: true,
  };
  const commercialPassword = 'Password123!';
  const commercialPayload = {
    email: `e2e-${unique}@example.com`,
    name: `E2E User ${unique}`,
    password: commercialPassword,
    poste_id: '',
  };

  let adminCookies: string[] = [];
  let commercialCookies: string[] = [];

  beforeAll(async () => {
    if (!adminEmail || !adminPassword) {
      throw new Error('ADMIN_EMAIL and ADMIN_PASSWORD are required for E2E.');
    }
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    await app.init();

    const adminLogin = await request(app.getHttpServer())
      .post('/auth/admin/login')
      .send({ email: adminEmail, password: adminPassword })
      .expect(201)
      .catch(async () => {
        return request(app.getHttpServer())
          .post('/auth/admin/login')
          .send({ email: adminEmail, password: adminPassword })
          .expect(200);
      });

    const adminSetCookie = adminLogin.headers['set-cookie'];
    adminCookies = Array.isArray(adminSetCookie)
      ? adminSetCookie
      : adminSetCookie
        ? [adminSetCookie]
        : [];

    const posteRes = await request(app.getHttpServer())
      .post('/poste')
      .set('Cookie', adminCookies)
      .send(postePayload)
      .expect(201)
      .catch(async () => {
        return request(app.getHttpServer())
          .post('/poste')
          .set('Cookie', adminCookies)
          .send(postePayload)
          .expect(200);
      });

    commercialPayload.poste_id = posteRes.body.id ?? posteRes.body?.poste?.id;

    await request(app.getHttpServer())
      .post('/users')
      .set('Cookie', adminCookies)
      .send(commercialPayload)
      .expect(201)
      .catch(async () => {
        return request(app.getHttpServer())
          .post('/users')
          .set('Cookie', adminCookies)
          .send(commercialPayload)
          .expect(200);
      });

    const userLogin = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: commercialPayload.email, password: commercialPassword })
      .expect(201)
      .catch(async () => {
        return request(app.getHttpServer())
          .post('/auth/login')
          .send({ email: commercialPayload.email, password: commercialPassword })
          .expect(200);
      });

    const userSetCookie = userLogin.headers['set-cookie'];
    commercialCookies = Array.isArray(userSetCookie)
      ? userSetCookie
      : userSetCookie
        ? [userSetCookie]
        : [];
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it('rejects /chats without auth', async () => {
    await request(app.getHttpServer()).get('/chats').expect((res) => {
      if (![401, 403].includes(res.status)) {
        throw new Error(`Expected 401/403, got ${res.status}`);
      }
    });
  });

  it('allows /chats for admin', async () => {
    await request(app.getHttpServer())
      .get('/chats')
      .set('Cookie', adminCookies)
      .expect(200);
  });

  it('allows admin profile with cookie', async () => {
    await request(app.getHttpServer())
      .get('/auth/admin/profile')
      .set('Cookie', adminCookies)
      .expect(200);
  });

  it('allows commercial profile with cookie', async () => {
    await request(app.getHttpServer())
      .get('/auth/profile')
      .set('Cookie', commercialCookies)
      .expect(200);
  });

  it('rejects metriques without auth', async () => {
    await request(app.getHttpServer())
      .get('/api/metriques/overview')
      .expect((res) => {
        if (![401, 403].includes(res.status)) {
          throw new Error(`Expected 401/403, got ${res.status}`);
        }
      });
  });

  it('allows metriques for admin', async () => {
    await request(app.getHttpServer())
      .get('/api/metriques/overview')
      .set('Cookie', adminCookies)
      .expect(200);
  });
});
