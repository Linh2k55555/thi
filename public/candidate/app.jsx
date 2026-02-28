
const { useState, useEffect, useRef } = React;

function drawWrap(ctx, text, x, y, maxW, lh) {
    const words = text.split(" ");
    let line = "";
    let yy = y;

    for (let i = 0; i < words.length; i++) {
        const test = line + words[i] + " ";
        if (ctx.measureText(test).width > maxW && i > 0) {
            ctx.fillText(line, x, yy);
            line = words[i] + " ";
            yy += lh;
        } else {
            line = test;
        }
    }
    ctx.fillText(line, x, yy);
    return yy;
}

function App() {

const canvasRef = useRef(null);
const answerBoxes = useRef([]);

const [name, setName] = useState("");
const [stage, setStage] = useState("LOGIN");

const [questions, setQuestions] = useState([]);
const [index, setIndex] = useState(0);
const [answers, setAnswers] = useState([]);
const [selected, setSelected] = useState(null);
const [time, setTime] = useState(60);

const [essay, setEssay] = useState("");
const [essayTime, setEssayTime] = useState(600);
const [essayQuestion, setEssayQuestion] = useState("");

const [violationReason, setViolationReason] = useState("");

/* ===== DANH SÁCH CÂU TỰ LUẬN ===== */
const essayQuestions = [
`Bạn đang trong ca trực tuần tra bắn tốc độ tại tuyến đường chính.
Khi đang xử lý vi phạm thì có lệnh khẩn cấp yêu cầu hỗ trợ.
Bạn sẽ xử lý tình huống này như thế nào?`,

`Anh đang tuần tra một mình trên một đoạn đường vắng. Anh phát hiện một chiếc xe chạy quá tốc độ và yêu cầu dừng xe. Khi bước xuống, anh thấy tài xế là một người dân nghèo, họ đang chở người thân đi cấp cứu nhưng xe lại không có giấy tờ và còn vi phạm luật giao thông nghiêm trọng. Đúng lúc đó, radio báo có một vụ cướp ngân hàng lớn cần tất cả đơn vị hỗ trợ gấp.

Trong tình huống này, anh sẽ xử lý như thế nào với người tài xế kia và anh có đi hỗ trợ vụ cướp không?`,

`Sau khi anh đưa người dân đến bệnh viện an toàn và di chuyển đến hiện trường vụ cướp ngân hàng. Khi vừa đến nơi, anh thấy các đồng nghiệp đang đấu súng căng thẳng. Một tên cướp bất ngờ vứt súng, giơ tay đầu hàng và quỳ xuống ngay trước mặt anh, trong khi các đồng nghiệp khác vẫn đang bị những tên cướp còn lại bắn xối xả từ phía trong.

Anh sẽ làm gì với tên cướp đã đầu hàng này? Anh có nổ súng vào những tên còn lại ngay lập tức không?`
];

/* ================= GIAN LẬN ================= */
function violation(reason) {
    if (stage !== "EXAM" && stage !== "ESSAY") return;

    fetch("/api/violation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, reason })
    });

    if (document.fullscreenElement) {
        document.exitFullscreen();
    }

    setViolationReason(reason);
    setStage("VIOLATION");
}

/* ================= ANTI CHEAT ================= */
useEffect(() => {
    if (stage !== "EXAM" && stage !== "ESSAY") return;

    const onBlur = () => violation("Thoát khỏi cửa sổ trình duyệt");
    const onVis = () => document.hidden && violation("Chuyển tab");
    const onFs = () => !document.fullscreenElement && violation("Thoát fullscreen");

    window.addEventListener("blur", onBlur);
    document.addEventListener("visibilitychange", onVis);
    document.addEventListener("fullscreenchange", onFs);

    return () => {
        window.removeEventListener("blur", onBlur);
        document.removeEventListener("visibilitychange", onVis);
        document.removeEventListener("fullscreenchange", onFs);
    };
}, [stage]);

/* ================= TIMER TRẮC NGHIỆM ================= */
useEffect(() => {
    if (stage !== "EXAM") return;
    if (time <= 0) {
        next();
        return;
    }
    const t = setTimeout(() => setTime(time - 1), 1000);
    return () => clearTimeout(t);
}, [time, stage]);

/* ================= TIMER TỰ LUẬN ================= */
useEffect(() => {
    if (stage !== "ESSAY") return;
    if (essayTime <= 0) {
        submitEssay();
        return;
    }
    const t = setTimeout(() => setEssayTime(essayTime - 1), 1000);
    return () => clearTimeout(t);
}, [essayTime, stage]);

