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

/* ================= CONSTANTS ================= */
const TOTAL_QUESTIONS = 20;
const MAX_SCORE = 10;
const PASSING_SCORE = 8;
const PASSING_CORRECT = 16;
const PATROL_MIN = 4;
const PATROL_MAX = 6;

/* ================= BỘ ĐỀ LÝ THUYẾT (185 CÂU - ĐÃ LOẠI BỎ CÂU TRÙNG) ================= */
const QUESTION_BANK = [
  /* ========== PHẦN 1: PHẠM VI THẨM QUYỀN & CHUỖI MỆNH LỆNH (15 câu) ========== */
  {
    q: "Theo quy định về phạm vi thẩm quyền, lực lượng nào có quyền hạn tuần tra trên tất cả các xa lộ, đường phố và có thể thực thi pháp luật ở bất kỳ nơi nào trong tiểu bang San Andreas?",
    choices: ["Los Santos Police Department (LSPD)", "San Andreas State Police (SASP)", "Senora Desert Sheriff's Office (SDSO)", "Paleto Bay Sheriff's Office (PBSO)"],
    answer: 1
  },
  {
    q: "LSPD có phạm vi thẩm quyền chính thức ở đâu?",
    choices: ["Chỉ Los Santos", "Toàn bộ tiểu bang San Andreas", "Los Santos và vùng ngoại ô lân cận", "Chỉ các xa lộ liên bang"],
    answer: 0
  },
  {
    q: "Một sĩ quan LSPD đang off-duty ở Paleto Bay thì chứng kiến một vụ cướp có súng. Anh ta nên làm gì ĐẦU TIÊN?",
    choices: [
      "Can thiệp ngay để ngăn chặn tội phạm, sau đó báo cho PBSO.",
      "Gọi 911 và chờ lực lượng địa phương tới, chỉ can thiệp nếu tính mạng bị đe dọa trực tiếp.",
      "Đuổi theo nghi phạm và thực hiện bắt giữ công dân.",
      "Báo cáo sự việc cho cấp trên của mình ở LSPD để xin chỉ thị."
    ],
    answer: 1
  },
  {
    q: "Trong các quy định nội bộ của LSPD, hành vi nào sau đây bị NGHIÊM CẤM?",
    choices: ["Đỗ xe riêng trong bãi đỗ của sở", "Nghỉ ngơi khi mặc đồng phục ở nơi khuất", "Sử dụng xe của tổ chức vào mục đích cá nhân", "Mang theo Bảo hiểm Y tế khi làm nhiệm vụ"],
    answer: 2
  },
  {
    q: "Hành vi nào bị nghiêm cấm trong nội bộ LSPD?",
    choices: ["Kiểm tra bodycam đầu ca", "Dùng xe công vụ chở bạn gái đi chơi", "Hỗ trợ đồng đội khi tuần tra", "Báo radio khi bắt đầu ca trực"],
    answer: 1
  },
  {
    q: "Khi một Sergeant ra lệnh cho bạn dừng truy đuổi vì nguy hiểm, nhưng Lieutenant trực ca trước đó nói phải bám sát bằng mọi giá. Bạn phải tuân theo ai?",
    choices: ["Sergeant (người trực tiếp chỉ huy hiện trường)", "Lieutenant (cấp bậc cao hơn)", "Quyết định của bản thân dựa trên tình hình", "Gọi radio xin ý kiến Chief"],
    answer: 0
  },
  {
    q: "Cấp bậc nào có thể ra lệnh cho toàn bộ ca trực thay đổi chiến thuật trong một cuộc vây bắt?",
    choices: ["Corporal", "Sergeant", "Lieutenant", "Bất kỳ Senior Officer nào"],
    answer: 1
  },
  {
    q: "Một Cadet muốn tuần tra một mình, cần điều kiện gì?",
    choices: ["Được sự cho phép của High Command", "Không cần điều kiện gì vì đã tốt nghiệp học viện", "Phải có ít nhất 1 năm kinh nghiệm", "Chỉ cần báo cáo với FTO"],
    answer: 0
  },
  {
    q: "Sĩ quan LSPD được tuần tra tự do trong phạm vi nào?",
    choices: ["Toàn bộ San Andreas", "Chỉ trong thành phố Los Santos", "Los Santos và các khu vực lân cận nếu được phân công", "Bất cứ đâu có tội phạm"],
    answer: 1
  },
  {
    q: "Khi nào một sĩ quan LSPD có thể thực thi pháp luật ở Sandy Shores?",
    choices: ["Không bao giờ", "Khi đang truy đuổi nóng và nghi phạm chạy qua đó", "Khi được SDSO mời hỗ trợ", "Cả B và C đều đúng"],
    answer: 3
  },
  {
    q: "Cấp bậc nào KHÔNG được tự ý đi tuần tra một mình?",
    choices: ["Officer / Deputy", "Cadet / Học viên", "Senior Officer", "Corporal"],
    answer: 1
  },
  {
    q: "Nếu bạn là Corporal và nhận được hai mệnh lệnh mâu thuẫn từ Sergeant và Lieutenant, bạn phải làm gì?",
    choices: ["Làm theo lệnh Sergeant vì trực tiếp hơn", "Làm theo lệnh Lieutenant vì cấp bậc cao hơn", "Báo cáo sự mâu thuẫn và yêu cầu làm rõ", "Chọn mệnh lệnh an toàn hơn"],
    answer: 2
  },
  {
    q: "Một sĩ quan LSPD có thể bị kỷ luật vì từ chối mệnh lệnh từ cấp trên không?",
    choices: ["Không, nếu mệnh lệnh đó vi phạm pháp luật", "Có, trong mọi trường hợp", "Chỉ khi mệnh lệnh đó là hợp pháp và trong thẩm quyền", "Không bao giờ"],
    answer: 2
  },
  {
    q: "Ai có thẩm quyền cao nhất trong một ca trực thông thường?",
    choices: ["Senior Officer có thâm niên nhất", "Sergeant trực ca", "Lieutenant nếu có mặt", "Chief of Police"],
    answer: 1
  },
  {
    q: "Khi một sĩ quan từ chối mệnh lệnh vì cho rằng nó nguy hiểm, điều gì sẽ xảy ra?",
    choices: ["Bị kỷ luật ngay lập tức", "Được bảo vệ nếu chứng minh được mối nguy hiểm rõ ràng", "Bị đình chỉ không lương", "Phải tuân theo rồi khiếu nại sau"],
    answer: 1
  },

  /* ========== PHẦN 2: MÃ ĐÀM & TÌNH HUỐNG RADIO (20 câu) ========== */
  {
    q: "Mã đàm (10-code) nào được sử dụng khi sĩ quan tiến hành dừng xe để xử lý các lỗi giao thông (Traffic Stop)?",
    choices: ["10-26", "10-29", "10-31", "10-96"],
    answer: 0
  },
  {
    q: "Khi đang thực hiện 10-26, bạn phát hiện xe trùng mô tả của một vụ cướp có vũ khí. Bạn phải làm gì NGAY LẬP TỨC?",
    choices: ["Kết thúc 10-26 và bắt đầu 10-29", "Yêu cầu backup và chuyển sang 10-29, giữ khoảng cách an toàn", "Tiếp cận xe như bình thường nhưng rút súng sẵn", "Gọi 10-31 (nổ súng) luôn"],
    answer: 1
  },
  {
    q: "10-00 có nghĩa là gì?",
    choices: ["Hết ca trực", "Officer Down (sĩ quan bị thương nặng/nguy kịch)", "Yêu cầu xe cứu thương", "Bắt đầu ca trực"],
    answer: 1
  },
  {
    q: "Khi nghe 10-00 trên radio, các đơn vị khác phải làm gì?",
    choices: ["Giữ im lặng radio", "Lập tức di chuyển đến vị trí báo phát", "Báo cáo tình trạng của mình", "Tất cả các đáp án trên"],
    answer: 3
  },
  {
    q: "Sự khác biệt chính giữa Code 2 (C2) và Code 3 (C3) trong hệ thống mã tình huống của LSPD là gì?",
    choices: ["Code 2 chỉ bật đèn, Code 3 bật cả đèn và còi", "Code 2 là khẩn cấp thấp, Code 3 là khẩn cấp cao với đầy đủ tín hiệu ưu tiên", "Code 2 không cần hỗ trợ, Code 3 cần hỗ trợ gấp", "Code 2 dành cho tội phạm ít nguy hiểm, Code 3 dành cho trọng tội"],
    answer: 1
  },
  {
    q: "Khi đang di chuyển Code 2 đến hiện trường, bạn có được phép vượt đèn đỏ không?",
    choices: ["Có, nhưng phải giảm tốc và đảm bảo an toàn", "Không, Code 2 không cho phép vượt đèn đỏ", "Chỉ khi có xe khác đi cùng", "Chỉ khi có lệnh của chỉ huy"],
    answer: 1
  },
  {
    q: "Mã 10-14 được dùng khi nào?",
    choices: ["Đưa nghi phạm về phòng giam", "Áp giải người bị thương đến bệnh viện", "Xe nghi vấn chở chất cấm", "Yêu cầu xe cứu thương"],
    answer: 1
  },
  {
    q: "Báo cáo Felony Stop sử dụng mã nào?",
    choices: ["10-26", "10-29", "10-31", "10-55"],
    answer: 1
  },
  {
    q: "Khi nào bạn nên sử dụng 10-31 (Shot Fired)?",
    choices: ["Chỉ khi bạn nổ súng", "Khi có bất kỳ tiếng súng nào trong khu vực", "Khi bạn thấy ai đó có súng", "Khi bạn muốn trấn áp tinh thần đối tượng"],
    answer: 1
  },
  {
    q: "POS 1 trong một cuộc truy đuổi có nhiệm vụ gì?",
    choices: ["Giữ visual và call radio chính", "Chặn đường phía trước", "Điều tiết giao thông", "Bắn lốp"],
    answer: 0
  },
  {
    q: "POS 3 trong đội hình truy đuổi có nhiệm vụ gì?",
    choices: ["Thay thế POS 1 khi mất dấu", "Bảo vệ yểm trợ từ phía sau", "Chặn các phương tiện dân sự tại ngã tư, bảo vệ hành lang truy đuổi", "Chuẩn bị PIT"],
    answer: 2
  },
  {
    q: "Khi POS 1 mất visual (mất dấu) nghi phạm, ai sẽ thay thế?",
    choices: ["POS 2", "POS 3", "Air-1 (trực thăng)", "Xe nào có visual trước sẽ tự động lên POS 1 và báo radio"],
    answer: 3
  },
  {
    q: "Trong truy đuổi, ai là người call chính?",
    choices: ["POS 1", "POS 2", "POS 3", "Air-1"],
    answer: 0
  },
  {
    q: "POS 2 trong truy đuổi có nhiệm vụ gì?",
    choices: ["Điều tiết giao thông", "Hỗ trợ POS 1, sẵn sàng thay thế nếu POS 1 gặp sự cố", "Rời hiện trường", "Chặn highway"],
    answer: 1
  },
  {
    q: "Mã 10-29 (Felony Stop) yêu cầu tối thiểu bao nhiêu sĩ quan?",
    choices: ["2", "3", "4", "5"],
    answer: 1
  },
  {
    q: "Khi gọi radio báo cáo một Traffic Stop, thông tin nào là BẮT BUỘC?",
    choices: ["Màu xe", "Biển số và vị trí", "Số người trên xe", "Tất cả các thông tin trên"],
    answer: 3
  },
  {
    q: "Khi nghe thấy 10-00, bạn đang ở xa hiện trường. Bạn nên làm gì?",
    choices: ["Tiếp tục tuần tra", "Giữ im lặng radio, sẵn sàng hỗ trợ nếu được gọi", "Lập tức chạy Code 3 đến hiện trường", "Báo cáo vị trí của mình và chờ lệnh"],
    answer: 3
  },
  {
    q: "Khi đang báo cáo radio mà có tín hiệu khẩn cấp chen ngang, bạn phải làm gì?",
    choices: ["Tiếp tục nói cho hết", "Ngừng ngay và nhường đường cho tín hiệu khẩn cấp", "Tăng âm lượng để át đi", "Chuyển sang kênh khác"],
    answer: 1
  },
  {
    q: "Mã 10-42 có nghĩa là gì?",
    choices: ["Bắt đầu ca trực", "Kết thúc ca trực", "Yêu cầu nghỉ giải lao", "Báo cáo sự cố"],
    answer: 1
  },
  {
    q: "Khi phát hiện một phương tiện bị nghi ngờ chở chất cấm, bạn nên báo cáo mã gì?",
    choices: ["10-26", "10-29", "10-96 (nếu có trong danh sách) hoặc mô tả chi tiết", "10-00"],
    answer: 2
  },

  /* ========== PHẦN 3: TRAFFIC STOP & FELONY STOP (20 câu) ========== */
  {
    q: "Khi thực hiện Traffic Stop, vị trí xe cảnh sát nên đặt ở đâu để đảm bảo an toàn cho sĩ quan?",
    choices: ["Chặn ngay phía trước xe của công dân", "Dừng song song với xe của công dân", "Dừng ở phía sau xe cần tiếp cận, hơi lệch sang trái (tạo lá chắn)", "Dừng cách xa 50 mét"],
    answer: 2
  },
  {
    q: "Trong quy trình Felony Stop, cần ít nhất bao nhiêu sĩ quan và đội hình xe nên bố trí thế nào?",
    choices: ["2 sĩ quan, xếp hàng ngang", "3 sĩ quan, đội hình chữ V lộn ngược", "5 sĩ quan, bao vây xung quanh", "4 sĩ quan, nối đuôi nhau"],
    answer: 1
  },
  {
    q: "Nếu nghi phạm trong Felony Stop không tuân theo lệnh, bạn có thể làm gì?",
    choices: ["Nổ súng ngay", "Tiếp tục ra lệnh, giữ vị trí, và báo cáo tình hình", "Xông vào bắt", "Gọi thêm 10 đơn vị"],
    answer: 1
  },
  {
    q: "Khi thực hiện Traffic Stop, bạn nên tiếp cận xe từ phía nào?",
    choices: ["Phía trước đầu xe", "Phía bên tài xế, dọc theo thân xe", "Phía sau xe", "Phía bên phụ"],
    answer: 1
  },
  {
    q: "Traffic Stop được xếp vào loại rủi ro nào?",
    choices: ["Rủi ro thấp (low risk)", "Rủi ro cao (high risk)", "Rủi ro chết người (lethal)", "Không có rủi ro"],
    answer: 0
  },
  {
    q: "Felony Stop áp dụng cho trường hợp nào?",
    choices: ["Vi phạm giao thông nhẹ", "Nghi phạm trọng tội, có vũ khí, hoặc xe bị đánh cắp", "Kiểm tra giấy tờ thông thường", "Xe cứu thương"],
    answer: 1
  },
  {
    q: "Điều quan trọng nhất trong Felony Stop là gì?",
    choices: ["Tiếp cận nhanh để khống chế", "Đội hình an toàn và giao tiếp rõ ràng", "Có súng shotgun", "Cho nghi phạm tự xuống xe"],
    answer: 1
  },
  {
    q: "Khi dừng xe vào ban đêm, bạn nên chiếu đèn như thế nào?",
    choices: ["Tắt hết đèn để không làm lóa mắt nghi phạm", "Bật đèn pha chiếu thẳng vào xe nghi phạm", "Bật đèn chiếu sáng (spotlight) vào gương chiếu hậu bên tài xế", "Dùng đèn pin từ xa"],
    answer: 1
  },
  {
    q: "Khi nào có thể phá vỡ đội hình Felony Stop?",
    choices: ["Khi đã an toàn và có lệnh của chỉ huy hiện trường", "Khi nghi phạm bắt đầu la hét", "Tự ý khi cảm thấy cần", "Khi trời mưa"],
    answer: 0
  },
  {
    q: "Trong Traffic Stop, điều nào KHÔNG nên làm?",
    choices: ["Giữ khoảng cách an toàn", "Báo radio trước khi xuống xe", "Tiếp cận vội vàng, không quan sát", "Quan sát chuyển động trong xe"],
    answer: 2
  },
  {
    q: "Khi Traffic Stop có dấu hiệu trở thành Felony Stop (ví dụ thấy vũ khí), bạn phải làm gì?",
    choices: ["Tiếp cận như bình thường nhưng rút súng", "Lùi lại, gọi backup, và nâng mức thành 10-29", "Bắn ngay vào lốp xe", "Yêu cầu tài xế bước ra"],
    answer: 1
  },
  {
    q: "Trong Felony Stop, tại sao cần cover chéo (cross-cover)?",
    choices: ["Để đẹp mắt", "Để mỗi sĩ quan có góc bắn khác nhau và yểm trợ lẫn nhau", "Để dễ giao tiếp", "Không cần thiết"],
    answer: 1
  },
  {
    q: "Khi nghi phạm trong Felony Stop đầu hàng, bạn nên làm gì?",
    choices: ["Tiếp tục chĩa súng và ra lệnh từ từ", "Hạ súng và tiến đến còng ngay", "Gọi thêm người đến còng", "Để nghi phạm tự đến chỗ bạn"],
    answer: 0
  },
  {
    q: "Đội hình chữ V lộn ngược trong Felony Stop bao gồm mấy xe?",
    choices: ["2 xe", "3 xe", "4 xe", "5 xe"],
    answer: 1
  },
  {
    q: "Xe thứ 4 trong Felony Stop nên làm gì?",
    choices: ["Tham gia vào chữ V", "Đỗ xa để làm nhiệm vụ bắn tỉa hoặc chặn đường thoát", "Rời đi", "Đỗ ngay trước mặt nghi phạm"],
    answer: 1
  },
  {
    q: "Trong Traffic Stop, nếu tài xế không có giấy tờ tùy thân, bạn có thể làm gì?",
    choices: ["Bắt giữ ngay", "Hỏi thông tin cá nhân và kiểm tra qua MDT", "Phạt nặng hơn", "Thả cho đi"],
    answer: 1
  },
  {
    q: "Khi dừng một xe tải lớn, vị trí đỗ xe tuần tra nên khác gì so với xe con?",
    choices: ["Không khác biệt", "Đỗ xa hơn và lệch nhiều hơn để tránh điểm mù của xe tải", "Đỗ sát hơn để chặn", "Đỗ trước mặt"],
    answer: 1
  },
  {
    q: "Bạn nên làm gì nếu trong Traffic Stop, tài xế đột ngột bỏ chạy?",
    choices: ["Nổ súng vào xe", "Báo radio 10-80 (truy đuổi) và bắt đầu pursuit theo quy trình", "Đuổi theo và PIT ngay", "Bỏ qua"],
    answer: 1
  },
  {
    q: "Khi thực hiện Felony Stop, lời lệnh đầu tiên dành cho nghi phạm là gì?",
    choices: ["Bước ra khỏi xe!", "Tắt máy, vứt chìa khóa ra ngoài, giơ tay lên!", "Nằm xuống!", "Đừng cử động!"],
    answer: 1
  },

  /* ========== PHẦN 4: MIRANDA & QUYỀN CỦA NGHI PHẠM (15 câu) ========== */
  {
    q: "Nếu nghi phạm không trả lời sau khi được đọc Quyền Miranda, sĩ quan phải làm gì tiếp theo?",
    choices: ["Đưa nghi phạm về sở", "Đọc lại quyền Miranda tối đa 3 lần, sau đó coi là đã hiểu", "Dùng súng điện", "Gọi luật sư đến hiện trường"],
    answer: 1
  },
  {
    q: "Khi đọc Miranda, câu nào là BẮT BUỘC?",
    choices: ["Anh có quyền giữ im lặng...", "Anh có muốn gọi điện thoại không?", "Anh có muốn ăn gì không?", "Anh có biết tôi là ai không?"],
    answer: 0
  },
  {
    q: "Nếu bạn không đọc Miranda trước khi thẩm vấn, điều gì sẽ xảy ra?",
    choices: ["Lời khai vẫn có giá trị", "Lời khai có thể bị loại bỏ khỏi hồ sơ", "Bạn bị kỷ luật", "Cả B và C"],
    answer: 3
  },
  {
    q: "Khi nghi phạm nói 'Tôi muốn có luật sư', bạn phải làm gì?",
    choices: ["Tiếp tục hỏi", "Ngừng thẩm vấn ngay lập tức", "Giải thích rằng họ không cần luật sư", "Đe dọa để họ đổi ý"],
    answer: 1
  },
  {
    q: "Miranda phải được đọc khi nào?",
    choices: ["Ngay khi thấy nghi phạm", "Trước khi thẩm vấn chính thức", "Sau khi bắt giữ", "Cả B và C"],
    answer: 3
  },
  {
    q: "Nếu nghi phạm nói 'Tôi không hiểu', bạn phải làm gì?",
    choices: ["Bỏ qua", "Đọc lại chậm hơn và giải thích từng phần", "Gọi phiên dịch", "Đọc xong rồi thôi"],
    answer: 1
  },
  {
    q: "Khi đã đọc Miranda 3 lần mà nghi phạm vẫn im lặng, bạn có thể suy luận gì?",
    choices: ["Họ từ bỏ quyền im lặng", "Họ đã hiểu và đang thực hiện quyền im lặng", "Họ ngu ngốc", "Họ không có tội"],
    answer: 1
  },
  {
    q: "Trong trường hợp nào bạn KHÔNG cần đọc Miranda?",
    choices: ["Khi hỏi tên và địa chỉ để lập biên bản", "Khi hỏi về tội ác họ vừa gây ra", "Khi thẩm vấn chính thức", "Khi muốn họ khai báo"],
    answer: 0
  },
  {
    q: "Nếu bạn quên đọc Miranda và nghi phạm đã khai báo, bạn có thể làm gì để khắc phục?",
    choices: ["Không thể khắc phục", "Đọc Miranda rồi hỏi lại từ đầu", "Xóa lời khai cũ và bắt đầu lại sau khi đọc Miranda", "Giả vờ như đã đọc"],
    answer: 2
  },
  {
    q: "Khi nghi phạm từ chối ký vào biên bản Miranda, bạn phải làm gì?",
    choices: ["Ép ký", "Ghi chú 'từ chối ký' và có nhân chứng", "Bỏ biên bản đó", "Không cần biên bản"],
    answer: 1
  },
  {
    q: "Bạn có thể sử dụng lời khai của nghi phạm khi chưa đọc Miranda không?",
    choices: ["Có, nếu họ tự nguyện nói", "Không, trong mọi trường hợp", "Có, nếu có nhân chứng", "Chỉ khi có luật sư"],
    answer: 0
  },
  {
    q: "Điều gì xảy ra nếu bạn tiếp tục thẩm vấn sau khi nghi phạm yêu cầu luật sư?",
    choices: ["Không sao", "Bị kỷ luật và lời khai bị loại bỏ", "Được khen vì kiên trì", "Chỉ bị cảnh cáo"],
    answer: 1
  },
  {
    q: "Khi một nghi phạm là người nước ngoài không rành tiếng Anh, bạn phải làm gì?",
    choices: ["Đọc Miranda bằng tiếng Anh cho đủ thủ tục", "Tìm phiên dịch hoặc sử dụng bản dịch Miranda có sẵn", "Không cần đọc", "Dùng ngôn ngữ cơ thể"],
    answer: 1
  },
  {
    q: "Quyền Miranda có áp dụng cho công dân nước ngoài không?",
    choices: ["Có", "Không", "Chỉ khi họ yêu cầu", "Chỉ khi họ là tội phạm"],
    answer: 0
  },
  {
    q: "Bạn có thể đọc Miranda cho một người đang say rượu không?",
    choices: ["Có, nhưng phải chờ họ tỉnh táo để hiểu", "Không, vì họ không đủ năng lực", "Có, đọc luôn", "Không cần đọc"],
    answer: 0
  },

  /* ========== PHẦN 5: VŨ LỰC (LETHAL & NON-LETHAL) (15 câu) ========== */
  {
    q: "Vũ lực gây chết người (Lethal Force) được xem là phương án nào?",
    choices: ["Phương án đầu tiên", "Phương án cuối cùng khi có đe dọa tính mạng trực tiếp", "Tùy chọn cá nhân", "Để chặn nghi phạm bỏ chạy"],
    answer: 1
  },
  {
    q: "Khi nào bạn được phép sử dụng súng điện (taser)?",
    choices: ["Với bất kỳ ai không nghe lời", "Khi nghi phạm chống đối nhưng chưa gây nguy hiểm chết người", "Để trừng phạt", "Khi bạn mệt mỏi"],
    answer: 1
  },
  {
    q: "Khi nào được phép nổ súng vào phương tiện đang di chuyển?",
    choices: ["Không bao giờ", "Khi chiếc xe đó đang được sử dụng như một vũ khí để đe dọa tính mạng", "Để chặn xe bỏ chạy", "Khi có lệnh của Sergeant"],
    answer: 1
  },
  {
    q: "Bạn có thể dùng dùi cui (baton) khi nào?",
    choices: ["Bất cứ lúc nào", "Khi cần tự vệ hoặc kiểm soát đối tượng chống đối ở mức độ thấp", "Để đe dọa", "Khi hết đạn"],
    answer: 1
  },
  {
    q: "Nếu một người đang bỏ chạy và bạn nghi ngờ họ vừa cướp tiệm, bạn có thể bắn vào lưng họ không?",
    choices: ["Có, để ngăn chặn", "Không, trừ khi họ gây nguy hiểm trực tiếp đến tính mạng của bạn hoặc người khác", "Có, nếu họ không dừng lại", "Chỉ khi được phép"],
    answer: 1
  },
  {
    q: "Khi đồng đội của bạn bị thương, bạn có thể dùng lethal force để bảo vệ họ không?",
    choices: ["Có, nếu mối đe dọa vẫn đang hiện hữu", "Không, chỉ tự vệ cho bản thân", "Có, bất kể tình huống", "Chỉ khi được chỉ huy cho phép"],
    answer: 0
  },
  {
    q: "Bạn có thể bắn cảnh cáo không?",
    choices: ["Có, để dọa", "Không, vì đạn có thể trúng người vô tội", "Có, ở nông thôn", "Chỉ khi có lệnh"],
    answer: 1
  },
  {
    q: "Theo nguyên tắc sử dụng vũ lực, bạn phải làm gì trước khi dùng lethal force?",
    choices: ["Bắn ngay", "Cảnh báo rõ ràng và cho đối tượng cơ hội đầu hàng, nếu có thể", "Gọi cấp trên", "Không cần cảnh báo"],
    answer: 1
  },
  {
    q: "Khi một đám đông ném đá, bạn có thể nổ súng không?",
    choices: ["Có, để giải tán", "Không, trừ khi có mối đe dọa chết người từ một cá nhân cụ thể", "Có, bắn vào chân", "Có, bắn cảnh cáo"],
    answer: 1
  },
  {
    q: "Bạn có thể dùng hơi cay khi nào?",
    choices: ["Để giải tán đám đông bạo loạn hoặc khống chế nghi phạm cố thủ", "Để trừng phạt", "Trong không gian hẹp có con tin", "Khi không có gió"],
    answer: 0
  },
  {
    q: "Nếu nghi phạm có dao và đang tiến đến bạn, bạn có thể bắn không?",
    choices: ["Có, nếu khoảng cách đủ gần để đe dọa tính mạng (thường dưới 21 feet)", "Không, vì dao không phải súng", "Có, bắn vào tay cầm dao", "Chỉ khi họ đâm trúng bạn"],
    answer: 0
  },
  {
    q: "Khi bạn thấy đồng đội dùng vũ lực quá mức, bạn phải làm gì?",
    choices: ["Bỏ qua", "Can thiệp và báo cáo", "Cổ vũ", "Quay phim lại"],
    answer: 1
  },
  {
    q: "Súng shotgun chỉ được dùng khi nào?",
    choices: ["Luôn mang theo", "Khi có tình huống cần hỏa lực mạnh hơn súng ngắn, và trong phạm vi gần", "Để bắn chim", "Khi đi săn"],
    answer: 1
  },
  {
    q: "Khi nghi phạm đầu hàng và không còn là mối đe dọa, bạn phải làm gì?",
    choices: ["Tiếp tục bắn cho đến khi họ nằm xuống", "Ngừng sử dụng lethal force, còng tay và kiểm soát", "Đá họ vài cái", "Chờ họ tự còng"],
    answer: 1
  },
  {
    q: "Bạn có thể dùng xe tuần tra như một vũ khí (đâm vào nghi phạm) không?",
    choices: ["Có, để chặn họ", "Chỉ khi đó là biện pháp cuối cùng để ngăn chặn mối đe dọa chết người", "Không bao giờ", "Khi được phép"],
    answer: 1
  },

  /* ========== PHẦN 6: TRUY ĐUỔI (PURSUIT) (20 câu) ========== */
  {
    q: "Điều kiện BẮT BUỘC để thực hiện Pit Maneuver là gì?",
    choices: ["Nghi phạm lái xe quá nhanh", "Có chứng chỉ hoặc lệnh cấp trên cho phép", "Khu vực đông dân cư", "Xe cảnh sát bị hỏng"],
    answer: 1
  },
  {
    q: "PIT chỉ được thực hiện ở tốc độ nào?",
    choices: ["Dưới 40 MPH", "Dưới 60–70 MPH (tùy quy định)", "Không giới hạn", "Trên 80 MPH"],
    answer: 1
  },
  {
    q: "Khi nào KHÔNG được phép thực hiện PIT?",
    choices: ["Trên đường cao tốc vắng", "Khu vực đông dân cư, gần trường học, hoặc khi có xe dân sự xung quanh", "Trên cầu", "Ban đêm"],
    answer: 1
  },
  {
    q: "Trong truy đuổi, ai có quyền ra lệnh chấm dứt (terminate) pursuit?",
    choices: ["POS 1", "Chỉ huy ca trực (Supervisor)", "Bất kỳ ai thấy nguy hiểm", "Air-1"],
    answer: 1
  },
  {
    q: "Khi pursuit bị chấm dứt, các xe phải làm gì?",
    choices: ["Tiếp tục đuổi theo ngầm", "Tấp vào lề, tắt còi đèn, và quay lại tuần tra", "Đứng giữa đường", "Bám theo xa xa"],
    answer: 1
  },
  {
    q: "Spike strip (bàn chông) được sử dụng khi nào?",
    choices: ["Tự ý mọi lúc", "Khi có lệnh và được đặt ở vị trí an toàn, tránh gây nguy hiểm cho dân thường", "Chỉ trên cao tốc", "Khi trời khô ráo"],
    answer: 1
  },
  {
    q: "Khi nghi phạm bỏ xe chạy bộ, POS 1 phải làm gì?",
    choices: ["Đuổi theo ngay mà không báo", "Báo hướng di chuyển, giữ tầm nhìn, và chờ hỗ trợ", "Bắn vào chân họ", "Bỏ cuộc"],
    answer: 1
  },
  {
    q: "Truy đuổi ngoài khu vực thẩm quyền cần điều kiện gì?",
    choices: ["Không cần", "Phải thông báo cho đơn vị sở tại và phối hợp", "Chỉ truy đuổi trong 5 phút", "Tự ý truy đuổi"],
    answer: 1
  },
  {
    q: "Khi nào nên sử dụng Air-1 trong truy đuổi?",
    choices: ["Luôn luôn nếu có sẵn", "Khi pursuit kéo dài hoặc mất visual từ mặt đất", "Không bao giờ", "Chỉ để quay phim"],
    answer: 1
  },
  {
    q: "Trong pursuit, tự ý vượt POS 1 sẽ gây ra điều gì?",
    choices: ["Giúp nhanh hơn", "Mất phối hợp, gây nguy hiểm và vi phạm quy trình", "Là SOP chuẩn", "Không ảnh hưởng"],
    answer: 1
  },
  {
    q: "Khi truy đuổi qua khu vực đông dân cư, ưu tiên hàng đầu là gì?",
    choices: ["Bắt cho bằng được", "An toàn của dân thường", "Tốc độ", "PIT ngay"],
    answer: 1
  },
  {
    q: "Khi mất hoàn toàn visual nghi phạm trong truy đuổi, bạn nên làm gì?",
    choices: ["Đoán hướng", "Báo mất dấu, giảm tốc, và chờ chỉ đạo", "Chạy vòng vòng tìm", "Tự ý bỏ cuộc"],
    answer: 1
  },
  {
    q: "Nếu nghi phạm lao xe vào đám đông, bạn có thể làm gì?",
    choices: ["Bắn vào lốp", "Sử dụng lethal force để ngăn chặn mối đe dọa tức thì", "Đuổi theo", "Gọi EMS"],
    answer: 1
  },
  {
    q: "Khi nào bạn có thể bắn từ xe đang di chuyển trong truy đuổi?",
    choices: ["Không bao giờ", "Khi có mối đe dọa trực tiếp và bạn có thể bắn an toàn (hiếm khi)", "Luôn được phép", "Khi có lệnh"],
    answer: 1
  },
  {
    q: "Khi một xe dân sự vô tình chen vào giữa đội hình truy đuổi, bạn phải làm gì?",
    choices: ["PIT nó ra", "Báo radio và cố gắng vượt qua một cách an toàn", "Bắn cảnh cáo", "Dừng truy đuổi"],
    answer: 1
  },
  {
    q: "Supervisor có thể takeover (tiếp quản) vị trí POS 1 không?",
    choices: ["Có, để điều phối tốt hơn", "Không bao giờ", "Chỉ khi POS 1 mệt", "Khi xe sắp hết xăng"],
    answer: 0
  },
  {
    q: "Spike strip nên được đặt ở đâu?",
    choices: ["Ngẫu nhiên", "Trên đoạn đường thẳng, khuất tầm nhìn của nghi phạm, và an toàn cho người đặt", "Trong đường hầm", "Ngay khúc cua"],
    answer: 1
  },
  {
    q: "Khi nghi phạm chạy vào khu vực có trường học đang giờ tan học, bạn nên làm gì?",
    choices: ["Tiếp tục đuổi", "Yêu cầu chấm dứt truy đuổi ngay lập tức vì nguy hiểm quá lớn", "Giảm tốc và bám theo xa", "Bóp còi inh ỏi"],
    answer: 1
  },
  {
    q: "Trong báo cáo truy đuổi, thông tin nào quan trọng nhất?",
    choices: ["Loại xe, hướng chạy, tốc độ", "Màu sắc xe", "Biển số (nếu đọc được)", "Tất cả các thông tin trên"],
    answer: 3
  },
  {
    q: "Nếu xe của bạn bị hỏng trong khi truy đuổi, bạn phải làm gì?",
    choices: ["Dừng lại và chửi thề", "Báo radio '10-7' (hết nhiệm vụ) và vị trí của bạn", "Cố gắng chạy tiếp", "Bỏ xe và đi bộ đuổi"],
    answer: 1
  },

  /* ========== PHẦN 7: KHÁM XÉT & TẠM GIỮ (15 câu) ========== */
  {
    q: "Trước khi khám xét cá nhân, sĩ quan bắt buộc phải làm gì?",
    choices: ["Còng tay ngay", "Hỏi xem họ có mang vật nguy hiểm/bất hợp pháp không", "Đọc Miranda", "Chờ lệnh chỉ huy"],
    answer: 1
  },
  {
    q: "Khi nào bạn có thể khám xét xe mà không cần sự đồng ý?",
    choices: ["Luôn luôn", "Khi có lý do hợp lý (probable cause): nhìn thấy vật nghi vấn, mùi lạ, hoặc liên quan đến bắt giữ", "Khi tài xế cáu", "Không bao giờ"],
    answer: 1
  },
  {
    q: "Bạn có thể giữ nghi phạm tối đa bao lâu để thu thập chứng cứ trước khi chính thức bắt giữ?",
    choices: ["12-24 giờ", "30-45 phút", "2-3 tiếng", "48 giờ"],
    answer: 1
  },
  {
    q: "Khi khám xét, bạn tìm thấy một vật không liên quan đến lý do ban đầu nhưng là bất hợp pháp (ví dụ: ma túy khi tìm vũ khí). Bạn có thể làm gì?",
    choices: ["Bỏ qua", "Tịch thu và bổ sung tội danh", "Trả lại", "Báo cáo sau"],
    answer: 1
  },
  {
    q: "Khi khám xét người, bạn nên làm gì nếu nghi phạm khai là có kim tiêm trong túi?",
    choices: ["Thò tay vào luôn", "Dừng lại, hỏi kỹ vị trí, và dùng biện pháp an toàn (găng tay chống đâm)", "Bỏ qua", "Gọi EMS"],
    answer: 1
  },
  {
    q: "Bạn có thể buộc nghi phạm cởi quần áo để khám xét không?",
    choices: ["Có, ở bất cứ đâu", "Không, trừ khi có lý do chính đáng và phải thực hiện ở nơi kín đáo, có sự chứng kiến của sĩ quan cùng giới (nếu có thể)", "Luôn được phép", "Không bao giờ"],
    answer: 1
  },
  {
    q: "Nếu bạn không có lý do hợp lý để khám xét nhưng nghi phạm đồng ý, bạn có thể khám không?",
    choices: ["Có, sự đồng ý là hợp lệ", "Không, vẫn cần lý do", "Chỉ khi có luật sư", "Phải ghi âm lại"],
    answer: 0
  },
  {
    q: "Khi tạm giữ một người, bạn phải thông báo cho họ điều gì?",
    choices: ["Họ bị bắt", "Lý do tạm giữ và thời gian dự kiến", "Không cần nói gì", "Chỉ cần còng tay"],
    answer: 1
  },
  {
    q: "Bạn có thể tịch thu điện thoại của nghi phạm không?",
    choices: ["Luôn luôn", "Chỉ khi có lệnh của tòa hoặc liên quan trực tiếp đến chứng cứ tội phạm", "Không bao giờ", "Khi họ đang gọi"],
    answer: 1
  },
  {
    q: "Khi nào bạn phải đọc Miranda trước khi khám xét?",
    choices: ["Luôn luôn", "Không cần, Miranda chỉ cho thẩm vấn, không cho khám xét", "Khi họ yêu cầu", "Trước khi hỏi về vật cần tìm"],
    answer: 1
  },
  {
    q: "Bạn có thể dùng chó nghiệp vụ (K9) để khám xét xe mà không cần sự đồng ý không?",
    choices: ["Có, vì chó đánh hơi không xâm phạm quyền riêng tư", "Không, cần probable cause", "Chỉ khi có lệnh", "Không được dùng chó"],
    answer: 0
  },
  {
    q: "Khi bạn thấy một túi nhỏ rơi ra từ túi nghi phạm và nghi là ma túy, bạn có thể nhặt lên kiểm tra không?",
    choices: ["Không, cần lệnh", "Có, vì nó nằm trong tầm nhìn (plain view)", "Phải hỏi trước", "Chỉ khi có nhân chứng"],
    answer: 1
  },
  {
    q: "Sau khi khám xét, bạn phải làm gì với tài sản không liên quan?",
    choices: ["Giữ luôn", "Trả lại nguyên vẹn và ghi biên nhận nếu cần", "Vứt đi", "Bán đấu giá"],
    answer: 1
  },
  {
    q: "Bạn có thể khám xét cốp xe khi kiểm tra giao thông không?",
    choices: ["Có, vì đó là một phần của xe", "Không, trừ khi có probable cause hoặc sự đồng ý", "Luôn luôn", "Chỉ khi có chó nghiệp vụ"],
    answer: 1
  },
  {
    q: "Nếu bạn tìm thấy vũ khí trong lúc khám xét người bị tạm giữ vì tội nhẹ, bạn có thể làm gì?",
    choices: ["Tịch thu và thêm tội danh tàng trữ vũ khí trái phép", "Trả lại vì không liên quan", "Bỏ qua", "Gọi chủ sở hữu"],
    answer: 0
  },

  /* ========== PHẦN 8: CON TIN, CƯỚP, ĐỘT KÍCH (10 câu) ========== */
  {
    q: "Trong tình huống con tin, ưu tiên số một là gì?",
    choices: ["Tiêu diệt nghi phạm", "An toàn của con tin", "Đàm phán kéo dài", "Bảo vệ tài sản"],
    answer: 1
  },
  {
    q: "Khi đàm phán con tin, bạn nên làm gì?",
    choices: ["Kích động nghi phạm", "Bình tĩnh, lắng nghe, và tạo dựng niềm tin", "Đe dọa", "Hứa hẹn mọi thứ"],
    answer: 1
  },
  {
    q: "Trong một vụ cướp ngân hàng đang diễn ra, bạn là đơn vị đầu tiên đến. Bạn nên làm gì?",
    choices: ["Xông vào bắt cướp", "Thiết lập vành đai, chặn giao thông, và chờ đội SWAT/đàm phán", "Bắn vào cửa", "Gọi thêm nhân viên"],
    answer: 1
  },
  {
    q: "Trong một cuộc đột kích (raid), điều quan trọng nhất là gì?",
    choices: ["Tốc độ", "Phối hợp nhóm, kiểm tra góc khuất, và liên lạc liên tục", "Im lặng tuyệt đối", "Bắn trước khi vào"],
    answer: 1
  },
  {
    q: "Khi giải cứu được con tin, điều đầu tiên cần làm là gì?",
    choices: ["Hỏi cung ngay", "Đưa họ đến nơi an toàn, kiểm tra y tế, và tách khỏi nghi phạm", "Để họ tự đi", "Chụp ảnh kỷ niệm"],
    answer: 1
  },
  {
    q: "Khi nghi phạm cố thủ trong nhà và có con tin, bạn có thể bắn tỉa họ không?",
    choices: ["Có, bất cứ lúc nào thấy đầu", "Chỉ khi có lệnh và mối đe dọa đến con tin là rõ ràng và ngay lập tức", "Không bao giờ", "Chỉ để dọa"],
    answer: 1
  },
  {
    q: "Khi có báo động cướp tại cửa hàng, bạn đến nơi và thấy cửa khóa, bên trong tối. Bạn nên làm gì?",
    choices: ["Phá cửa vào ngay", "Quan sát xung quanh, gọi backup, và chờ thêm thông tin", "Bỏ đi vì chắc không có gì", "Đứng trước cửa gọi to"],
    answer: 1
  },
  {
    q: "Trong một vụ cướp, bạn phát hiện nghi phạm đang chạy ra phía sau. Bạn nên làm gì?",
    choices: ["Đuổi theo một mình ngay", "Báo cáo hướng chạy, mô tả nghi phạm, và phối hợp với các đơn vị khác để bao vây", "Bắn vào chân họ", "Để họ chạy"],
    answer: 1
  },
  {
    q: "Khi bảo vệ hiện trường một vụ cướp, bạn nên làm gì với nhân chứng?",
    choices: ["Cho họ về nhà", "Tách riêng từng người, giữ họ lại để lấy lời khai", "Bắt họ ngồi chung một chỗ", "Không quan tâm"],
    answer: 1
  },
  {
    q: "Trong lúc đột kích, bạn nghe thấy tiếng động trong phòng tối. Bạn nên làm gì?",
    choices: ["Xông vào bắn", "Dùng đèn pin, báo cáo vị trí, và yêu cầu hỗ trợ kiểm tra", "Ném lựu đạn", "Bỏ qua"],
    answer: 1
  },

  /* ========== PHẦN 9: ĐẠO ĐỨC, KỶ LUẬT, BODYCAM, KHÁC (20 câu) ========== */
  {
    q: "Bodycam phải được bật khi nào?",
    choices: ["Cả ngày", "Trong mọi tương tác với công chúng khi làm nhiệm vụ", "Chỉ khi có đánh nhau", "Khi nào thích"],
    answer: 1
  },
  {
    q: "Thời gian tối thiểu lưu trữ cảnh quay bodycam là bao lâu?",
    choices: ["24 giờ", "48 giờ", "72 giờ", "7 ngày"],
    answer: 1
  },
  {
    q: "Bạn có thể tự ý xóa đoạn phim bodycam không?",
    choices: ["Có, khi đầy bộ nhớ", "Không, đó là hành vi vi phạm nghiêm trọng", "Có, nếu thấy không cần thiết", "Chỉ khi được phép"],
    answer: 1
  },
  {
    q: "Một sĩ quan cố tình làm hỏng bodycam sẽ bị gì?",
    choices: ["Không sao", "Bị xử lý kỷ luật nặng, có thể bị sa thải", "Chỉ bị cảnh cáo", "Được thay bodycam mới"],
    answer: 1
  },
  {
    q: "Bạn có thể dùng thông tin từ MDT cho mục đích cá nhân không?",
    choices: ["Có, để kiểm tra bạn gái", "Không, chỉ dùng cho nhiệm vụ", "Có, nếu không ai biết", "Được phép"],
    answer: 1
  },
  {
    q: "Khi mặc đồng phục, bạn được phép làm gì?",
    choices: ["Đi bar", "Nghỉ ngơi ở nơi kín đáo trong trụ sở", "Chửi bới dân thường", "Ngủ ở ghế công viên"],
    answer: 1
  },
  {
    q: "Bạn có thể sử dụng xe công vụ để đi mua đồ ăn nhanh không?",
    choices: ["Có, miễn là đang trong giờ nghỉ", "Không, xe công vụ chỉ dùng cho nhiệm vụ, trừ khi được phép đặc biệt", "Có, nếu đói", "Không bao giờ"],
    answer: 1
  },
  {
    q: "Hành vi nào sau đây là lạm dụng quyền hạn?",
    choices: ["Hỗ trợ đồng đội", "Phạt hoặc bắt giữ không có căn cứ", "Báo radio đầy đủ", "Check bodycam"],
    answer: 1
  },
  {
    q: "Nếu bạn thấy đồng đội nhận hối lộ, bạn phải làm gì?",
    choices: ["Bỏ qua vì tình bạn", "Báo cáo ngay cho Internal Affairs hoặc cấp trên", "Xin một phần", "Đe dọa họ"],
    answer: 1
  },
  {
    q: "Khi có dân thường khiếu nại về thái độ của bạn, bạn nên làm gì?",
    choices: ["Cãi lại", "Xin lỗi nếu mình sai, giải thích nhẹ nhàng, và nếu căng thẳng thì gọi supervisor", "Đuổi họ đi", "Phạt thêm"],
    answer: 1
  },
  {
    q: "Bạn có thể đăng ảnh chụp lúc làm nhiệm vụ lên mạng xã hội không?",
    choices: ["Có, để khoe chiến công", "Không, vi phạm bảo mật và hình ảnh đơn vị", "Chỉ khi không có mặt người dân", "Được phép nếu không có logo LSPD"],
    answer: 1
  },
  {
    q: "Khi hết ca trực, bạn phải làm gì với xe tuần tra?",
    choices: ["Lái về nhà", "Đỗ đúng nơi quy định tại trụ sở, kiểm tra và bàn giao", "Để ngoài đường", "Cho bạn mượn"],
    answer: 1
  },
  {
    q: "Điều gì tạo nên tính chuyên nghiệp của một sĩ quan LSPD?",
    choices: ["Bắn giỏi", "Kỷ luật, nghiệp vụ, tinh thần đồng đội, và thái độ tôn trọng", "Nhiều bắt giữ nhất", "Lái xe nhanh"],
    answer: 1
  },
  {
    q: "Bạn có thể dùng còi xe tuần tra để dọa dân thường không?",
    choices: ["Có, cho vui", "Không, còi chỉ dùng cho tình huống khẩn cấp", "Có, để họ tránh đường", "Khi nào thích"],
    answer: 1
  },
  {
    q: "Khi bạn vô tình gây tai nạn với xe tuần tra, bạn phải làm gì?",
    choices: ["Bỏ chạy", "Dừng lại, bảo vệ hiện trường, báo cáo, và gọi supervisor", "Đổ lỗi cho dân", "Giấu xe"],
    answer: 1
  },
  {
    q: "Bạn có thể uống rượu khi đang mặc đồng phục nhưng đã hết ca không?",
    choices: ["Có, ở quán bar", "Không, đồng phục đại diện cho sở bất kể giờ giấc", "Chỉ khi không ai thấy", "Được phép nếu không say"],
    answer: 1
  },
  {
    q: "Nếu bạn thấy một túi tiền rơi trên đường khi đang tuần tra, bạn nên làm gì?",
    choices: ["Nhặt bỏ túi", "Báo cáo, tìm chủ sở hữu, hoặc nộp cho đơn vị thất lạc", "Chia cho đồng đội", "Bỏ qua"],
    answer: 1
  },
  {
    q: "Khi một người dân hỏi bạn về luật, bạn không biết câu trả lời. Bạn nên làm gì?",
    choices: ["Bịa ra", "Thừa nhận không biết và hướng dẫn họ đến nguồn thông tin chính xác", "Mắng họ", "Bỏ đi"],
    answer: 1
  },
  {
    q: "Bạn có thể nhận quà của dân thường sau khi giúp họ không?",
    choices: ["Có, nếu là bánh", "Không, đó có thể coi là hối lộ hoặc ảnh hưởng đến sự công bằng", "Chỉ khi giá trị nhỏ", "Luôn được nhận"],
    answer: 1
  },
  {
    q: "Khi phát hiện đồng đội làm báo cáo giả, bạn nên làm gì?",
    choices: ["Sửa giúp", "Báo cáo sự việc", "Bỏ qua", "Cùng tham gia"],
    answer: 1
  },

  /* ========== PHẦN 10: BỔ SUNG CÂU HỎI KHÁC (20 câu) ========== */
  {
    q: "Khi một sĩ quan bị thương trong lúc làm nhiệm vụ, đồng đội phải làm gì ngay lập tức?",
    choices: ["Tiếp tục truy đuổi", "Gọi 10-00, cố gắng sơ cứu và bảo vệ đồng đội", "Bỏ mặc", "Chạy đi tìm EMS"],
    answer: 1
  },
  {
    q: "Bạn có thể sử dụng vũ lực với một người đang quay phim bạn không?",
    choices: ["Có, vì họ cản trở", "Không, trừ khi họ can thiệp vật lý hoặc đe dọa", "Luôn được phép", "Tịch thu máy quay"],
    answer: 1
  },
  {
    q: "Khi bạn thấy một đồng đội đang ngủ gật trong xe tuần tra, bạn nên làm gì?",
    choices: ["Báo cáo ngay", "Đánh thức họ và nhắc nhở, nếu tái diễn thì báo cáo", "Mặc kệ", "Chụp ảnh đăng lên mạng"],
    answer: 1
  },
  {
    q: "Trong lúc tuần tra, bạn gặp một vụ tai nạn giao thông nhỏ không có thương tích. Bạn nên làm gì?",
    choices: ["Bỏ qua vì không có thương tích", "Dừng lại, đảm bảo an toàn hiện trường, hướng dẫn các bên trao đổi thông tin, hoặc lập biên bản nếu cần", "Phạt cả hai", "Gọi xe cứu thương"],
    answer: 1
  },
  {
    q: "Khi nhận được lệnh truy nã (APB) về một chiếc xe, bạn phải làm gì nếu thấy nó?",
    choices: ["Dừng xe ngay lập tức một mình", "Báo radio, bám theo kín đáo, và chờ hỗ trợ trước khi dừng xe", "Bắn vào lốp", "Bỏ qua"],
    answer: 1
  },
  {
    q: "Bạn có thể yêu cầu kiểm tra nồng độ cồn với bất kỳ tài xế nào không?",
    choices: ["Có, với mọi người", "Chỉ khi có dấu hiệu say xỉn hoặc vi phạm giao thông liên quan", "Không bao giờ", "Chỉ khi có lệnh"],
    answer: 1
  },
  {
    q: "Khi một sĩ quan cấp trên yêu cầu bạn làm điều gì đó vi phạm SOP, bạn nên làm gì?",
    choices: ["Tuân theo vì sợ", "Nhẹ nhàng nhắc lại SOP, nếu vẫn ép thì báo cáo lên cấp cao hơn", "Làm theo rồi báo cáo sau", "Bỏ qua"],
    answer: 1
  },
  {
    q: "Trong lúc mưa bão, tầm nhìn kém, bạn có nên tiếp tục truy đuổi tốc độ cao không?",
    choices: ["Có, nhiệm vụ là trên hết", "Không, cần đánh giá lại rủi ro và có thể hủy truy đuổi", "Giảm tốc nhưng vẫn đuổi", "Gọi Air-1"],
    answer: 1
  },
  {
    q: "Bạn có thể sử dụng bình xịt hơi cay để giải tán một nhóm biểu tình ôn hòa không?",
    choices: ["Có, nếu họ không giải tán", "Không, trừ khi họ trở nên bạo lực hoặc có lệnh", "Luôn được phép", "Xịt để vui"],
    answer: 1
  },
  {
    q: "Khi phát hiện một gói hàng khả nghi (có thể là bom), bạn nên làm gì?",
    choices: ["Lại gần kiểm tra", "Sơ tán khu vực, thiết lập vành đai, gọi đội chuyên trách (EOD)", "Mở ra xem", "Bỏ qua"],
    answer: 1
  },
  {
    q: "Bạn có thể đeo kính râm khi nói chuyện với người dân không?",
    choices: ["Luôn được", "Có thể, nhưng nên bỏ ra để giao tiếp bằng mắt, trừ khi lý do y tế hoặc ánh sáng", "Không bao giờ", "Chỉ khi nắng"],
    answer: 1
  },
  {
    q: "Khi bị khiếu nại, bạn có quyền xem đoạn phim bodycam của mình không?",
    choices: ["Không", "Có, trong quá trình điều tra nội bộ để bảo vệ bản thân", "Chỉ khi có luật sư", "Không bao giờ"],
    answer: 1
  },
  {
    q: "Nếu bạn quên bật bodycam trong một sự kiện quan trọng, bạn nên làm gì?",
    choices: ["Giả vờ quên", "Báo cáo ngay sự việc với supervisor và ghi chú vào báo cáo", "Không sao cả", "Bịa ra lý do"],
    answer: 1
  },
  {
    q: "Bạn có thể bắt giữ một người vì tội 'chống đối' nếu họ chỉ đứng im và không làm gì không?",
    choices: ["Có, vì không tuân lệnh", "Không, chống đối đòi hỏi hành động vật lý hoặc lời nói đe dọa rõ ràng", "Có, nếu bạn thấy khó chịu", "Luôn bắt được"],
    answer: 1
  },
  {
    q: "Khi tuần tra, bạn thấy một đứa trẻ đi lạc. Bạn nên làm gì?",
    choices: ["Bỏ qua", "Tiếp cận nhẹ nhàng, trấn an, và tìm cách liên lạc với phụ huynh hoặc đưa về trụ sở", "Để nó tự tìm đường", "Gọi xe cứu thương"],
    answer: 1
  },
  {
    q: "Bạn có được phép hút thuốc khi đang mặc đồng phục không?",
    choices: ["Có, ở mọi nơi", "Không, hoặc chỉ ở khu vực chỉ định khuất tầm nhìn công chúng", "Có, khi rảnh", "Không bao giờ"],
    answer: 1
  },
  {
    q: "Khi bạn thấy một người vô gia cư ngủ trên vỉa hè, bạn nên làm gì?",
    choices: ["Đuổi họ đi", "Kiểm tra an toàn của họ, hỏi han và chỉ dẫn đến nơi trú ẩn nếu có thể", "Phạt họ", "Bắt họ"],
    answer: 1
  },
  {
    q: "Khi nhận được cuộc gọi về bạo lực gia đình, bạn đến nơi và thấy hai bên đang cãi vã. Bạn nên làm gì?",
    choices: ["Bắt một người ngay", "Tách hai bên ra, lắng nghe từng người, và đánh giá tình hình", "Bỏ đi vì chuyện gia đình", "Gọi thêm 5 xe"],
    answer: 1
  },
  {
    q: "Bạn có thể dùng vũ lực để bắt một người đang cố gắng tự tử không?",
    choices: ["Có, để cứu mạng họ, miễn là vũ lực hợp lý", "Không, vì họ không phải tội phạm", "Chỉ khi có lệnh", "Không bao giờ"],
    answer: 0
  },
  {
    q: "Khi bạn thấy một xe cảnh sát khác bị nổ lốp, bạn nên làm gì?",
    choices: ["Tiếp tục đi", "Dừng lại hỗ trợ, bảo vệ hiện trường, và gọi xe kéo nếu cần", "Cười vào mặt họ", "Báo cáo là họ bất tài"],
    answer: 1
  }
];

