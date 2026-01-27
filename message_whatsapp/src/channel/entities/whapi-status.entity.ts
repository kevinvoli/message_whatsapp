import { Column } from "typeorm";

export class WhapiStatus {
  @Column({ type: 'int' })
  code: number;

  @Column()
  text: string;
}