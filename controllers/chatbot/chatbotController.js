const chatbotService = require("../../services/chatbotService");
const logger = require("../../utils/logger");

const MAX_QUESTION_LENGTH = 300;

// The preset questions -- the frontend renders these as buttons, and
// clicking one just sends its label back as the question text through the
// same /ask endpoint as typed text. Route-level authorizeRoles already
// limits who ever reaches this (see chatbotRoutes.js).
function questions(req, res) {
  res.json({ questions: chatbotService.listQuestions() });
}

async function ask(req, res, next) {
  try {
    const text = req.body?.text;
    if (typeof text !== "string" || text.trim().length === 0 || text.length > MAX_QUESTION_LENGTH) {
      return res.status(400).json({ message: `question must be 1-${MAX_QUESTION_LENGTH} characters` });
    }

    const answer = await chatbotService.answerQuestion({
      text,
      vendorId: req.vendorId,
      branchId: req.branchId,
    });
    res.json({ answer });
  } catch (err) {
    logger.error("chatbot.failed", { error: err.message, userId: req.user?.id, vendorId: req.vendorId });
    next(err);
  }
}

module.exports = { questions, ask };
