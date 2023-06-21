import * as yup from 'yup'

const create = yup
  .object({
    scan: yup.boolean().required('scan is required'),
    session: yup.string().required('session is required'),
  })
  .required()

const wasocketSchema = { create }

export default wasocketSchema
