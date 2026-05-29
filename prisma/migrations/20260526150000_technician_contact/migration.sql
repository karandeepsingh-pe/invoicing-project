-- Technician contact fields: phone (contact no) + email. Shown on the dispatch
-- tracker (engineer phone/email) and the day-grid (Contact No). Informational —
-- no uniqueness (User.email is the unrelated login identity).

ALTER TABLE "technicians" ADD COLUMN     "phone" TEXT,
ADD COLUMN     "email" TEXT;
