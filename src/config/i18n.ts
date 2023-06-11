import i18next from 'i18next'
import i18nextBackend from 'i18next-fs-backend'
import { logger } from './pino'

/**
 * i18n
 */
void i18next.use(i18nextBackend).init(
  {
    lng: 'id',
    fallbackLng: 'id',
    preload: ['en', 'id'],
    ns: ['translation'],
    defaultNS: 'translation',
    backend: {
      loadPath: 'assets/locales/{{lng}}/{{ns}}.json',
    },
  },
  (err, _t) => {
    if (err) {
      console.error(err)
      return
    }

    logger.info('i18next', 'is ready...')
  }
)

export const i18n = i18next
