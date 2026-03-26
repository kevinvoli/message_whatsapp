import { DomainError } from 'src/domain/shared/domain.error';

export interface AgentProps {
  id: string;
  email: string;
  name: string;
  posteId?: string | null;
  isConnected: boolean;
  lastConnectionAt?: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
  deletedAt?: Date | null;
}

export class Agent {
  readonly id: string;
  readonly email: string;
  readonly name: string;
  readonly posteId: string | null;
  private _isConnected: boolean;
  readonly lastConnectionAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly deletedAt: Date | null;

  private constructor(props: AgentProps) {
    this.id = props.id;
    this.email = props.email;
    this.name = props.name;
    this.posteId = props.posteId ?? null;
    this._isConnected = props.isConnected;
    this.lastConnectionAt = props.lastConnectionAt ?? null;
    this.createdAt = props.createdAt ?? new Date();
    this.updatedAt = props.updatedAt ?? new Date();
    this.deletedAt = props.deletedAt ?? null;
  }

  static create(props: AgentProps): Agent {
    if (!props.email) throw new DomainError('email est requis');
    if (!props.name) throw new DomainError('name est requis');
    return new Agent(props);
  }

  get isConnected(): boolean {
    return this._isConnected;
  }

  connect(): Agent {
    return new Agent({ ...this.toProps(), isConnected: true, lastConnectionAt: new Date() });
  }

  disconnect(): Agent {
    return new Agent({ ...this.toProps(), isConnected: false });
  }

  isAssignedToPoste(posteId: string): boolean {
    return this.posteId === posteId;
  }

  toProps(): AgentProps {
    return {
      id: this.id,
      email: this.email,
      name: this.name,
      posteId: this.posteId,
      isConnected: this._isConnected,
      lastConnectionAt: this.lastConnectionAt,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      deletedAt: this.deletedAt,
    };
  }
}
