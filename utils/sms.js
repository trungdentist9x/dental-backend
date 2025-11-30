// utils/sms.js
const axios = require('axios');
async function sendSMSViaGateway(url, apiKey, to, text){
  try{
    await axios.post(url, { api_key: apiKey, to, message: text }, { timeout: 10000 });
    return true;
  }catch(e){
    console.error('SMS send failed', e.message);
    return false;
  }
}
module.exports = { sendSMSViaGateway };