/* ================= BỘ ĐỀ NGHIỆP VỤ (15 CÂU - RIÊNG BIỆT) ================= */
const QUESTION_PATROL = [
  {
    q: "Khi tiếp cận xe nghi vấn, tại sao cảnh sát được yêu cầu đứng ở vị trí cột B?",
    choices: ["Nhìn biển số", "Tránh cửa xe và quan sát tốt bên trong", "Đối tượng thấy mặt", "Chuẩn bị gậy"],
    answer: 1
  },
  {
    q: "Những vật dụng nào là vật dụng nghi vấn cần chú ý khi tuần tra?",
    choices: ["Sách báo", "Đồ ăn", "Vũ khí, vết máu, mặt nạ, găng tay, túi nhỏ", "Giấy tờ"],
    answer: 2
  },
  {
    q: "Trước khi xuống xe tiếp cận, hành động ưu tiên?",
    choices: ["Kiểm tra súng", "Báo radio vị trí, biển số, và yêu cầu hỗ trợ nếu cần", "Ra lệnh giơ tay", "Chỉnh camera"],
    answer: 1
  },
  {
    q: "Mục đích hỏi \"Anh/Chị vừa đi từ đâu tới?\"",
    choices: ["Xã giao", "Đối chiếu hướng di chuyển, phát hiện mâu thuẫn", "Ghi biên bản", "Kiểm tra trí nhớ"],
    answer: 1
  },
  {
    q: "Câu hỏi thăm dò lý do vội vã nào sau đây là chuyên nghiệp nhất?",
    choices: ["Chạy như ăn cướp?", "Biết là vi phạm không?", "Có chuyện gì khiến anh/chị phải di chuyển nhanh trong khu vực này?", "Anh mang hàng cấm?"],
    answer: 2
  },
  {
    q: "Khi kiểm tra MDT, thông tin quan trọng nhất về một đối tượng là gì?",
    choices: ["Lịch sử phạt nguội", "Tiền án bạo lực/vũ khí", "Ngày sinh", "Màu tóc"],
    answer: 1
  },
  {
    q: "Lời thoại chuyên nghiệp khi bạn muốn kiểm tra xe?",
    choices: ["Tôi nghi anh là hung thủ", "Vì khu vực vừa xảy ra trọng án, tôi cần kiểm tra xe để đảm bảo an toàn. Anh có phiền không?", "Luật server cho phép", "Xuống xe ngay"],
    answer: 1
  },
  {
    q: "Nếu xe trùng mô tả hiện trường, bước tiếp theo là gì?",
    choices: ["Hỏi chuyện kéo dài", "Gọi backup và thực hiện Felony Stop nếu cần", "Ghi biển số rồi bỏ đi", "Gọi người thân"],
    answer: 1
  },
  {
    q: "Tài xế liên tục nhìn gương chiếu hậu khi bạn bám theo, điều đó ám chỉ gì?",
    choices: ["Chỉnh gương", "Lo lắng, có thể chuẩn bị bỏ chạy hoặc giấu đồ", "Lái cẩn thận", "Đợi người"],
    answer: 1
  },
  {
    q: "Nếu tài xế là nhân chứng đang hoảng loạn sau một vụ nổ súng, bạn nên làm gì?",
    choices: ["Cho đi ngay", "Thu thập thông tin nhân chứng một cách nhẹ nhàng, trấn an họ", "Phạt cho chừa", "Yêu cầu về đồn sau"],
    answer: 1
  },
  {
    q: "Khi tuần tra một mình vào ban đêm ở khu vực vắng, bạn nên làm gì nếu thấy một xe đỗ bên đường không bật đèn?",
    choices: ["Bỏ qua", "Tiếp cận một mình để kiểm tra", "Báo radio, quan sát từ xa, và gọi hỗ trợ trước khi tiếp cận", "Bắn cảnh cáo"],
    answer: 2
  },
  {
    q: "Bạn đang tuần tra và thấy một nhóm người tụ tập ở góc phố lúc 2 giờ sáng. Hành động phù hợp là gì?",
    choices: ["Đuổi họ đi ngay", "Quan sát từ xa, báo cáo, và chỉ can thiệp nếu có dấu hiệu phạm pháp", "Gọi thêm 5 xe", "Bắt tất cả về đồn"],
    answer: 1
  },
  {
    q: "Khi tuần tra, bạn ngửi thấy mùi cần sa nồng nặc từ một chiếc xe đang chạy. Bạn có thể làm gì?",
    choices: ["Dừng xe và khám xét ngay", "Dừng xe vì mùi cần sa là probable cause cho việc khám xét", "Bỏ qua vì không thấy", "Gọi K9"],
    answer: 1
  },
  {
    q: "Một người dân đến gặp bạn và báo có kẻ khả nghi đang lảng vảng quanh nhà họ. Bạn nên làm gì?",
    choices: ["Bảo họ về nhà", "Ghi nhận thông tin, đến khu vực đó kiểm tra, và báo cáo", "Đuổi họ đi", "Gọi SWAT"],
    answer: 1
  },
  {
    q: "Khi dừng một xe vì lỗi đèn hậu hỏng, bạn nên tiếp cận như thế nào nếu trời mưa?",
    choices: ["Chạy thật nhanh", "Tiếp cận bình thường nhưng chú ý đường trơn và tầm nhìn kém", "Không dừng xe khi trời mưa", "Yêu cầu tài xế ra ngoài"],
    answer: 1
  }
];


