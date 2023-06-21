import * as yup from 'yup'

const sendMessage = yup.object({
  session_id: yup.string().required('session_id is required'),
  phone: yup.string().required('phone is required'),
  message: yup.string().required('message is required'),
})

const whatsappSchema = { sendMessage }

export default whatsappSchema
