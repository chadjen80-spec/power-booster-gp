# ระบบจ่ายเงินจริง (Starter Pack)

เวอร์ชันเว็บขาย **Starter Pack 35 บาท** (สกินตำนาน "เอซ" + 🪙 1,000) ผ่าน **Stripe** (บัตร / พร้อมเพย์)
และเก็บบัญชีผู้เล่นกับประวัติการซื้อไว้ใน **Supabase** ระบบจะปิดอยู่จนกว่าจะใส่คีย์ครบทั้ง 5 ตัว

```
ผู้เล่นกด ซื้อ → เข้าสู่ระบบด้วยลิงก์ทางอีเมล (Supabase)
→ server.js สร้าง Stripe Checkout → ผู้เล่นจ่ายบนหน้า Stripe
→ Stripe แจ้ง /api/stripe-webhook (มีลายเซ็นยืนยัน) → บันทึกลงตาราง purchases
→ เกมอ่าน /api/purchases แล้วให้ของ (เปลี่ยนเครื่องก็ได้ของคืน)
```

ไฟล์ที่เกี่ยวข้อง: `payments.js` (ฝั่งเซิร์ฟเวอร์ + ราคา), `js/pay.js` (ฝั่งเกม), `js/shop.js` (`PB.PRODUCTS` ของในแพ็ก), `supabase/schema.sql`

> แอป Android ไม่แสดงปุ่มซื้อ: ถ้าจะขึ้น Google Play ต้องใช้ Google Play Billing แยกต่างหาก

## 1. Supabase (บัญชีผู้เล่น + ฐานข้อมูล)

1. สมัครที่ https://supabase.com → **New project** (เลือก region Singapore)
2. **SQL Editor** → New query → วางเนื้อหา `supabase/schema.sql` → **Run**
3. **Authentication → URL Configuration**
   - Site URL: `https://power-booster-gp.onrender.com` (ลิงก์ Render ของคุณ)
   - Redirect URLs: เพิ่มลิงก์ Render และ `http://localhost:3000`
4. **Project Settings → API** จดค่า: Project URL, `anon` key, `service_role` key
   (`service_role` เข้าถึงข้อมูลได้ทั้งหมด ห้ามใส่ในโค้ดเกมหรือส่งให้ใคร)
5. ก่อนเปิดขายจริง: **Authentication → SMTP Settings** ตั้งค่าอีเมลของตัวเอง
   (อีเมลของ Supabase เองส่งได้แค่ไม่กี่ฉบับต่อชั่วโมง ใช้ทดสอบเท่านั้น)

## 2. Stripe (รับเงิน)

1. สมัครที่ https://stripe.com เลือกประเทศ **Thailand** — เริ่มจาก **Test mode** (สวิตช์มุมขวาบน)
2. **Settings → Payment methods** เปิด **Cards** และ **PromptPay**
3. **Developers → API keys** จด **Secret key** (`sk_test_...`)
4. **Developers → Webhooks → Add endpoint**
   - URL: `https://power-booster-gp.onrender.com/api/stripe-webhook`
   - Events: `checkout.session.completed` และ `checkout.session.async_payment_succeeded`
   - จด **Signing secret** (`whsec_...`)

## 3. ใส่คีย์

**บนเครื่องตัวเอง (ทดสอบ):** คัดลอก `.env.example` เป็น `.env` แล้วกรอกคีย์ **test** (`.env` ไม่ถูก commit)
แล้ว `npm start` — บรรทัดแรกต้องขึ้นว่า `payments on`

ทดสอบ webhook บนเครื่องด้วย [Stripe CLI](https://stripe.com/docs/stripe-cli):

```bash
stripe listen --forward-to localhost:3000/api/stripe-webhook
```

ใช้ `whsec_...` ที่คำสั่งนี้พิมพ์ออกมาเป็น `STRIPE_WEBHOOK_SECRET` ใน `.env`
(ถ้าไม่ได้รันคำสั่งนี้ ระบบก็ยังให้ของได้ตอนผู้เล่นกลับจากหน้าจ่ายเงิน ผ่าน `/api/confirm`)

**บน Render:** service → **Environment** → ใส่ `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`,
`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` → Save (Render จะ deploy ใหม่เอง)

## 4. ทดสอบจ่ายเงิน (Test mode ไม่มีเงินจริง)

- บัตรทดสอบ: `4242 4242 4242 4242` วันหมดอายุอนาคตอะไรก็ได้ CVC 3 หลักอะไรก็ได้
- พร้อมเพย์: หน้าทดสอบของ Stripe มีปุ่มจำลองว่าจ่ายสำเร็จ
- ดูรายการที่ Stripe → Payments และ Supabase → Table Editor → `purchases`

## 5. ก่อนเปิดขายจริง

- Stripe: ยืนยันตัวตน/ธุรกิจ และบัญชีธนาคาร แล้วเปลี่ยนเป็นคีย์ **live** (`sk_live_...`) + สร้าง webhook ใหม่ใน Live mode
- มีหน้า **เงื่อนไขการซื้อและนโยบายคืนเงิน** และช่องทางติดต่อ (Stripe กำหนด)
- ภาษี: รายได้จากการขายต้องยื่นภาษี และถ้ารายได้เกิน 1.8 ล้านบาท/ปี ต้องจด VAT — ปรึกษานักบัญชี
- ผู้เล่นอายุน้อย: ควรมีข้อความให้ขออนุญาตผู้ปกครองก่อนซื้อ
- ถ้าผู้เล่นจ่ายซ้ำ (เปิดหน้าจ่าย 2 หน้าพร้อมกัน) เซิร์ฟเวอร์จะเก็บไว้รายการเดียวและเขียน log
  `duplicate starter ... refund it in the Stripe dashboard` — ให้คืนเงินรายการนั้นใน Stripe

## ข้อจำกัดตอนนี้

เหรียญและสกินยังเก็บในเบราว์เซอร์ของผู้เล่น (localStorage) ส่วนที่ปลอดภัยคือ **ประวัติการซื้อ** ซึ่งอยู่บนเซิร์ฟเวอร์
ผลคือผู้ที่ซื้อแล้วจะได้ของในแพ็กบนทุกเครื่องที่เข้าสู่ระบบ (รวมเหรียญ 1,000 ต่อเครื่อง)
ถ้าจะขาย Gems หรือ Season Pass พรีเมียม ควรย้ายเหรียญและความคืบหน้าทั้งหมดขึ้น Supabase ก่อน
