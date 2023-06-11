import { pino } from 'pino'
import pinoHttp, { type HttpLogger } from 'pino-http'

export const logger = pino({
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true,
    },
  },
})

/**
 * Pino Http Logger for Express
 * @returns
 */
export function httpLogger(): HttpLogger {
  return pinoHttp({
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true,
        ignore: 'req,res,responseTime',
      },
    },

    // Define a custom receive message
    customReceivedMessage: function (req, res) {
      // @ts-expect-error
      const endpoint = `${req?.hostname}${req?.originalUrl}`

      return `request received: ${req.method} ${endpoint}`
    },

    // Define a custom success message
    customSuccessMessage: function (req, res) {
      // @ts-expect-error
      const endpoint = `${req?.hostname}${req?.originalUrl}`

      if (res.statusCode === 404) {
        return 'resource not found'
      }

      return `${res.statusCode} ${req.method} ${endpoint} completed`
    },

    // Define a custom error message
    customErrorMessage: function (req, res, err) {
      return `request errored with status code: ${res.statusCode}, error : ${err.message}`
    },
  })
}
