import * as yup from 'yup'

const sendMessage = yup.object({
  phone: yup.string().required('phone is required'),
  message: yup.string().required('message is required'),
})

const whatsappSchema = { sendMessage }

export default whatsappSchema
