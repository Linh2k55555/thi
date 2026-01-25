const { useState, useEffect, useRef } = React;

/* ===== VẼ TEXT TỰ XUỐNG DÒNG ===== */
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
    // LOGIN | WAIT | EXAM | ESSAY | SUBMITTED | VIOLATION

    const [questions, setQuestions] = useState([]);
    const [index, setIndex] = useState(0);
    const [answers, setAnswers] = useState([]);
    const [selected, setSelected] = useState(null);
    const [time, setTime] = useState(60);

    const [essay, setEssay] = useState("");
    const [essayTime, setEssayTime] = useState(600);

    const [violationReason, setViolationReason] = useState("");

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

    /* ================= JOIN ================= */
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

    /* ================= NỘP TRẮC NGHIỆM ================= */
    async function submitMC(a) {
        await fetch("/api/submit", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name, answers: a })
        });

        setStage("ESSAY");
        setEssayTime(600);
    }

    async function submitEssay() {
        await fetch("/api/submit-essay", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name, essay })
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

    /* ================= CLICK ================= */
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

    /* ================= VẼ CANVAS ================= */
    useEffect(() => {
        if (stage !== "EXAM") return;
        if (!questions[index]) return;

        const canvas = canvasRef.current;
        if (!canvas) return;
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
            <div style={{ padding: 40 }}>
                <h2>📝 CÂU HỎI TỰ LUẬN (⏱ {essayTime}s)</h2>
                <p style={{ maxWidth: 900 }}>
                    Bạn đang trong ca trực tuần tra bắn tốc độ tại tuyến đường chính.
                    Khi đang xử lý vi phạm thì có lệnh khẩn cấp yêu cầu hỗ trợ.
                    Bạn sẽ xử lý tình huống này như thế nào?
                </p>
                <textarea
                    value={essay}
                    onChange={e => setEssay(e.target.value)}
                    style={{
                        width: "100%",
                        maxWidth: 900,
                        height: 220,
                        fontSize: 16
                    }}
                />
                <br /><br />
                <button onClick={submitEssay}>NỘP BÀI</button>
            </div>
        );

    if (stage === "SUBMITTED")
        return <h2 style={{ padding: 40 }}>✅ Bài thi đã nộp – vui lòng chờ kết quả</h2>;

    if (stage === "VIOLATION")
        return <h2 style={{ padding: 40, color: "red" }}>❌ Bài thi bị khóa<br />{violationReason}</h2>;

    return <canvas ref={canvasRef} width={900} height={540} onClick={click} />;
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
