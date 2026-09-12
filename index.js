const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { defineSecret } = require("firebase-functions/params");
const logger = require("firebase-functions/logger");

const MNOTIFY_API_KEY = defineSecret("MNOTIFY_API_KEY");
const MNOTIFY_SENDER_ID = defineSecret("MNOTIFY_SENDER_ID");

// Fires automatically whenever a new document is added to the
// "registrations" collection (i.e. whenever someone submits the RSVP form).
exports.sendRsvpConfirmation = onDocumentCreated(
  {
    document: "registrations/{docId}",
    secrets: [MNOTIFY_API_KEY, MNOTIFY_SENDER_ID],
  },
  async (event) => {
    const data = event.data?.data();
    if (!data) return;

    // Only text people who said they're coming.
    if (data.attending !== "yes") {
      logger.info("Not attending — no SMS sent", { doc: event.params.docId });
      return;
    }

    const phone = normalizeGhanaPhone(data.phone);
    if (!phone) {
      logger.warn("Could not parse phone number — no SMS sent", {
        doc: event.params.docId,
        rawPhone: data.phone,
      });
      return;
    }

    const message =
      `Hi ${data.name}, you're confirmed for GRACE INVASION on Sat 14th Nov 2026, ` +
      `8AM at Living Grace Business Centre, Berlin Top - Sunyani. We're expecting you!`;

    try {
      const res = await fetch(
        `https://api.mnotify.com/api/sms/quick?key=${MNOTIFY_API_KEY.value()}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            recipient: [phone],
            sender: MNOTIFY_SENDER_ID.value(),
            message,
            is_schedule: false,
            schedule_date: "",
          }),
        }
      );
      const result = await res.json().catch(() => ({}));
      logger.info("mNotify response", { doc: event.params.docId, result });
    } catch (err) {
      logger.error("mNotify request failed", { doc: event.params.docId, err: String(err) });
    }
  }
);

// mNotify expects Ghana numbers in local format, e.g. "0241234567".
// This accepts what people commonly type: "0241234567", "+233241234567",
// "233241234567", or with spaces/dashes, and normalizes to local format.
function normalizeGhanaPhone(raw) {
  if (!raw) return null;
  const digits = String(raw).replace(/[^\d]/g, "");
  if (digits.startsWith("233") && digits.length === 12) {
    return "0" + digits.slice(3);
  }
  if (digits.startsWith("0") && digits.length === 10) {
    return digits;
  }
  return null;
}
