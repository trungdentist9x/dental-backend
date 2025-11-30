// index.js
require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const axios = require('axios');

const { triageRule, summaryText } = require('./utils/triage');
const { initMailer, sendEmail } = require('./utils/mailer');
const { sendSMSViaGateway } = require('./utils/sms');

const app = express();
app.use(cors());
app.use(bodyParser.json());

// Khởi tạo email sender
initMailer(process.env);

// Lưu tạm trong RAM (không có database)
const DB = { responses: [], appointments: [] };

// Hàm gọi webhook (Chatbase Action hoặc endpoint khác)
async function callUrl(url, payload){
  if (!url) return false;
  try {
    await axios.post(url, payload, { timeout: 8000 });
    return true;
  } catch(e){
    console.error('callUrl failed:', url, e.message);
    return false;
  }
}

/**
 * 1️⃣ Webhook nhận dữ liệu từ Google Form
 *    /webhook/form-submit
 */
app.post('/webhook/form-submit', async (req,res) => {
  const data = req.body || {};
  data.timestamp = new Date().toISOString();

  // 1. Lưu dữ liệu thô
  DB.responses.push(data);

  // 2. Gửi về Chatbase Action lưu CRM (nếu cấu hình)
  if (process.env.SAVE_RESPONSE_API) {
    callUrl(process.env.SAVE_RESPONSE_API, data);
  }

  // 3. Phân loại hậu phẫu
  const classification = triageRule(data);

  // 4. Xử lý theo phân loại
  if (classification === 'red') {
    const payload = { ...data, classification, summary: summaryText(data) };

    // Thông báo bác sĩ
    if (process.env.NOTIFY_CLINICIAN_API) {
      await callUrl(process.env.NOTIFY_CLINICIAN_API, payload);
    }

    // Gửi SMS khẩn cho bệnh nhân
    if (process.env.SMS_GATEWAY_URL && process.env.SMS_API_KEY && data.phone) {
      await sendSMSViaGateway(
        process.env.SMS_GATEWAY_URL,
        process.env.SMS_API_KEY,
        data.phone,
        '⚠️ KHẨN: Hậu phẫu có dấu hiệu nguy hiểm. Bác sĩ đã được thông báo. Hãy gọi hotline ngay.'
      );
    }

    // Gửi email hướng dẫn khẩn cấp
    if (data.email) {
      await sendEmail(
        data.email,
        '⚠️ Khẩn cấp: Tình trạng hậu phẫu (RED)',
        `<p>Tình trạng được phân loại <b>RED (khẩn cấp)</b>. Bác sĩ đã được thông báo ngay lập tức.</p>
         <p>Nếu triệu chứng tăng lên, hãy gọi hotline hoặc đến cơ sở cấp cứu gần nhất.</p>
         <pre>${summaryText(data)}</pre>`
      );
    }

  } else if (classification === 'yellow') {

    // Email nhóm cần theo dõi
    if (data.email) {
      await sendEmail(
        data.email,
        'Theo dõi hậu phẫu (YELLOW)',
        `<p>Tình trạng cần theo dõi sát. Nhân viên y tế sẽ gọi lại trong vòng 1–2 giờ.</p>`
      );
    }

  } else { // GREEN

    if (data.email) {
      await sendEmail(
        data.email,
        'Hướng dẫn chăm sóc hậu phẫu (GREEN)',
        `<p>Tình trạng ổn định. Tiếp tục chăm sóc theo hướng dẫn:</p>
         <ul>
           <li>Chườm lạnh 20 phút mỗi 2 giờ</li>
           <li>Uống thuốc theo đơn</li>
           <li>Không khạc nhổ mạnh</li>
         </ul>`
      );
    }
  }

  // 5. Trả kết quả cho Google Script xem
  return res.json({ ok: true, classification });
});

/**
 * 2️⃣ Chatbase Action: Lưu thông tin
 */
app.post('/api/save-response', (req,res) => {
  const data = req.body || {};
  data.timestamp = new Date().toISOString();
  DB.responses.push(data);
  return res.json({ ok: true });
});

/**
 * 3️⃣ Chatbase Action: Thông báo bác sĩ
 */
app.post('/api/notify-clinician', async (req,res) => {
  const data = req.body || {};

  // Gửi email cho bác sĩ trực
  if (process.env.CLINICIAN_EMAIL) {
    await sendEmail(
      process.env.CLINICIAN_EMAIL,
      '⚠️ Cảnh báo hậu phẫu (RED)',
      `<pre>${JSON.stringify(data, null, 2)}</pre>`
    );
  }

  // Gửi SMS nếu có số
  if (process.env.CLINICIAN_PHONE && process.env.SMS_GATEWAY_URL && process.env.SMS_API_KEY) {
    await sendSMSViaGateway(
      process.env.SMS_GATEWAY_URL,
      process.env.SMS_API_KEY,
      process.env.CLINICIAN_PHONE,
      `RED ALERT: ${data.name} - ${data.phone}`
    );
  }

  return res.json({ ok: true });
});

/**
 * 4️⃣ Gửi email cho bệnh nhân
 */
app.post('/api/send-email', async (req,res) => {
  const { email, subject, html } = req.body;
  await sendEmail(email, subject, html);
  return res.json({ ok: true });
});

/**
 * 5️⃣ Gửi SMS
 */
app.post('/api/send-sms', async (req,res) => {
  const { phone, message } = req.body;
  const ok = await sendSMSViaGateway(
    process.env.SMS_GATEWAY_URL,
    process.env.SMS_API_KEY,
    phone,
    message
  );
  return res.json({ ok });
});

/**
 * 6️⃣ Tạo lịch hẹn tự động
 */
app.post('/api/create-appointment', (req,res) => {
  const d = req.body || {};
  const appt = {
    id: `APPT-${Date.now()}`,
    name: d.name,
    phone: d.phone,
    date: d.preferred_date,
    procedure: d.procedure
  };

  DB.appointments.push(appt);

  if (d.email) {
    sendEmail(
      d.email,
      'Xác nhận lịch hẹn',
      `<p>Lịch hẹn đã được tạo:</p>
       <p>${appt.date} – ${appt.procedure}</p>`
    );
  }

  return res.json({ ok: true, appointment: appt });
});

/**
 * Start server
 */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Dental backend running on port ' + PORT));
