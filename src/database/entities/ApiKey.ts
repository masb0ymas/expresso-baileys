import { Column, DeleteDateColumn, Entity, Index } from 'typeorm'
import { Base, type IBaseEntity } from './Base'

interface ApiKeyEntity extends IBaseEntity {
  deleted_at?: Date | null
  accessKey: string
  secretKey: string
}

export type ApiKeyAttributes = Omit<
  ApiKeyEntity,
  'id' | 'created_at' | 'updated_at' | 'deleted_at'
>

@Entity()
export class ApiKey extends Base {
  @Index()
  @DeleteDateColumn({ nullable: true })
  deleted_at!: Date

  @Index()
  @Column()
  accessKey: string

  @Column()
  secretKey: string
}
