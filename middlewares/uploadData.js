const multer = require("multer");
const path = require("path");

// Menu import files (CSV/JSON) are parsed in memory and never written to
// disk, unlike image uploads in upload.js.
const ALLOWED_EXTENSIONS = new Set([".csv", ".json"]);

function fileFilter(req, file, cb) {
  const ext = path.extname(file.originalname).toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    return cb(new Error("Only .csv or .json files are allowed"));
  }
  cb(null, true);
}

const uploadData = multer({
  storage: multer.memoryStorage(),
  fileFilter,
  limits: { fileSize: 2 * 1024 * 1024 },
});

module.exports = uploadData;
