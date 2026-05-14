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

/* ================= TRẠNG THÁI ================= */
let examStarted = false;

const activeCorrects = {};
const activeAnswers = {};
const activeScores = {};
const activeQuestions = {};
const finishedUsers = new Set();

const logs = [];
const results = [];

/* ================= BỘ ĐỀ LÝ THUYẾT (100 CÂU - ĐÃ GỘP & LỌC TRÙNG) ================= */
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
    q: "LSPD có phạm vi thẩm quyền ở đâu?",
    choices: [
      "Chỉ Los Santos",
      "Chỉ Sandy Shores",
      "Toàn bộ tiểu bang San Andreas",
      "Chỉ Highway"
    ],
    answer: 2
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
    q: "Hành vi nào bị nghiêm cấm trong nội bộ LSPD?",
    choices: [
      "Kiểm tra bodycam",
      "Dùng xe công vụ cho việc cá nhân",
      "Hỗ trợ đồng đội",
      "Báo radio"
    ],
    answer: 1
  },
  {
    q: "Mã đàm (10-code) nào được sử dụng khi sĩ quan tiến hành dừng xe để xử lý các lỗi giao thông (Traffic Stop)?",
    choices: ["10-26", "10-29", "10-31", "10-96"],
    answer: 0
  },
  {
    q: "10-26 được dùng khi nào?",
    choices: [
      "Officer Down",
      "Felony Stop",
      "Traffic Stop",
      "Shotfire"
    ],
    answer: 2
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
    q: "Code 3 là gì?",
    choices: [
      "Chỉ bật đèn",
      "Đèn + còi thường",
      "Đèn + còi kép",
      "Không bật gì"
    ],
    answer: 2
  },
  {
    q: "Code 2 là gì?",
    choices: [
      "Đèn + còi kép",
      "Đèn + còi",
      "Tắt tín hiệu",
      "Chỉ còi"
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
    q: "Khi Traffic Stop nên đỗ xe ở đâu?",
    choices: [
      "Song song xe đối tượng",
      "Phía trước xe đối tượng",
      "Sau xe đối tượng tạo lá chắn",
      "Đỗ xa 100m"
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
    q: "Felony Stop cần tối thiểu bao nhiêu sĩ quan?",
    choices: ["2", "3", "5", "6"],
    answer: 1
  },
  {
    q: "Đội hình Felony Stop chuẩn là gì?",
    choices: [
      "Hàng ngang",
      "Chữ V lộn ngược",
      "Bao vây tròn",
      "Song song"
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
    q: "Nghi phạm im lặng sau Miranda thì sao?",
    choices: [
      "Bỏ qua",
      "Dùng taser",
      "Đọc lại tối đa 3 lần",
      "Thả nghi phạm"
    ],
    answer: 2
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
    q: "PIT cần điều kiện gì?",
    choices: [
      "Được cấp trên cho phép hoặc có chứng chỉ",
      "Chỉ cần đối tượng chạy nhanh",
      "Có 2 xe PD",
      "PIT mọi lúc"
    ],
    answer: 0
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
    q: "Lethal Force là gì?",
    choices: [
      "Vũ lực nhẹ",
      "Không gây chết người",
      "Vũ lực gây chết người",
      "Chỉ baton"
    ],
    answer: 2
  },
  {
    q: "Lethal Force là lựa chọn như thế nào?",
    choices: [
      "Đầu tiên",
      "Cuối cùng",
      "Không cần thiết",
      "Tùy tâm trạng"
    ],
    answer: 1
  },
  {
    q: "Để nhận chứng chỉ Field Training Instructor, sĩ quan phải đạt cấp bậc tối thiểu nào?",
    choices: ["Officer", "Corporal", "Sergeant", "Lieutenant"],
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
    q: "FTO cần rank tối thiểu nào?",
    choices: ["Cadet", "Corporal", "Lieutenant", "Chief"],
    answer: 1
  },
  {
    q: "Theo quy định Bodycam, thời gian tối thiểu lưu trữ cảnh quay là bao lâu?",
    choices: ["24 giờ", "48 giờ", "72 giờ", "7 ngày"],
    answer: 1
  },
  {
    q: "Bodycam tối thiểu lưu bao lâu?",
    choices: ["24h", "48h", "12h", "7 ngày"],
    answer: 1
  },
  {
    q: "Muốn đề xuất thăng chức, sĩ quan phải hoàn thành tối thiểu bao nhiêu ngày ở cấp bậc hiện tại?",
    choices: ["3 ngày", "7 ngày", "14 ngày", "Không cần điều kiện"],
    answer: 1
  },
  {
    q: "Thăng chức cần tối thiểu bao lâu tại rank hiện tại?",
    choices: ["1 ngày", "3 ngày", "7 ngày", "14 ngày"],
    answer: 2
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
    q: "Khi mặc đồng phục được nghỉ ngơi khi nào?",
    choices: [
      "Ở mọi nơi",
      "Ở bên trong xe",
      "Ở bên trong trụ sở",
      "Không bao giờ"
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
    q: "10-00 nghĩa là gì?",
    choices: ["Hết ca", "Officer Down", "EMS tới", "Pursuit"],
    answer: 1
  },
  {
    q: "10-00 yêu cầu gì?",
    choices: [
      "Tất cả hỗ trợ khẩn cấp",
      "Nghỉ ca",
      "Fuel low",
      "Đi tuần"
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
    q: "10-14 dùng khi nào?",
    choices: [
      "Đưa người tới bệnh viện",
      "Officer Down",
      "Truy đuổi",
      "Bắt đầu ca trực"
    ],
    answer: 0
  },
  {
    q: "Báo cáo Felony Stop sử dụng mã nào?",
    choices: ["10-26", "10-29", "10-31", "10-55"],
    answer: 1
  },
  {
    q: "10-29 là gì?",
    choices: [
      "Traffic Stop",
      "Felony Stop",
      "Fight",
      "EMS Needed"
    ],
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
    q: "POS 3 trong pursuit làm gì?",
    choices: [
      "Giữ visual",
      "Dẫn đầu",
      "Block đường/hỗ trợ giao thông",
      "Đi trước nghi phạm"
    ],
    answer: 2
  },
  {
    q: "POS 1 trong pursuit làm gì?",
    choices: [
      "Block đường",
      "Giữ visual và call radio",
      "Đi cuối đoàn",
      "Điều tiết giao thông"
    ],
    answer: 1
  },
  {
    q: "Ai là người call chính trong pursuit?",
    choices: ["POS 1", "POS 2", "POS 3", "Air-1"],
    answer: 0
  },
  {
    q: "POS 2 trong pursuit có nhiệm vụ gì?",
    choices: [
      "Điều tiết giao thông",
      "Hỗ trợ quan sát/thay POS 1",
      "Rời hiện trường",
      "Chặn highway"
    ],
    answer: 1
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
    q: "PIT chỉ được thực hiện ở tốc độ nào?",
    choices: [
      "Dưới 60–70 MPH",
      "Dưới 120 MPH",
      "Không giới hạn",
      "Dưới 20 MPH"
    ],
    answer: 0
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
    q: "Khi nào không được nổ súng trong pursuit?",
    choices: ["Khu đông dân cư", "Highway", "Sa mạc", "Ngoại ô"],
    answer: 0
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
    q: "Khi nào được dùng rifle/class 2?",
    choices: [
      "Mọi lúc tuần tra",
      "Khi thích",
      "Theo lệnh hoặc tình huống đặc biệt",
      "Khi thiếu pistol"
    ],
    answer: 2
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
    q: "Nếu nghi phạm đe dọa dân thường?",
    choices: [
      "Có thể dùng lethal force",
      "Chỉ baton",
      "Không làm gì",
      "Chờ EMS"
    ],
    answer: 0
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
    q: "Trước khi search người cần làm gì?",
    choices: [
      "Đấm trước",
      "Hỏi có đồ nguy hiểm/bất hợp pháp không",
      "Đưa về trụ sở",
      "Báo HC"
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
  },
  {
    q: "Ai không được tự tuần tra một mình?",
    choices: ["Sergeant", "Cadet", "Corporal", "Senior Officer"],
    answer: 1
  },
  {
    q: "Cadet muốn tuần tra riêng cần gì?",
    choices: [
      "Không cần gì",
      "HC cho phép",
      "Xe riêng",
      "Shotgun"
    ],
    answer: 1
  },
  {
    q: "Traffic Stop thuộc loại nào?",
    choices: [
      "Low risk stop",
      "Felony stop",
      "Raid",
      "Air support"
    ],
    answer: 0
  },
  {
    q: "Bodycam dùng để làm gì?",
    choices: [
      "Nghe nhạc",
      "Ghi lại quá trình làm việc",
      "Chụp ảnh xe",
      "GPS"
    ],
    answer: 1
  },
  {
    q: "Khi nào được search xe?",
    choices: [
      "Thích là search",
      "Có căn cứ hợp lệ",
      "Xe đậu ở bãi đậu xe",
      "Xe chạy nhanh"
    ],
    answer: 1
  },
  {
    q: "Khi đối tượng đầu hàng nên làm gì?",
    choices: [
      "Tiếp tục nổ súng",
      "Còng đúng quy trình",
      "Bỏ đi",
      "PIT"
    ],
    answer: 1
  },
  {
    q: "Khi nghi phạm đầu hàng, PD cần làm gì?",
    choices: [
      "Ngừng lethal force nếu không còn đe dọa",
      "Tiếp tục bắn áp lực",
      "Dùng baton liên tục",
      "Cho nghi phạm chạy"
    ],
    answer: 0
  },
  {
    q: "Felony Stop áp dụng cho?",
    choices: [
      "Vi phạm nhẹ",
      "Nghi phạm nguy hiểm/trọng tội",
      "Taxi",
      "Xe dân thường"
    ],
    answer: 1
  },
  {
    q: "Miranda dùng để làm gì?",
    choices: [
      "Đọc quyền nghi phạm",
      "Gọi EMS",
      "Search xe",
      "MDT"
    ],
    answer: 0
  },
  {
    q: "Bắt đầu ca trực cần làm gì?",
    choices: [
      "Đi tuần ngay",
      "Kiểm tra trang bị và bodycam",
      "Đổi xe",
      "Tắt radio"
    ],
    answer: 1
  },
  {
    q: "Trong Traffic Stop, điều nào KHÔNG nên làm?",
    choices: [
      "Giữ khoảng cách",
      "Báo radio",
      "Tiếp cận nóng vội",
      "Quan sát đối tượng"
    ],
    answer: 2
  },
  {
    q: "Khi nào nâng lên Code 3?",
    choices: [
      "Muốn tới nhanh",
      "Tình huống khẩn cấp",
      "Đường vắng",
      "Tuần tra đêm"
    ],
    answer: 1
  },
  {
    q: "Radio nội bộ dùng để làm gì?",
    choices: [
      "Nói chuyện cá nhân",
      "Thông tin nhiệm vụ",
      "Nghe nhạc",
      "Không cần báo vị trí"
    ],
    answer: 1
  },
  {
    q: "Lái xe công vụ ẩu gây tai nạn là gì?",
    choices: [
      "Bình thường",
      "Vi phạm quy trình",
      "Không cần báo cáo",
      "Không liên quan nội quy"
    ],
    answer: 1
  },
  {
    q: "Điều quan trọng nhất trong Felony Stop là gì?",
    choices: [
      "Tiếp cận nhanh",
      "Đội hình và an toàn",
      "Có shotgun",
      "Cho nghi phạm tự xuống"
    ],
    answer: 1
  },
  {
    q: "Tự ý PIT khi chưa được phép sẽ bị xem là gì?",
    choices: [
      "Hành động đúng",
      "Vi phạm quy trình",
      "Không ảnh hưởng",
      "Warning nhẹ"
    ],
    answer: 1
  },
  {
    q: "Trong pursuit khu đông dân cư ưu tiên gì?",
    choices: [
      "PIT ngay",
      "An toàn dân thường",
      "Đuổi bằng mọi giá",
      "Bắn lốp"
    ],
    answer: 1
  },
  {
    q: "Bodycam lỗi giữa ca nên làm gì?",
    choices: [
      "Tắt luôn",
      "Báo supervisor/cấp trên",
      "Không cần báo",
      "Off duty"
    ],
    answer: 1
  },
  {
    q: "Spam radio gây ảnh hưởng gì?",
    choices: [
      "Không ảnh hưởng",
      "Cản trở thông tin khẩn cấp",
      "Radio rõ hơn",
      "Quy trình bắt buộc"
    ],
    answer: 1
  },
  {
    q: "Ví dụ của lạm dụng quyền hạn là gì?",
    choices: [
      "Hỗ trợ đồng đội",
      "Phạt dân không lý do",
      "Báo radio đầy đủ",
      "Check bodycam"
    ],
    answer: 1
  },
  {
    q: "Điều nào là lạm quyền?",
    choices: [
      "Arrest đúng luật",
      "Phạt hoặc bắt giữ không có căn cứ",
      "Hỗ trợ đồng đội",
      "Call radio"
    ],
    answer: 1
  },
  {
    q: "Yếu tố tạo nên sĩ quan LSPD chuyên nghiệp nhất?",
    choices: [
      "Bắn súng giỏi",
      "Kỷ luật, nghiệp vụ, teamwork",
      "Nhiều bắt giữ nhất",
      "Lái xe nhanh nhất"
    ],
    answer: 1
  },
  {
    q: "Điều gì tạo nên hiệu quả cao nhất trong hoạt động LSPD?",
    choices: [
      "Nhiều bắt giữ nhất",
      "Phối hợp, kỷ luật, đúng SOP và ưu tiên an toàn công cộng",
      "Chạy xe nhanh",
      "Dùng nhiều vũ lực"
    ],
    answer: 1
  },
  {
    q: "Khi thực hiện đột kích (raid), điều quan trọng nhất là gì?",
    choices: [
      "Lao vào trước",
      "Phối hợp đội hình và kiểm tra từng khu vực an toàn",
      "Nổ súng ngay khi thấy người",
      "Tách đội hình"
    ],
    answer: 1
  },
  {
    q: "Khi nghi phạm bỏ xe chạy bộ, POS 1 cần làm gì?",
    choices: [
      "Tự đuổi mà không báo radio",
      "Báo hướng di chuyển và giữ tầm nhìn nghi phạm",
      "Quay về trụ sở",
      "Chờ EMS"
    ],
    answer: 1
  },
  {
    q: "Điều nào bị cấm khi sử dụng MDT?",
    choices: [
      "Kiểm tra hồ sơ nghi phạm",
      "Xem lệnh truy nã hợp lệ",
      "Dùng thông tin cho mục đích cá nhân",
      "Báo cáo arrest"
    ],
    answer: 2
  },
  {
    q: "Khi nào được phép sử dụng taser?",
    choices: [
      "Khi nghi phạm chống đối nhưng chưa đe dọa tính mạng",
      "Với mọi dân thường",
      "Khi buồn chán lúc tuần tra",
      "Để ép cung"
    ],
    answer: 0
  },
  {
    q: "Nếu radio đang có tín hiệu khẩn cấp, sĩ quan nên làm gì?",
    choices: [
      "Tiếp tục nói chuyện riêng",
      "Giữ radio thông thoáng trừ khi có thông tin quan trọng",
      "Spam radio liên tục",
      "Tắt radio"
    ],
    answer: 1
  },
  {
    q: "Khi áp giải nghi phạm, điều nào là đúng?",
    choices: [
      "Để nghi phạm tự đi",
      "Luôn giữ kiểm soát và quan sát xung quanh",
      "Tháo còng cho dễ di chuyển",
      "Không cần cover"
    ],
    answer: 1
  },
  {
    q: "Điều nào đúng về SOP?",
    choices: [
      "Có thể bỏ qua nếu đông người",
      "Là quy trình nghiệp vụ bắt buộc tuân thủ",
      "Chỉ áp dụng cho Cadet",
      "Không liên quan pursuit"
    ],
    answer: 1
  },
  {
    q: "Khi traffic stop vào ban đêm, sĩ quan nên làm gì?",
    choices: [
      "Tắt hết đèn xe",
      "Quan sát kỹ bên trong xe trước khi tiếp cận",
      "Đứng sát cửa xe ngay lập tức",
      "Đi một mình không báo radio"
    ],
    answer: 1
  },
  {
    q: "Khi nghi phạm có con tin, PD cần ưu tiên điều gì?",
    choices: [
      "Bắn hạ nghi phạm ngay",
      "Đảm bảo an toàn cho con tin",
      "PIT xe ngay lập tức",
      "Rush toàn bộ lực lượng"
    ],
    answer: 1
  },
  {
    q: "Nếu sĩ quan làm mất bằng chứng vụ án sẽ bị xem là gì?",
    choices: [
      "Bình thường",
      "Vi phạm nghiệp vụ",
      "Không cần báo cáo",
      "Không ảnh hưởng"
    ],
    answer: 1
  },
  {
    q: "Trong pursuit, Air-1 hỗ trợ bằng cách nào?",
    choices: [
      "Điều tra nội bộ",
      "Theo dõi hướng di chuyển từ trên không",
      "PIT nghi phạm",
      "Chặn đường"
    ],
    answer: 1
  },
  {
    q: "Khi nào được phép phá đội hình Felony Stop?",
    choices: [
      "Khi chưa an toàn",
      "Khi supervisor hoặc tình huống yêu cầu",
      "Khi nghi phạm la hét",
      "Tự ý tùy thích"
    ],
    answer: 1
  },
  {
    q: "Một sĩ quan không báo 10-42 khi hết ca sẽ bị xem là gì?",
    choices: [
      "Đúng quy trình",
      "Thiếu quy trình radio",
      "Không cần thiết",
      "Bình thường"
    ],
    answer: 1
  },
  {
    q: "Điều nào đúng về shotgun?",
    choices: [
      "Dùng mọi nơi mọi lúc",
      "Chỉ dùng trong tình huống phù hợp",
      "Dùng để đe dọa dân thường",
      "Luôn mạnh hơn rifle"
    ],
    answer: 1
  },
  {
    q: "Khi pursuit qua khu vực đông xe, sĩ quan nên làm gì?",
    choices: [
      "Tăng tốc tối đa",
      "Kiểm soát tốc độ và ưu tiên an toàn",
      "PIT liên tục",
      "Đi ngược chiều mọi lúc"
    ],
    answer: 1
  },
  {
    q: "Khi đồng đội đang call radio, sĩ quan khác nên làm gì?",
    choices: [
      "Ngắt lời liên tục",
      "Chờ call kết thúc nếu không khẩn cấp",
      "Spam thêm thông tin",
      "Tắt radio"
    ],
    answer: 1
  },
  {
    q: "Điều nào là hành vi thiếu chuyên nghiệp?",
    choices: [
      "Hỗ trợ backup",
      "Xúc phạm người dân khi làm nhiệm vụ",
      "Báo radio đúng chuẩn",
      "Kiểm tra bodycam"
    ],
    answer: 1
  },
  {
    q: "Khi nghi phạm hợp tác hoàn toàn, sĩ quan nên làm gì?",
    choices: [
      "Tiếp tục dùng vũ lực",
      "Giảm mức độ vũ lực phù hợp",
      "Dùng taser thêm",
      "Đánh cảnh cáo"
    ],
    answer: 1
  },
  {
    q: "Supervisor có thể takeover pursuit khi nào?",
    choices: [
      "Khi cần điều phối tốt hơn",
      "Không bao giờ",
      "Chỉ Cadet được làm",
      "Khi xe sắp hết xăng"
    ],
    answer: 0
  },
  {
    q: "Trong raid building, điều quan trọng nhất là gì?",
    choices: [
      "Chạy tách đội",
      "Kiểm tra góc khuất và giữ liên lạc",
      "Nổ súng mọi phòng",
      "Không cần callout"
    ],
    answer: 1
  },
  {
    q: "Một sĩ quan cố tình làm hỏng bodycam sẽ bị gì?",
    choices: [
      "Không sao",
      "Xử lý nghiêm nội bộ",
      "Chỉ warning nhẹ",
      "Được bỏ qua"
    ],
    answer: 1
  },
  {
    q: "Khi nào được dùng spike strip?",
    choices: [
      "Khi được phép hoặc đúng tình huống",
      "Mọi tuyến đường",
      "Trong garage PD",
      "Khi xe đứng yên"
    ],
    answer: 0
  },
  {
    q: "Trong pursuit, tự ý vượt POS 1 sẽ gây ra điều gì?",
    choices: [
      "Giúp pursuit nhanh hơn",
      "Mất phối hợp đội hình",
      "Là SOP chuẩn",
      "Không ảnh hưởng"
    ],
    answer: 1
  },
  {
    q: "Điều nào đúng về bảo quản bằng chứng?",
    choices: [
      "Có thể bỏ qua",
      "Cần giữ đúng quy trình nghiệp vụ",
      "Chỉ detective cần làm",
      "Không quan trọng"
    ],
    answer: 1
  },
  {
    q: "Khi nghi phạm có súng nhưng chưa chĩa vào ai, sĩ quan nên làm gì?",
    choices: [
      "Bắn ngay lập tức",
      "Giữ cover và cảnh báo rõ ràng",
      "Lao vào tay đôi",
      "Bỏ vị trí"
    ],
    answer: 1
  },
  {
    q: "Một sĩ quan nghỉ ngơi giữa ca mà không báo sẽ bị xem là gì?",
    choices: [
      "Bình thường",
      "Vi phạm tác phong trực",
      "Được chấp nhận",
      "Không cần xử lý"
    ],
    answer: 1
  },
  {
    q: "Khi call pursuit, thông tin nào quan trọng nhất?",
    choices: [
      "Loại xe, hướng chạy và tốc độ",
      "Nhạc trong xe",
      "Skin nhân vật",
      "Xe PD phía sau"
    ],
    answer: 0
  },
  {
    q: "Khi traffic stop có dấu hiệu felony, sĩ quan nên làm gì?",
    choices: [
      "Tiếp cận như bình thường",
      "Gọi backup và nâng mức xử lý phù hợp",
      "Bỏ qua",
      "Cho xe đi luôn"
    ],
    answer: 1
  },
  {
    q: "Trong tình huống active shooter, điều ưu tiên là gì?",
    choices: [
      "Đợi toàn bộ backup",
      "Ngăn chặn mối đe dọa nhanh nhất có thể",
      "Search xe trước",
      "Nói chuyện dài trên radio"
    ],
    answer: 1
  },
  {
    q: "Một sĩ quan cố tình làm báo cáo giả sẽ bị xem là gì?",
    choices: [
      "Được bỏ qua",
      "Vi phạm nghiêm trọng nghiệp vụ",
      "Không ảnh hưởng",
      "Chỉ warning"
    ],
    answer: 1
  },
  {
    q: "Khi giải cứu được con tin, PD cần làm gì?",
    choices: [
      "Để con tin tự đi",
      "Đưa tới nơi an toàn và hỗ trợ y tế nếu cần",
      "Pursuit ngay lập tức",
      "Hỏi cung ngay"
    ],
    answer: 1
  },
  {
    q: "Nếu mất hoàn toàn visual nghi phạm trong pursuit thì sao?",
    choices: [
      "Đoán hướng tiếp tục",
      "Báo mất visual và chờ chỉ đạo",
      "Tự ngắt radio",
      "Tách toàn bộ đội hình"
    ],
    answer: 1
  },
  {
    q: "Khi nghi phạm dùng xe lao vào dân hoặc sĩ quan thì được xem là gì?",
    choices: [
      "Đe dọa chết người",
      "Không nguy hiểm",
      "Traffic stop thường",
      "Không cần phản ứng"
    ],
    answer: 0
  },
  {
    q: "Điều nào đúng về teamwork trong PD?",
    choices: [
      "Mạnh ai nấy làm",
      "Phối hợp và hỗ trợ lẫn nhau",
      "Không cần radio",
      "Chỉ supervisor cần teamwork"
    ],
    answer: 1
  },
  {
    q: "Một sĩ quan tự ý bỏ vị trí bảo vệ sẽ gây ra điều gì?",
    choices: [
      "Đúng SOP",
      "Gây nguy hiểm cho đồng đội",
      "Không ảnh hưởng",
      "Bình thường"
    ],
    answer: 1
  },
  {
    q: "Khi nghi phạm bị thương sau đấu súng, PD cần làm gì?",
    choices: [
      "Bỏ mặc",
      "Secure hiện trường và gọi EMS",
      "Loot đồ trước",
      "Tiếp tục đánh nghi phạm"
    ],
    answer: 1
  },
  {
    q: "Trong checkpoint operation, điều quan trọng nhất là gì?",
    choices: [
      "Gây áp lực dân thường",
      "Kiểm soát an toàn và đúng quy trình",
      "Chặn toàn bộ map",
      "Spam radio"
    ],
    answer: 1
  },
  {
    q: "Một sĩ quan không tuân lệnh supervisor trong tình huống khẩn cấp sẽ bị xem là gì?",
    choices: [
      "Không sao",
      "Vi phạm chain of command",
      "Được khuyến khích",
      "Không liên quan SOP"
    ],
    answer: 1
  },
  {
    q: "Khi xử lý bằng chứng, điều nào bị cấm?",
    choices: [
      "Ghi nhận bằng chứng",
      "Tự ý tiêu hủy bằng chứng",
      "Nộp kho evidence",
      "Chụp ảnh hiện trường"
    ],
    answer: 1
  },
  {
    q: "Khi nghi phạm cố thủ trong building, PD nên làm gì?",
    choices: [
      "Rush từng người",
      "Thiết lập perimeter và phối hợp chiến thuật",
      "Tự ý lao vào",
      "Bỏ hiện trường"
    ],
    answer: 1
  },
  {
    q: "Điều nào đúng về tác phong chuyên nghiệp?",
    choices: [
      "Toxic người dân",
      "Giữ thái độ chuẩn mực khi làm nhiệm vụ",
      "Dùng quyền lực đe dọa",
      "Ignore SOP"
    ],
    answer: 1
  },
  {
    q: "Khi pursuit quá dài và nguy hiểm, supervisor cần làm gì?",
    choices: [
      "Đánh giá mức độ rủi ro và lợi ích",
      "Ép tất cả tăng tốc",
      "Ignore radio",
      "Cho toàn bộ PIT"
    ],
    answer: 0
  },
  {
    q: "Khi đàm phán con tin, điều quan trọng nhất là gì?",
    choices: [
      "Kích động nghi phạm",
      "Bình tĩnh và giao tiếp rõ ràng",
      "Spam yêu cầu",
      "Đe dọa liên tục"
    ],
    answer: 1
  },
  {
    q: "Một sĩ quan dùng vũ lực vì tức giận cá nhân là gì?",
    choices: [
      "Hợp lệ",
      "Lạm quyền và vi phạm SOP",
      "Bình thường",
      "Không cần xử lý"
    ],
    answer: 1
  },
  {
    q: "Trong Felony Stop, tại sao cần cover chéo?",
    choices: [
      "Để đẹp đội hình",
      "Tăng khả năng bảo vệ và phản ứng",
      "Để dễ spam radio",
      "Không có tác dụng"
    ],
    answer: 1
  },
  {
    q: "Khi nghi phạm hợp tác hoàn toàn, mức độ đe dọa sẽ như thế nào?",
    choices: [
      "Giảm xuống",
      "Tăng tối đa",
      "Không đổi",
      "Bắt buộc lethal force"
    ],
    answer: 0
  },
  {
    q: "Một sĩ quan tự ý chia sẻ bodycam ra ngoài nội bộ sẽ bị gì?",
    choices: [
      "Không sao",
      "Vi phạm bảo mật nghiệp vụ",
      "Được khuyến khích",
      "Chỉ warning nhẹ"
    ],
    answer: 1
  },
  {
    q: "Ai có quyền cho phép PIT?",
    choices: [
      "Senior Officer",
      "Cấp cao/người có chứng chỉ",
      "Cadet",
      "Officer"
    ],
    answer: 1
  },
  {
    q: "Điều nào đúng về điều phối pursuit?",
    choices: [
      "POS 1 tự quyết mọi thứ",
      "Supervisor có thể điều phối và đánh giá tình huống",
      "Không cần ai điều phối",
      "Chỉ Air-1 được điều phối"
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
  
  Object.keys(activeCorrects).forEach(key => delete activeCorrects[key]);
  Object.keys(activeAnswers).forEach(key => delete activeAnswers[key]);
  Object.keys(activeScores).forEach(key => delete activeScores[key]);
  Object.keys(activeQuestions).forEach(key => delete activeQuestions[key]);
  finishedUsers.clear();
  
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

  finishedUsers.add(name);
  
  delete activeCorrects[name];
  delete activeAnswers[name];
  delete activeScores[name];
  delete activeQuestions[name];
  
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

  const patrolCount = Math.random() < 0.5 ? 2 : 3;

  const picked = shuffleArray([
    ...shuffleArray(QUESTION_PATROL).slice(0, patrolCount),
    ...shuffleArray(QUESTION_BANK).slice(0, 10 - patrolCount)
  ]);

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

  activeCorrects[name] = prepared.map(q => q.correct);
  
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

  let score = 0;
  answers.forEach((a, i) => {
    if (a === corrects[i]) score++;
  });

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
  }

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
    logs: logs.slice(-50)
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
  console.log("📚 Tổng số câu hỏi lý thuyết: " + QUESTION_BANK.length);
  console.log("🚔 Tổng số câu hỏi nghiệp vụ: " + QUESTION_PATROL.length);
});
