import { google } from "googleapis";

const auth = new google.auth.GoogleAuth({
    keyFile: "credentials.json",
    scopes: ["https://www.googleapis.com/auth/spreadsheets"]
});

const sheets = google.sheets({ version: "v4", auth });

const SPREADSHEET_ID = "1vaYCxcRqm5yeVa6Fxwc5wee-aHagU2hOpq39ipNfwOs";

export async function appendExamResult(row) {
    await sheets.spreadsheets.values.append({
        spreadsheetId: SPREADSHEET_ID,
        range: "Results",          // ⭐ CHỈ CẦN TÊN SHEET
        valueInputOption: "RAW",
        insertDataOption: "INSERT_ROWS",
        requestBody: {
            values: [row]
        }
    });
}