// ===== GIÁM KHẢO START =====
app.post("/api/exam/start", (req, res) => {
  examStarted = true;
  logs.push({ type: "EXAM_START", time: new Date().toLocaleString("vi-VN") });
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
  logs.push({ type: "EXAM_RESET", time: new Date().toLocaleString("vi-VN") });
  res.json({ ok: true });
});

// ===== TRẠNG THÁI =====
app.get("/api/exam/status", (req, res) => {
  res.json({ started: examStarted });
});

// ===== THÍ SINH VÀO =====
app.post("/api/join", (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: "Thiếu tên thí sinh" });
  logs.push({ type: "JOIN", name, time: new Date().toLocaleString("vi-VN") });
  res.json({ ok: true });
});

// ===== VI PHẠM =====
app.post("/api/violation", (req, res) => {
  const { name, reason } = req.body;
  if (!name || !reason) return res.status(400).json({ error: "Thiếu thông tin vi phạm" });
  logs.push({ type: "VIOLATION", name, reason, time: new Date().toLocaleString("vi-VN") });
  finishedUsers.add(name);
  delete activeCorrects[name];
  delete activeAnswers[name];
  delete activeScores[name];
  delete activeQuestions[name];
  results.push({ name, score: 0, result: "VI PHẠM", time: new Date().toLocaleString("vi-VN") });
  res.json({ ok: true });
});

