import { createDirNotExist, randomString } from 'expresso-core'
import fs from 'fs'
import path from 'path'
import { logger } from '~/config/pino'

/**
 *
 * @param value
 * @param regExp
 */
function generateEnv(value: string, regExp: RegExp): void {
  const pathRes = path.resolve('.env')

  if (!fs.existsSync(pathRes)) {
    const errType = 'Missing env!!!'
    throw new Error(
      `${errType}\nCopy / Duplicate '.env.example' root directory to '.env'`
    )
  }

  const contentEnv = fs.readFileSync(pathRes, { encoding: 'utf-8' })

  const uniqueCode = randomString.generate()
  const valueEnv = `${value}=${uniqueCode}`

  if (contentEnv.includes(`${value}=`)) {
    // change value
    const replaceContent = contentEnv.replace(regExp, valueEnv)
    fs.writeFileSync(`${pathRes}`, replaceContent)

    const message = `Refresh ${value} = ${uniqueCode}`
    logger.info(message)
  } else {
    // Generate value
    const extraContent = `${valueEnv}\n\n${contentEnv}`
    fs.writeFileSync(`${pathRes}`, extraContent)

    const message = `Generate ${value} = ${uniqueCode}`
    logger.info(message)
  }
}

const listDirectory = ['public/uploads/temp', 'public/uploads/excel']

for (let i = 0; i < listDirectory.length; i += 1) {
  const dir = listDirectory[i]
  createDirNotExist(dir)
}

// generate app key
generateEnv('APP_KEY', /APP_KEY=(.*)?/)

// generate secret otp
generateEnv('SECRET_OTP', /SECRET_OTP=(.*)?/)

// generate jwt secret access token
generateEnv('JWT_SECRET_ACCESS_TOKEN', /JWT_SECRET_ACCESS_TOKEN=(.*)?/)

// generate jwt secret refresh token
generateEnv('JWT_SECRET_REFRESH_TOKEN', /JWT_SECRET_REFRESH_TOKEN=(.*)?/)
