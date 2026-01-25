const { useState, useEffect, useRef } = React;

/* ===== VẼ TEXT TỰ XUỐNG DÒNG (CANVAS) ===== */
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
    // LOGIN | WAIT | EXAM | SUBMITTED | VIOLATION

    const [questions, setQuestions] = useState([]);
    const [index, setIndex] = useState(0);
    const [answers, setAnswers] = useState([]);
    const [selected, setSelected] = useState(null);
    const [time, setTime] = useState(60);

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

    /* ================= ANTI CHEAT (CHỈ KHI THI) ================= */
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

    /* ================= TIMER ================= */
    useEffect(() => {
        if (stage !== "EXAM") return;

        if (time <= 0) {
            next();
            return;
        }

        const t = setTimeout(() => setTime(time - 1), 1000);
        return () => clearTimeout(t);
    }, [time, stage]);

    /* ================= JOIN ================= */
    async function join() {
        if (!name) {
            alert("Vui lòng nhập họ tên");
            return;
        }

        if (localStorage.getItem("done_" + name)) {
            setStage("SUBMITTED");
            return;
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

        if (!Array.isArray(data) || data.length === 0) {
            setStage("SUBMITTED");
            return;
        }

        setQuestions(data);
        setStage("EXAM");
        document.documentElement.requestFullscreen();
    }

    /* ================= NỘP BÀI ================= */
    async function submit(a) {
        await fetch("/api/submit", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name, answers: a })
        });

        localStorage.setItem("done_" + name, "1");

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
            submit(a);
        }
    }

    /* ================= CLICK ================= */
    function click(e) {
        if (stage !== "EXAM") return;

        const x = e.nativeEvent.offsetX;
        const y = e.nativeEvent.offsetY;

        for (let i = 0; i < answerBoxes.current.length; i++) {
            const b = answerBoxes.current[i];
            if (
                x >= b.x &&
                x <= b.x + b.w &&
                y >= b.y &&
                y <= b.y + b.h
            ) {
                setSelected(b.index);
                return;
            }
        }

        if (
            x >= 650 && x <= 850 &&
            y >= 470 && y <= 520 &&
            selected !== null
        ) {
            next();
        }
    }

    /* ================= CANVAS RENDER ================= */
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

        // Header
        ctx.fillStyle = "#0f172a";
        ctx.fillRect(0, 0, 900, 60);
        ctx.fillStyle = "#ffffff";
        ctx.font = "18px Arial";
        ctx.fillText("Câu " + (index + 1) + "/10", 20, 38);
        ctx.fillText("⏱ " + time + "s", 780, 38);

        // Question
        ctx.fillStyle = "#000000";
        ctx.font = "20px Arial";
        let yEnd = drawWrap(ctx, questions[index].q, 40, 100, 820, 28);

        // Answers
        let y = yEnd + 40;

        for (let i = 0; i < questions[index].choices.length; i++) {
            const h = 46;

            ctx.strokeStyle = "#334155";
            ctx.strokeRect(40, y, 820, h);

            if (selected === i) {
                ctx.fillStyle = "#2563eb22";
                ctx.fillRect(40, y, 820, h);
            }

            ctx.fillStyle = "#000000";
            ctx.font = "18px Arial";
            drawWrap(
                ctx,
                String.fromCharCode(65 + i) + ". " + questions[index].choices[i],
                50,
                y + 30,
                780,
                22
            );

            answerBoxes.current.push({
                x: 40,
                y: y,
                w: 820,
                h: h,
                index: i
            });

            y += 70;
        }

        // Next button
        ctx.fillStyle = selected !== null ? "#2563eb" : "#94a3b8";
        ctx.fillRect(650, 470, 200, 50);
        ctx.fillStyle = "#ffffff";
        ctx.font = "18px Arial";
        ctx.fillText("CÂU TIẾP THEO", 690, 502);

    }, [stage, index, selected, time, questions]);

    /* ================= UI ================= */
    if (stage === "LOGIN") {
        return (
            <div style={{ padding: 40 }}>
                <h1>THI ONLINE</h1>
                <input
                    value={name}
                    onChange={e => setName(e.target.value)}
                    placeholder="Nhập họ tên"
                />
                <br /><br />
                <button onClick={join}>XÁC NHẬN</button>
            </div>
        );
    }

    if (stage === "WAIT") {
        return <h2 style={{ padding: 40 }}>⏳ Đang chờ giám khảo mở đề...</h2>;
    }

    if (stage === "SUBMITTED") {
        return (
            <h2 style={{ padding: 40 }}>
                ✅ Bài thi đã được nộp.
                <br />
                Vui lòng chờ giám khảo công bố kết quả.
            </h2>
        );
    }

    if (stage === "VIOLATION") {
        return (
            <h2 style={{ padding: 40, color: "red" }}>
                ❌ Bài thi đã bị khóa do gian lận
                <br />
                Lý do: {violationReason}
            </h2>
        );
    }

    return (
        <canvas
            ref={canvasRef}
            width={900}
            height={540}
            onClick={click}
        />
    );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
