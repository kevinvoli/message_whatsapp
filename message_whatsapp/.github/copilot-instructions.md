# Copilot Instructions for message_whatsapp

## Project Overview
This is a NestJS-based WhatsApp messaging platform with role-based access control, real-time communication via WebSockets, and integration with the WhatsApp Business API through WHAPI.

## Architecture
- **Framework**: NestJS with TypeScript
- **Database**: TypeORM with MySQL/PostgreSQL (configurable via DATABASE_URL)
- **Authentication**: JWT with Passport, bcrypt for password hashing
- **Authorization**: CASL (Centralized Access Control Library) for permissions
- **Real-time**: Socket.IO for WebSocket connections
- **API Docs**: Swagger/OpenAPI
- **Validation**: class-validator and class-transformer

## Module Structure
- `auth/`: JWT authentication, login/logout, token management
- `casl/`: Permission-based access control factory and guards
- `permissions/`, `roles/`, `role-permissions/`: RBAC system
- `database/`: TypeORM configuration with async setup
- `whapi/`: WhatsApp Business API integration (sending/receiving messages)
- `whatsapp_*/`: Domain modules for chats, messages, contacts, media, etc.
- Missing: `users/` module (referenced but not implemented)

## Key Patterns

### Entity Design
Use TypeORM decorators with consistent naming:
```typescript
@Entity()
export class Example {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'field_name', type: 'varchar', nullable: false })
  fieldName: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @DeleteDateColumn()
  deletedAt: Date;
}
```

### Service Pattern
Inject repositories and follow CRUD operations:
```typescript
@Injectable()
export class ExampleService {
  constructor(
    @InjectRepository(Example)
    private readonly repository: Repository<Example>,
  ) {}

  async findAll(): Promise<Example[]> {
    return this.repository.find();
  }
}
```

### Module Imports
Import TypeORM entities in modules:
```typescript
@Module({
  imports: [TypeOrmModule.forFeature([Example])],
  controllers: [ExampleController],
  providers: [ExampleService],
})
export class ExampleModule {}
```

### DTOs
Use class-validator for input validation:
```typescript
export class CreateExampleDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;
}
```

### Guards
Apply CASL guards for permissions:
```typescript
@UseGuards(PermissionsGuard)
@Controller('example')
export class ExampleController {
  @CheckPermissions(Permission.CreateExample)
  @Post()
  create(@Body() dto: CreateExampleDto) {
    // implementation
  }
}
```

## Development Workflow

### Environment Setup
Create `.env` with:
```
DATABASE_URL=postgresql://user:pass@localhost:5432/db
WHAPI_URL=https://api.whapi.cloud
WHAPI_TOKEN=your_token
WHATSAPP_NUMBER=1234567890

JWT_SECRET=your_secret
PORT=3000
```

### Running the App
```bash
npm install
npm run start:dev  # Watch mode with hot reload
npm run build      # Production build
npm run start:prod # Run built app
```

### Code Quality
```bash
npm run lint    # ESLint with auto-fix
npm run format  # Prettier formatting
npm run test    # Jest unit tests
npm run test:e2e # End-to-end tests
```

### Debugging
```bash
npm run start:debug  # Debug mode with inspector
```

## WhatsApp Integration
- Messages received via WHAPI webhooks in `WhapiService.handleIncomingMessage()`
- Outgoing messages via `WhapiService.sendTextMessage()`
- Agent assignment through `WhatsappAgentService.assignAgent()`
- Message content extraction in `whapi/utile/message-type.ts`

## Common Tasks
- Add new entities: Create entity, service, controller, module, DTOs, then import in app.module.ts
- Add permissions: Define in permissions module, link to roles via role-permissions
- Handle webhooks: Add logic in whapi.service.ts for new message types
- Real-time updates: Use WebSocket gateways in whatsapp_* modules

## Missing Components
- `users/` module needs implementation (entity exists, referenced in auth)
- Some services are stubbed (basic CRUD not fully implemented)
- Database migrations not configured

## File References
- Main app: `src/main.ts`, `src/app.module.ts`
- Auth flow: `src/auth/`
- Permissions: `src/casl/`, `src/permissions/`
- WhatsApp API: `src/whapi/`
- Database config: `src/database/database.module.ts`