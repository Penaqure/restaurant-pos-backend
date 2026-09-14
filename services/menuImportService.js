const path = require("path");
const { parse } = require("csv-parse/sync");

// Parses an uploaded CSV or JSON file into an array of plain row objects.
// Both formats are expected to use the same column/key names.
function parseImportFile(file) {
  const ext = path.extname(file.originalname).toLowerCase();

  if (ext === ".json") {
    let data;
    try {
      data = JSON.parse(file.buffer.toString("utf8"));
    } catch (err) {
      throw new Error("Invalid JSON file");
    }
    if (!Array.isArray(data)) {
      throw new Error("JSON file must contain an array of records");
    }
    return data;
  }

  try {
    return parse(file.buffer, {
      columns: (header) => header.map((h) => h.trim()),
      skip_empty_lines: true,
      trim: true,
      bom: true,
    });
  } catch (err) {
    throw new Error("Invalid CSV file");
  }
}

function toBoolean(value, defaultValue) {
  if (value === undefined || value === null || value === "") return defaultValue;
  if (typeof value === "boolean") return value;
  const normalized = String(value).trim().toLowerCase();
  if (["true", "1", "yes", "y"].includes(normalized)) return true;
  if (["false", "0", "no", "n"].includes(normalized)) return false;
  return defaultValue;
}

function toDecimal(value) {
  if (value === undefined || value === null || value === "") return null;
  const num = Number(String(value).trim());
  return Number.isFinite(num) ? num : null;
}

function toInt(value, defaultValue) {
  if (value === undefined || value === null || value === "") return defaultValue;
  const num = parseInt(String(value).trim(), 10);
  return Number.isFinite(num) ? num : defaultValue;
}

module.exports = { parseImportFile, toBoolean, toDecimal, toInt };