async function join() {
    if (!name) return alert("Nhập họ tên");

    await fetch("/api/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name })
    });

    setStage("WAIT");

    const wait = setInterval(async () => {
        const s = await fetch("/api/exam/status").then(r => r.json());
        if (s.started) {
            clearInterval(wait);
            startExam();
        }
    }, 2000);
}

async function startExam() {
    const res = await fetch("/api/questions?name=" + encodeURIComponent(name));
    const data = await res.json();

    if (!Array.isArray(data) || data.length === 0) {
        setStage("SUBMITTED");
        return;
    }

    setQuestions(data);
    setStage("EXAM");
    document.documentElement.requestFullscreen();
}

async function submitMC(a) {
    await fetch("/api/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, answers: a })
    });

    const q = essayQuestions[Math.floor(Math.random() * essayQuestions.length)];
    setEssayQuestion(q);

    setStage("ESSAY");
    setEssayTime(600);
}

async function submitEssay() {
    await fetch("/api/submit-essay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, essay, question: essayQuestion })
    });

    if (document.fullscreenElement) {
        document.exitFullscreen();
    }

    setStage("SUBMITTED");
}

function next() {
    const a = [...answers];
    a[index] = selected;
    setAnswers(a);
    setSelected(null);
    setIndex(index + 1);
    setTime(60);

    if (index + 1 >= questions.length) {
        submitMC(a);
    }
}

function click(e) {
    if (stage !== "EXAM") return;

    const x = e.nativeEvent.offsetX;
    const y = e.nativeEvent.offsetY;

    for (const b of answerBoxes.current) {
        if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) {
            setSelected(b.index);
            return;
        }
    }

    if (x >= 650 && x <= 850 && y >= 470 && y <= 520 && selected !== null) {
        next();
    }
}

useEffect(() => {
    if (stage !== "EXAM") return;
    if (!questions[index]) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");

    answerBoxes.current = [];
    ctx.clearRect(0, 0, 900, 540);

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, 900, 540);

    ctx.fillStyle = "#000";
    ctx.font = "20px Arial";

    ctx.fillText(`Câu ${index + 1}/${questions.length} – ${time}s`, 30, 40);

    let yEnd = drawWrap(ctx, questions[index].q, 30, 90, 840, 28);
    let y = yEnd + 30;

    questions[index].choices.forEach((c, i) => {
        const h = 50;
        ctx.strokeRect(30, y, 840, h);
        if (selected === i) {
            ctx.fillStyle = "#2563eb22";
            ctx.fillRect(30, y, 840, h);
        }
        ctx.fillStyle = "#000";
        drawWrap(ctx, String.fromCharCode(65 + i) + ". " + c, 40, y + 30, 800, 22);

        answerBoxes.current.push({ x: 30, y, w: 840, h, index: i });
        y += 70;
    });

    ctx.fillStyle = selected !== null ? "#2563eb" : "#aaa";
    ctx.fillRect(650, 470, 200, 50);
    ctx.fillStyle = "#fff";
    ctx.fillText("CÂU TIẾP THEO", 690, 502);
}, [stage, index, selected, time]);

/* ================= UI ================= */
if (stage === "LOGIN")
    return (
        <div style={{ padding: 40 }}>
            <h1>THI ONLINE</h1>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Nhập họ tên" />
            <br /><br />
            <button onClick={join}>XÁC NHẬN</button>
        </div>
    );

if (stage === "WAIT")
    return <h2 style={{ padding: 40 }}>⏳ Đang chờ FTO mở đề...</h2>;

if (stage === "ESSAY")
    return (
        <div className="essay-wrap">

            <div className="essay-card">

                <div className="essay-title">
                    📝 CÂU HỎI TỰ LUẬN (⏱ {essayTime}s)
                </div>

                <div className="essay-question">
                    {essayQuestion}
                </div>

                <textarea
                    className="essay-textarea"
                    value={essay}
                    onChange={e => setEssay(e.target.value)}
                />

                <button
                    className="essay-btn"
                    onClick={submitEssay}
                >
                    NỘP BÀI
                </button>

            </div>

        </div>
    );

if (stage === "SUBMITTED")
    return <h2 style={{ padding: 40 }}>✅ Bài thi đã nộp – vui lòng chờ kết quả</h2>;

if (stage === "VIOLATION")
    return <h2 style={{ padding: 40, color: "red" }}>❌ Bài thi bị khóa<br />{violationReason}</h2>;

return <canvas ref={canvasRef} width={900} height={540} onClick={click} />;

}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);


