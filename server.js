import 'dotenv/config';
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { sendExamResult } from "./discordWebhook.js";

const app = express();
const PORT = process.env.PORT || 3000;

/* ================= SETUP ================= */
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

/* ================= TIỆN ÍCH ================= */
function shuffleArray(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function formatMCAnswers(answers, corrects) {
  return answers.map((a, i) => {
    const letter = String.fromCharCode(65 + a);
    return `${letter} ${a === corrects[i] ? "✔" : "✘"}`;
  });
}

/* ================= TRẠNG THÁI ================= */
let examStarted = false;

const activeCorrects = {};   // name -> correct[]
const activeAnswers = {};    // name -> answers[]
const activeScores = {};     // name -> score
const activeQuestions = {};  // name -> questions[] (có q, choices, correct)
const finishedUsers = new Set();

/* ===== LOG + DASHBOARD ===== */
const logs = [];
const results = [];

/* ================= BỘ ĐỀ ================= */
/* ================= CÂU HỎI LÝ THUYẾT (30 CÂU) ================= */
const QUESTION_BANK = [
  {
    q: "Theo quy định về phạm vi thẩm quyền, lực lượng nào có quyền hạn tuần tra trên tất cả các xa lộ, đường phố và có thể thực thi pháp luật ở bất kỳ nơi nào trong tiểu bang San Andreas?",
    choices: [
      "Los Santos Police Department (LSPD)",
      "San Andreas State Police (SASP)",
      "Senora Desert Sheriff's Office (SDSO)",
      "Paleto Bay Sheriff's Office (PBSO)"
    ],
    answer: 1
  },
  {
    q: "Trong các quy định nội bộ của LSPD, hành vi nào sau đây bị NGHIÊM CẤM?",
    choices: [
      "Đỗ xe riêng trong bãi đỗ xe riêng của sở",
      "Nghỉ ngơi khi mang đồng phục ở nơi người dân không nhìn thấy",
      "Sử dụng xe của tổ chức vào mục đích cá nhân",
      "Mang theo Bảo hiểm Y tế và Giấy phép Súng khi làm nhiệm vụ"
    ],
    answer: 2
  },
  {
    q: "Mã đàm (10-code) nào được sử dụng khi sĩ quan tiến hành dừng xe để xử lý các lỗi giao thông (Traffic Stop)?",
    choices: ["10-26", "10-29", "10-31", "10-96"],
    answer: 0
  },
  {
    q: "Sự khác biệt chính giữa Code 2 (C2) và Code 3 (C3) trong hệ thống mã tình huống của LSPD là gì?",
    choices: [
      "Code 2 chỉ bật đèn, Code 3 bật cả đèn và còi",
      "Code 2 bật đèn và còi, Code 3 bật đèn và còi đôi",
      "Code 2 không cần hỗ trợ, Code 3 cần hỗ trợ gấp",
      "Code 2 dành cho tội phạm ít nguy hiểm, Code 3 dành cho trọng tội"
    ],
    answer: 1
  },
  {
    q: "Khi thực hiện một cuộc Traffic Stop, vị trí xe cảnh sát nên đặt ở đâu để đảm bảo an toàn cho sĩ quan?",
    choices: [
      "Chặn ngay phía trước xe của công dân",
      "Dừng song song với xe của công dân",
      "Dừng ở phía sau xe cần tiếp cận (tạo lá chắn)",
      "Dừng cách xa 50 mét"
    ],
    answer: 2
  },
  {
    q: "Trong quy trình Felony Stop, cần ít nhất bao nhiêu sĩ quan và đội hình xe nên bố trí thế nào?",
    choices: [
      "2 sĩ quan, xếp hàng ngang",
      "3 sĩ quan, đội hình chữ V lộn ngược",
      "5 sĩ quan, bao vây xung quanh",
      "4 sĩ quan, nối đuôi nhau"
    ],
    answer: 1
  },
  {
    q: "Nếu nghi phạm không trả lời sau khi được đọc Quyền Miranda, sĩ quan phải làm gì tiếp theo?",
    choices: [
      "Đưa nghi phạm về sở",
      "Đọc lại quyền Miranda tối đa 3 lần",
      "Dùng súng điện",
      "Gọi luật sư đến hiện trường"
    ],
    answer: 1
  },
  {
    q: "Điều kiện BẮT BUỘC để thực hiện Pit Maneuver là gì?",
    choices: [
      "Nghi phạm lái xe quá nhanh",
      "Có chứng chỉ hoặc lệnh cấp trên",
      "Khu vực đông dân cư",
      "Xe cảnh sát bị hỏng"
    ],
    answer: 1
  },
  {
    q: "Vũ lực gây chết người (Lethal Force) được xem là phương án nào?",
    choices: [
      "Phương án đầu tiên",
      "Phương án cuối cùng khi có đe dọa tính mạng",
      "Tùy chọn cá nhân",
      "Để chặn nghi phạm bỏ chạy"
    ],
    answer: 1
  },
  {
    q: "Để nhận chứng chỉ Field Training Instructor, sĩ quan phải đạt cấp bậc tối thiểu nào?",
    choices: ["Officer", "Corporal", "Sergeant", "Lieutenant"],
    answer: 2
  },
  {
    q: "Theo quy định Bodycam, thời gian tối thiểu lưu trữ cảnh quay là bao lâu?",
    choices: ["24 giờ", "48 giờ", "72 giờ", "7 ngày"],
    answer: 1
  },
  {
    q: "Muốn đề xuất thăng chức, sĩ quan phải hoàn thành tối thiểu bao nhiêu ngày ở cấp bậc hiện tại?",
    choices: ["3 ngày", "7 ngày", "14 ngày", "Không cần điều kiện"],
    answer: 1
  },
  {
    q: "Sĩ quan LSPD được tuần tra tự do ở đâu?",
    choices: [
      "Toàn bộ San Andreas",
      "Sandy Shores & Paleto Bay",
      "Chỉ trong thành phố Los Santos",
      "Trên xa lộ liên bang"
    ],
    answer: 2
  },
  {
    q: "Sĩ quan được phép ngủ khi mang đồng phục trong trường hợp nào?",
    choices: [
      "Bất cứ khi nào",
      "Trong xe đã tắt máy",
      "Ở nơi người dân không nhìn thấy",
      "Tuyệt đối không được ngủ"
    ],
    answer: 2
  },
  {
    q: "Đối với xe công vụ, hành vi nào VI PHẠM nghiêm trọng?",
    choices: [
      "Để Medical Kit",
      "Để đồ cá nhân trong xe",
      "Chặn hiện trường tai nạn",
      "Đỗ xe đúng nơi"
    ],
    answer: 1
  },
  {
    q: "Tình huống Code 3 yêu cầu phương tiện di chuyển thế nào?",
    choices: [
      "Chỉ bật đèn",
      "Bật đèn và còi",
      "Bật đèn và còi kép",
      "Tắt đèn còi"
    ],
    answer: 2
  },
  {
    q: "Mã radio 10-00 có nghĩa là gì?",
    choices: [
      "Officer Down",
      "Đánh nhau",
      "Nổ súng",
      "Kết thúc ca"
    ],
    answer: 0
  },
  {
    q: "Mã 10-14 được dùng khi nào?",
    choices: [
      "Đã đưa về phòng giam",
      "Áp giải người bị thương đến bệnh viện",
      "Xe nghi vấn chở chất cấm",
      "Yêu cầu xe cứu thương"
    ],
    answer: 1
  },
  {
    q: "Báo cáo Felony Stop sử dụng mã nào?",
    choices: ["10-26", "10-29", "10-31", "10-55"],
    answer: 1
  },
  {
    q: "Xe P.O.S số 3 trong đội hình truy đuổi có nhiệm vụ gì?",
    choices: [
      "Giữ visual",
      "Thay thế xe lead",
      "Block đường, cảnh cáo phương tiện khác",
      "PIT ngay"
    ],
    answer: 2
  },
  {
    q: "PIT Maneuver chỉ được phép khi tốc độ dưới mức nào?",
    choices: [
      "40-50 MPH",
      "60-70 MPH",
      "80-90 MPH",
      "Không giới hạn"
    ],
    answer: 1
  },
  {
    q: "Khi Felony Stop, 3 xe đầu tiên xếp đội hình gì?",
    choices: [
      "Hàng dọc",
      "Chữ V lộn ngược",
      "Vây tròn",
      "Song song"
    ],
    answer: 1
  },
  {
    q: "Thời gian tối đa giữ nghi phạm để thu thập chứng cứ là bao lâu?",
    choices: [
      "12-24 giờ",
      "30-45 phút",
      "2-3 tiếng",
      "48 giờ"
    ],
    answer: 1
  },
  {
    q: "Quy tắc Miranda: nếu nghi phạm im lặng thì xử lý thế nào?",
    choices: [
      "Đọc tối đa 3 lần, sau đó coi là đã hiểu",
      "Chờ luật sư",
      "Không được thẩm vấn",
      "Đọc liên tục"
    ],
    answer: 0
  },
  {
    q: "Khi nổ súng trong truy đuổi, quy định ĐÚNG là gì?",
    choices: [
      "Bắn lốp xe bất cứ lúc nào",
      "Không bắn ở khu đông dân cư",
      "Tự do bắn khi chạy quá tốc độ",
      "Cấp thấp nhất quyết định"
    ],
    answer: 1
  },
  {
    q: "Súng trường M4 được sử dụng khi nào?",
    choices: [
      "Mọi sĩ quan mang theo",
      "Chỉ Sergeant trở lên",
      "Có lệnh High Command / chiến dịch",
      "Chỉ K9"
    ],
    answer: 2
  },
  {
    q: "Chứng chỉ Field Training Officer được đào tạo khi đạt cấp bậc nào?",
    choices: [
      "Senior Officer/Deputy",
      "Corporal",
      "Sergeant",
      "Lieutenant"
    ],
    answer: 1
  },
  {
    q: "Lethal Force được phép dùng khi nào?",
    choices: [
      "Nghi phạm bỏ chạy",
      "Nghi phạm xúc phạm",
      "Có mối đe dọa trực tiếp đến tính mạng",
      "Không xuất trình giấy tờ"
    ],
    answer: 2
  },
  {
    q: "Trước khi khám xét cá nhân, sĩ quan bắt buộc làm gì?",
    choices: [
      "Còng tay ngay",
      "Hỏi có mang vật nguy hiểm/bất hợp pháp không",
      "Đọc Miranda",
      "Chờ lệnh chỉ huy"
    ],
    answer: 1
  },
  {
    q: "Cấp bậc nào KHÔNG được tự ý đi tuần tra một mình?",
    choices: [
      "Officer / Deputy",
      "Cadet / Học viên",
      "Senior Officer",
      "Corporal"
    ],
    answer: 1
  }
];

/* ================= BỘ ĐỀ NGHIỆP VỤ (10 CÂU) ================= */
const QUESTION_PATROL = [
  {
    q: "Khi tiếp cận xe nghi vấn, tại sao cảnh sát được yêu cầu đứng ở vị trí cột B?",
    choices: ["Nhìn biển số", "Tránh cửa xe và quan sát tốt", "Đối tượng thấy mặt", "Chuẩn bị gậy"],
    answer: 1
  },
  {
    q: "Những vật dụng nào là vật dụng nghi vấn?",
    choices: ["Sách báo", "Đồ ăn", "Vũ khí, vết máu, mặt nạ, găng tay", "Giấy tờ"],
    answer: 2
  },
  {
    q: "Trước khi xuống xe tiếp cận, hành động ưu tiên?",
    choices: ["Kiểm tra súng", "Báo radio + yêu cầu hỗ trợ", "Ra lệnh giơ tay", "Chỉnh camera"],
    answer: 1
  },
  {
    q: "Mục đích hỏi \"Anh/Chị vừa đi từ đâu tới?\"",
    choices: ["Xã giao", "Đối chiếu hướng di chuyển", "Ghi biên bản", "Kiểm tra trí nhớ"],
    answer: 1
  },
  {
    q: "Câu hỏi thăm dò lý do vội vã phù hợp?",
    choices: [
      "Chạy như ăn cướp?",
      "Biết là vi phạm không?",
      "Có chuyện gì khiến anh/chị phải di chuyển nhanh trong khu vực này?",
      "Anh mang hàng cấm?"
    ],
    answer: 2
  },
  {
    q: "Khi kiểm tra MDT, thông tin quan trọng nhất?",
    choices: ["Lịch sử phạt", "Tiền án bạo lực/vũ khí", "Ngày sinh", "Màu xe"],
    answer: 1
  },
  {
    q: "Lời thoại chuyên nghiệp khi kiểm tra xe?",
    choices: [
      "Tôi nghi anh là hung thủ",
      "Vì khu vực vừa xảy ra trọng án, tôi cần kiểm tra xe để đảm bảo an toàn",
      "Luật server cho phép",
      "Xuống xe ngay"
    ],
    answer: 1
  },
  {
    q: "Nếu xe trùng mô tả hiện trường, bước tiếp theo?",
    choices: ["Hỏi chuyện kéo dài", "Khống chế và áp giải", "Ghi biển số", "Gọi người thân"],
    answer: 1
  },
  {
    q: "Tài xế liên tục nhìn gương chiếu hậu ám chỉ?",
    choices: ["Chỉnh gương", "Lo lắng bị áp sát/tẩu thoát", "Lái cẩn thận", "Đợi người"],
    answer: 1
  },
  {
    q: "Nếu tài xế là nhân chứng hoảng loạn?",
    choices: [
      "Cho đi ngay",
      "Thu thập thông tin nhân chứng",
      "Phạt cho chừa",
      "Yêu cầu về đồn sau"
    ],
    answer: 1
  }
];


// ===== GIÁM KHẢO START =====
app.post("/api/exam/start", (req, res) => {
  examStarted = true;

  logs.push({
    type: "EXAM_START",
    time: new Date().toLocaleString("vi-VN")
  });

  res.json({ ok: true });
});

// ===== GIÁM KHẢO RESET =====
app.post("/api/exam/reset", (req, res) => {
  examStarted = false;
  
  // Xóa toàn bộ dữ liệu thí sinh
  Object.keys(activeCorrects).forEach(key => delete activeCorrects[key]);
  Object.keys(activeAnswers).forEach(key => delete activeAnswers[key]);
  Object.keys(activeScores).forEach(key => delete activeScores[key]);
  Object.keys(activeQuestions).forEach(key => delete activeQuestions[key]);
  finishedUsers.clear();
  
  // Reset logs và results
  logs.length = 0;
  results.length = 0;

  logs.push({
    type: "EXAM_RESET",
    time: new Date().toLocaleString("vi-VN")
  });

  res.json({ ok: true });
});

// ===== TRẠNG THÁI =====
app.get("/api/exam/status", (req, res) => {
  res.json({ started: examStarted });
});

// ===== THÍ SINH VÀO =====
app.post("/api/join", (req, res) => {
  const { name } = req.body;
  
  if (!name) {
    return res.status(400).json({ error: "Thiếu tên thí sinh" });
  }

  logs.push({
    type: "JOIN",
    name: name,
    time: new Date().toLocaleString("vi-VN")
  });

  res.json({ ok: true });
});

// ===== VI PHẠM =====
app.post("/api/violation", (req, res) => {
  const { name, reason } = req.body;

  if (!name || !reason) {
    return res.status(400).json({ error: "Thiếu thông tin vi phạm" });
  }

  logs.push({
    type: "VIOLATION",
    name,
    reason,
    time: new Date().toLocaleString("vi-VN")
  });

  // Đánh dấu thí sinh đã hoàn thành (bị loại)
  finishedUsers.add(name);
  
  // Xóa dữ liệu thí sinh để tránh rò rỉ bộ nhớ
  delete activeCorrects[name];
  delete activeAnswers[name];
  delete activeScores[name];
  delete activeQuestions[name];
  
  // Thêm vào kết quả
  results.push({
    name,
    score: 0,
    result: "VI PHẠM",
    time: new Date().toLocaleString("vi-VN")
  });

  res.json({ ok: true });
});

// ===== LẤY ĐỀ =====
app.get("/api/questions", (req, res) => {
  if (!examStarted)
    return res.status(403).json({ error: "NOT_STARTED", message: "Kỳ thi chưa bắt đầu" });

  const name = req.query.name;
  if (!name)
    return res.status(400).json({ error: "NO_NAME", message: "Thiếu tên thí sinh" });

  if (finishedUsers.has(name))
    return res.status(403).json({ error: "DONE", message: "Thí sinh đã hoàn thành bài thi" });

  // Random số câu hỏi nghiệp vụ (2 hoặc 3)
  const patrolCount = Math.random() < 0.5 ? 2 : 3;

  // Chọn câu hỏi
  const picked = shuffleArray([
    ...shuffleArray(QUESTION_PATROL).slice(0, patrolCount),
    ...shuffleArray(QUESTION_BANK).slice(0, 10 - patrolCount)
  ]);

  // Chuẩn bị câu hỏi (xáo trộn đáp án)
  const prepared = picked.map(q => {
    const mixed = shuffleArray(
      q.choices.map((c, i) => ({
        text: c,
        ok: i === q.answer
      }))
    );

    return {
      q: q.q,
      choices: mixed.map(x => x.text),
      correct: mixed.findIndex(x => x.ok)
    };
  });

  // Lưu trạng thái
  activeCorrects[name] = prepared.map(q => q.correct);
  
  // Lưu đề thi gốc (để gửi Discord sau)
  activeQuestions[name] = prepared.map(q => ({
    q: q.q,
    choices: q.choices,
    correct: q.correct
  }));

  logs.push({
    type: "START_EXAM",
    name,
    questionsCount: prepared.length,
    patrolCount,
    time: new Date().toLocaleString("vi-VN")
  });

  // Gửi đề thi (không kèm correct)
  res.json(
    prepared.map(q => ({
      q: q.q,
      choices: q.choices
    }))
  );
});

// ===== NỘP TRẮC NGHIỆM =====
app.post("/api/submit", (req, res) => {
  const { name, answers } = req.body;
  
  if (!name || !answers) {
    return res.status(400).json({ error: "Thiếu dữ liệu" });
  }

  const corrects = activeCorrects[name];

  if (!corrects)
    return res.status(400).json({ error: "NO_EXAM", message: "Không tìm thấy bài thi của thí sinh" });

  if (answers.length !== corrects.length) {
    return res.status(400).json({ 
      error: "INVALID_ANSWERS", 
      message: `Số câu trả lời (${answers.length}) không khớp với số câu hỏi (${corrects.length})` 
    });
  }

  // Tính điểm
  let score = 0;
  answers.forEach((a, i) => {
    if (a === corrects[i]) score++;
  });

  // Lưu trạng thái
  activeAnswers[name] = answers;
  activeScores[name] = score;

  res.json({ 
    ok: true, 
    score,
    total: corrects.length,
    correct: score,
    incorrect: corrects.length - score
  });
});

// ===== NỘP TỰ LUẬN =====
app.post("/api/submit-essay", async (req, res) => {
  const { name, essay } = req.body;
  
  if (!name) {
    return res.status(400).json({ error: "Thiếu tên thí sinh" });
  }

  // Nếu thí sinh đã hoàn thành (có thể do vi phạm hoặc nộp rồi)
  if (finishedUsers.has(name)) {
    return res.status(400).json({ 
      error: "ALREADY_FINISHED", 
      message: "Thí sinh đã hoàn thành bài thi" 
    });
  }

  const answers = activeAnswers[name] || [];
  const corrects = activeCorrects[name] || [];
  const score = activeScores[name] || 0;
  const questions = activeQuestions[name] || [];
  
  if (!corrects.length) {
    return res.status(400).json({ 
      error: "NO_EXAM", 
      message: "Không tìm thấy bài thi của thí sinh" 
    });
  }

  const pass = score >= 8 ? "ĐẬU" : "RỚT";
  const time = new Date().toLocaleString("vi-VN");

  // Gửi kết quả lên Discord
  try {
    await sendExamResult({
      name,
      score,
      total: corrects.length,
      pass,
      questions,
      answers,
      essay: essay || "Không có"
    });
  } catch (err) {
    console.error("❌ Lỗi gửi Discord:", err.message);
    // Vẫn tiếp tục xử lý, không để lỗi Discord làm gián đoạn
  }

  // Lưu kết quả
  results.push({ 
    name, 
    score, 
    total: corrects.length,
    result: pass, 
    time 
  });

  logs.push({
    type: "SUBMIT_ESSAY",
    name,
    score,
    total: corrects.length,
    pass,
    time
  });

  // Dọn dẹp
  finishedUsers.add(name);
  delete activeCorrects[name];
  delete activeAnswers[name];
  delete activeScores[name];
  delete activeQuestions[name];

  res.json({ 
    ok: true,
    score,
    total: corrects.length,
    pass
  });
});

// ===== LẤY KẾT QUẢ CÁ NHÂN =====
app.get("/api/result", (req, res) => {
  const name = req.query.name;
  
  if (!name) {
    return res.status(400).json({ error: "Thiếu tên thí sinh" });
  }

  const result = results.find(r => r.name === name);
  
  if (!result) {
    return res.status(404).json({ error: "Không tìm thấy kết quả" });
  }

  res.json(result);
});

// ===== DASHBOARD =====
app.get("/api/dashboard", (req, res) => {
  res.json({
    examStarted,
    totalCandidates: results.length,
    passedCandidates: results.filter(r => r.result === "ĐẬU").length,
    failedCandidates: results.filter(r => r.result === "RỚT").length,
    violationCandidates: results.filter(r => r.result === "VI PHẠM").length,
    results: results.sort((a, b) => new Date(b.time) - new Date(a.time)),
    logs: logs.slice(-50) // Chỉ lấy 50 log gần nhất để tránh quá tải
  });
});

// ===== XÓA LOGS =====
app.post("/api/clear-logs", (req, res) => {
  logs.length = 0;
  res.json({ ok: true });
});

/* ================= START SERVER ================= */
app.listen(PORT, () => {
  console.log("✅ Server FTO Exam đang chạy tại http://localhost:" + PORT);
  console.log("📝 Dashboard: http://localhost:" + PORT + "/api/dashboard");
});
