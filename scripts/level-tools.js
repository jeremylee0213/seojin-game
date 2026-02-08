#!/usr/bin/env node
"use strict";

const fs = require("fs");

function usage() {
  console.log("Usage:");
  console.log("  node scripts/level-tools.js to-json <map.txt>");
  console.log("  node scripts/level-tools.js from-json <map.json>");
}

function toJson(filePath) {
  const content = fs.readFileSync(filePath, "utf8").trim();
  const rows = content.split(/\r?\n/).map((line) => line.trim());
  const payload = {
    rows,
    width: rows[0] ? rows[0].length : 0,
    height: rows.length,
  };
  console.log(JSON.stringify(payload, null, 2));
}

function fromJson(filePath) {
  const payload = JSON.parse(fs.readFileSync(filePath, "utf8"));
  if (!payload || !Array.isArray(payload.rows)) {
    throw new Error("Invalid JSON: expected { rows: string[] }");
  }
  console.log(payload.rows.join("\n"));
}

function run() {
  const command = process.argv[2];
  const filePath = process.argv[3];

  if (!command || !filePath) {
    usage();
    process.exit(1);
  }

  if (command === "to-json") {
    toJson(filePath);
    return;
  }

  if (command === "from-json") {
    fromJson(filePath);
    return;
  }

  usage();
  process.exit(1);
}

run();
