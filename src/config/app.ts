import compression from 'compression'
import cors from 'cors'
import express, { type Request, type Application, type Response } from 'express'
import userAgent from 'express-useragent'
import helmet from 'helmet'
import i18nextMiddleware from 'i18next-http-middleware'
import _ from 'lodash'
import path from 'path'
import expressErrorResponse from '~/app/middleware/expressErrorResponse'
import expressErrorTypeORM from '~/app/middleware/expressErrorTypeORM'
import expressErrorYup from '~/app/middleware/expressErrorYups'
import { expressRateLimit } from '~/app/middleware/expressRateLimit'
import { expressUserAgent } from '~/app/middleware/expressUserAgent'
import { expressWithState } from '~/app/middleware/expressWithState'
import { AppDataSource } from '~/database/data-source'
import indexRoutes from '~/routes'
import { env } from './env'
import { i18n } from './i18n'
import { httpLogger, logger } from './pino'
import ResponseError from '~/core/modules/response/ResponseError'

export class App {
  private readonly _app: Application
  private readonly _port: number | string

  constructor() {
    this._app = express()
    this._port = env.APP_PORT

    this._plugins()
    this._database()
    this._routes()
  }

  /**
   * Initialize Plugins
   */
  private _plugins(): void {
    this._app.use(compression())
    this._app.use(helmet())
    this._app.use(cors())
    this._app.use(httpLogger())
    this._app.use(express.json({ limit: '200mb', type: 'application/json' }))
    this._app.use(express.urlencoded({ extended: true }))
    this._app.use(express.static(path.resolve(`${__dirname}/../../public`)))
    this._app.use(userAgent.express())
    this._app.use(i18nextMiddleware.handle(i18n))

    // middleware
    this._app.use(expressRateLimit())
    this._app.use(expressWithState())
    this._app.use(expressUserAgent())
  }

  /**
   * Initialize Database
   */
  private _database(): void {
    // connect to database
    AppDataSource.initialize()
      .then((connection) => {
        const dbName = _.get(connection, 'options.database', '')
        const dbConnect = _.get(connection, 'options.type', '')

        const msgType = 'TypeORM'
        const message = `Database ${dbName}, Connection ${dbConnect} has been established successfully.`

        logger.info(`${msgType} ${message}`)
      })
      .catch((err) => {
        const msgType = 'TypeORM - Error :'
        const message = `Unable to connect to the database: ${err}`

        logger.error(`${msgType}, ${message}`)
      })
  }

  /**
   * Initialize Routes
   */
  private _routes(): void {
    this._app.use(indexRoutes)

    // Catch error 404 endpoint not found
    this._app.use('*', function (req: Request, _res: Response) {
      const method = req.method
      const url = req.originalUrl
      const host = req.hostname

      const endpoint = `${host}${url}`

      throw new ResponseError.NotFound(
        `Sorry, the ${endpoint} HTTP method ${method} resource you are looking for was not found.`
      )
    })
  }

  /**
   * Return this Application Bootstrap
   * @returns
   */
  public create(): Application {
    this._app.use(expressErrorYup)
    this._app.use(expressErrorTypeORM)
    this._app.use(expressErrorResponse)

    // set port
    this._app.set('port', this._port)

    return this._app
  }
}