// ===== LẤY ĐỀ (20 CÂU) =====
app.get("/api/questions", (req, res) => {
  if (!examStarted)
    return res.status(403).json({ error: "NOT_STARTED", message: "Kỳ thi chưa bắt đầu" });

  const name = req.query.name;
  if (!name) return res.status(400).json({ error: "NO_NAME", message: "Thiếu tên thí sinh" });
  if (finishedUsers.has(name))
    return res.status(403).json({ error: "DONE", message: "Thí sinh đã hoàn thành bài thi" });

  const patrolCount = Math.floor(Math.random() * (PATROL_MAX - PATROL_MIN + 1)) + PATROL_MIN;
  const theoryCount = TOTAL_QUESTIONS - patrolCount;

  const selectedPatrol = shuffleArray([...QUESTION_PATROL]).slice(0, patrolCount);
  const selectedTheory = shuffleArray([...QUESTION_BANK]).slice(0, theoryCount);
  const picked = shuffleArray([...selectedPatrol, ...selectedTheory]);

  const prepared = picked.map(q => {
    const mixed = shuffleArray(
      q.choices.map((c, i) => ({ text: c, ok: i === q.answer }))
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
    theoryCount,
    time: new Date().toLocaleString("vi-VN")
  });

  res.json(prepared.map(q => ({ q: q.q, choices: q.choices })));
});

// ===== NỘP TRẮC NGHIỆM (20 CÂU) =====
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

  // Tính số câu đúng (RAW)
  let correctCount = 0;
  answers.forEach((a, i) => {
    if (a === corrects[i]) correctCount++;
  });

  // Quy đổi ra thang điểm 10
  // Công thức: (số câu đúng / tổng số câu) * 10
  const scoreOn10 = Math.round((correctCount / TOTAL_QUESTIONS) * MAX_SCORE * 10) / 10;

  // Lưu trạng thái (lưu cả raw và scaled)
  activeAnswers[name] = answers;
  activeScores[name] = {
    raw: correctCount,
    scaled: scoreOn10
  };

  res.json({ 
    ok: true, 
    correctCount,
    totalQuestions: TOTAL_QUESTIONS,
    score: scoreOn10,
    maxScore: MAX_SCORE
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
  const scoreData = activeScores[name] || { raw: 0, scaled: 0 };
  const questions = activeQuestions[name] || [];

  if (!corrects.length) {
    return res.status(400).json({ 
      error: "NO_EXAM", 
      message: "Không tìm thấy bài thi của thí sinh" 
    });
  }

  // Điểm đậu: scaled >= 8 (tương đương 16/20 câu đúng)
  const pass = scoreData.scaled >= PASSING_SCORE ? "ĐẬU" : "RỚT";
  const time = new Date().toLocaleString("vi-VN");

  // Gửi kết quả lên Discord
  try {
    await sendExamResult({
      name,
      score: scoreData.scaled,
      correctCount: scoreData.raw,
      total: TOTAL_QUESTIONS,
      maxScore: MAX_SCORE,
      pass,
      questions,
      answers,
      essay: essay || "Không có"
    });
  } catch (err) {
    console.error("❌ Lỗi gửi Discord:", err.message);
  }

  // Lưu kết quả
  results.push({ 
    name, 
    score: scoreData.scaled,
    correctCount: scoreData.raw,
    total: TOTAL_QUESTIONS,
    result: pass, 
    time 
  });

  logs.push({
    type: "SUBMIT_ESSAY",
    name,
    score: scoreData.scaled,
    correctCount: scoreData.raw,
    total: TOTAL_QUESTIONS,
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
    correctCount: scoreData.raw,
    totalQuestions: TOTAL_QUESTIONS,
    score: scoreData.scaled,
    maxScore: MAX_SCORE,
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
  console.log("📋 Số câu mỗi đề thi: " + TOTAL_QUESTIONS);
  console.log("🎯 Điểm đậu: " + PASSING_SCORE + "/" + MAX_SCORE + " (tương đương " + PASSING_CORRECT + "/" + TOTAL_QUESTIONS + " câu đúng)");
});
