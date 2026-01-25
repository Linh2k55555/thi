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

    // ESSAY
    const [essay, setEssay] = useState("");
    const [essayTime, setEssayTime] = useState(600); // 10 phút

    const [violationReason, setViolationReason] = useState("");

    /* ================= GIAN LẬN ================= */
    function violation(reason) {
        if (stage !== "EXAM") return;

        fetch("/api/violation", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name, reason })
        });

        localStorage.setItem("done_" + name, "1");

        if (document.fullscreenElement) {
            document.exitFullscreen();
        }

        setViolationReason(reason);
        setStage("VIOLATION");
    }

    /* ================= ANTI CHEAT (CHỈ TRẮC NGHIỆM) ================= */
    useEffect(() => {
        if (stage !== "EXAM") return;

        const onBlur = () => violation("Mất focus trình duyệt");
        const onVis = () => document.hidden && violation("Chuyển tab");
        const onFs  = () => !document.fullscreenElement && violation("Thoát fullscreen");

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
        if (!name.trim()) {
            alert("Vui lòng nhập họ tên");
            return;
        }

        if (localStorage.getItem("done_" + name)) {
            if (!window.confirm("Tên này đã thi trước đó. Thi lại?")) {
                setStage("SUBMITTED");
                return;
            }
            localStorage.removeItem("done_" + name);
        }

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

        if (!Array.isArray(data)) {
            alert("Kỳ thi chưa bắt đầu hoặc bạn đã thi rồi");
            setStage("WAIT");
            return;
        }

        setQuestions(data);
        setIndex(0);
        setAnswers([]);
        setSelected(null);
        setTime(60);
        setStage("EXAM");

        document.documentElement.requestFullscreen();
    }

    /* ================= CHUYỂN CÂU ================= */
    async function next() {
        const a = [...answers];
        a[index] = selected;

        setAnswers(a);
        setSelected(null);

        if (index + 1 >= questions.length) {
            // NỘP TRẮC NGHIỆM – CHƯA KẾT THÚC
            await fetch("/api/submit", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name, answers: a })
            });

            setStage("ESSAY");
            setEssayTime(600);
            return;
        }

        setIndex(index + 1);
        setTime(60);
    }

    /* ================= SUBMIT ESSAY ================= */
    async function submitEssay() {
        await fetch("/api/submit-essay", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name, essay })
        });

        localStorage.setItem("done_" + name, "1");

        if (document.fullscreenElement) {
            document.exitFullscreen();
        }

        setStage("SUBMITTED");
    }

    /* ================= CLICK CANVAS ================= */
    function click(e) {
        if (stage !== "EXAM") return;

        const x = e.nativeEvent.offsetX;
        const y = e.nativeEvent.offsetY;

        for (let b of answerBoxes.current) {
            if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) {
                setSelected(b.index);
                return;
            }
        }

        if (x >= 650 && x <= 850 && y >= 470 && y <= 520 && selected !== null) {
            next();
        }
    }

    /* ================= RENDER CANVAS ================= */
    useEffect(() => {
        if (stage !== "EXAM") return;
        if (!questions[index]) return;

        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext("2d");
        answerBoxes.current = [];

        ctx.clearRect(0, 0, 900, 540);
        ctx.fillStyle = "#f8fafc";
        ctx.fillRect(0, 0, 900, 540);

        ctx.fillStyle = "#0f172a";
        ctx.fillRect(0, 0, 900, 60);
        ctx.fillStyle = "#fff";
        ctx.font = "18px Arial";
        ctx.fillText(`Câu ${index + 1}/${questions.length}`, 20, 38);
        ctx.fillText(`⏱ ${time}s`, 780, 38);

        ctx.fillStyle = "#000";
        ctx.font = "20px Arial";
        let yEnd = drawWrap(ctx, questions[index].q, 40, 100, 820, 28);

        let y = yEnd + 40;
        for (let i = 0; i < questions[index].choices.length; i++) {
            ctx.strokeStyle = "#334155";
            ctx.strokeRect(40, y, 820, 46);

            if (selected === i) {
                ctx.fillStyle = "#2563eb22";
                ctx.fillRect(40, y, 820, 46);
            }

            ctx.fillStyle = "#000";
            ctx.font = "18px Arial";
            drawWrap(ctx, `${String.fromCharCode(65+i)}. ${questions[index].choices[i]}`, 50, y+30, 780, 22);

            answerBoxes.current.push({ x:40, y, w:820, h:46, index:i });
            y += 70;
        }

        ctx.fillStyle = selected !== null ? "#2563eb" : "#94a3b8";
        ctx.fillRect(650, 470, 200, 50);
        ctx.fillStyle = "#fff";
        ctx.fillText("CÂU TIẾP THEO", 690, 502);

    }, [stage, index, selected, time]);

    /* ================= UI ================= */
    if (stage === "LOGIN")
        return (
            <div style={{ padding:40 }}>
                <h1>THI ONLINE</h1>
                <input value={name} onChange={e=>setName(e.target.value)} placeholder="Nhập họ tên"/>
                <br/><br/>
                <button onClick={join}>XÁC NHẬN</button>
            </div>
        );

    if (stage === "WAIT")
        return <h2 style={{ padding:40 }}>⏳ Đang chờ FTO mở đề...</h2>;

    if (stage === "ESSAY") {
    return (
        <div
            style={{
                minHeight: "100vh",
                background: "#020617",
                color: "#fff",
                display: "flex",
                justifyContent: "center",
                alignItems: "flex-start",
                paddingTop: 40
            }}
        >
            <div
                style={{
                    width: "100%",
                    maxWidth: 900,
                    background: "#020617",
                    padding: 24,
                    boxSizing: "border-box"
                }}
            >
                <h2 style={{ marginBottom: 10 }}>📝 CÂU HỎI TỰ LUẬN</h2>

                <div
                    style={{
                        background: "#0f172a",
                        padding: 16,
                        borderRadius: 8,
                        marginBottom: 16,
                        lineHeight: 1.6
                    }}
                >
                    <p style={{ margin: 0 }}>
                        Bạn đang trong ca trực tuần tra bắn tốc độ tại tuyến đường chính.
                        Bạn vừa dừng một phương tiện vi phạm và đang trong quá trình kiểm tra giấy tờ.
                        Bất ngờ, bộ đàm phát lệnh khẩn cấp:
                        <br />
                        <b>
                            “Yêu cầu tất cả các sĩ quan di chuyển đến hỗ trợ”
                        </b>.
                        <br />
                        Bạn sẽ xử lý tình huống này như thế nào?
                    </p>
                </div>

                <div style={{ marginBottom: 12 }}>
                    ⏱ Thời gian còn lại:{" "}
                    <b>
                        {Math.floor(essayTime / 60)}:
                        {(essayTime % 60).toString().padStart(2, "0")}
                    </b>
                </div>

                <textarea
                    value={essay}
                    onChange={e => setEssay(e.target.value)}
                    placeholder="Nhập câu trả lời của bạn tại đây..."
                    style={{
                        width: "100%",
                        minHeight: 220,
                        maxHeight: 400,
                        resize: "vertical",
                        padding: 12,
                        fontSize: 16,
                        lineHeight: 1.5,
                        borderRadius: 8,
                        border: "1px solid #334155",
                        boxSizing: "border-box",
                        outline: "none"
                    }}
                />

                <div
                    style={{
                        display: "flex",
                        justifyContent: "flex-end",
                        marginTop: 16
                    }}
                >
                    <button
                        onClick={submitEssay}
                        style={{
                            padding: "12px 24px",
                            fontSize: 16,
                            borderRadius: 8,
                            background: "#2563eb",
                            color: "#fff",
                            border: "none",
                            cursor: "pointer"
                        }}
                    >
                        📤 NỘP BÀI
                    </button>
                </div>
            </div>
        </div>
    );
}


    if (stage === "SUBMITTED")
        return <h2 style={{ padding:40 }}>✅ Bài thi đã được nộp.<br/>Vui lòng chờ FTO công bố kết quả.</h2>;

    if (stage === "VIOLATION")
        return <h2 style={{ padding:40, color:"red" }}>❌ Gian lận<br/>{violationReason}</h2>;

    return <canvas ref={canvasRef} width={900} height={540} onClick={click}/>;
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
