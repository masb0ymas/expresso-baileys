import { randomString } from 'expresso-core'
import _ from 'lodash'
import { type MigrationInterface, type QueryRunner } from 'typeorm'
import { AppDataSource } from '../data-source'
import { ApiKey } from '../entities/ApiKey'

const data = [
  {
    accessKey: randomString.generate(20),
    secretKey: randomString.generate(35),
  },
]

const formData: any[] = []

if (!_.isEmpty(data)) {
  for (let i = 0; i < data.length; i += 1) {
    const item = data[i]

    formData.push({
      ...item,
      created_at: new Date(),
      updated_at: new Date(),
    })
  }
}

export class ApiKey1686407127653 implements MigrationInterface {
  public async up(_: QueryRunner): Promise<void> {
    // save
    await AppDataSource.getRepository(ApiKey).save(formData)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE * FROM api_key`)
  }
}
