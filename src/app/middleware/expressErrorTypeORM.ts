import { type NextFunction, type Request, type Response } from 'express'
import { QueryFailedError } from 'typeorm'
import { logger } from '~/config/pino'

/**
 * Express Error TypeORM
 * @param err
 * @param req
 * @param res
 * @param next
 * @returns
 */
async function expressErrorTypeORM(
  err: any,
  req: Request,
  res: Response,
  next: NextFunction
): Promise<Response<any, Record<string, any>> | undefined> {
  if (err instanceof QueryFailedError) {
    const errType = 'TypeORM Error:'
    const message = err.message ?? err

    logger.error(`${errType}, ${message}`)

    return res.status(400).json({
      code: 400,
      message: `${errType} ${err.message}`,
    })
  }

  next(err)
}

export default expressErrorTypeORM
