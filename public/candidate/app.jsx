const { useState, useEffect, useRef } = React;

// Hàm vẽ text wrap trên canvas
function drawWrap(ctx, text, x, y, maxW, lh) {
    const words = text.split(" ");
    let line = "";
    let yy = y;

    for (let i = 0; i < words.length; i++) {
        const test = line + words[i] + " ";
        const metrics = ctx.measureText(test);
        
        if (metrics.width > maxW && i > 0) {
            ctx.fillText(line.trim(), x, yy);
            line = words[i] + " ";
            yy += lh;
        } else {
            line = test;
        }
    }
    
    if (line.trim()) {
        ctx.fillText(line.trim(), x, yy);
        yy += lh;
    }
    
    return yy;
}

function App() {
    const canvasRef = useRef(null);
    const answerBoxes = useRef([]);

    const [name, setName] = useState("");
    const [stage, setStage] = useState("LOGIN"); // LOGIN | WAIT | EXAM | ESSAY | SUBMITTED | VIOLATION
    const [error, setError] = useState("");

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
        }).catch(err => console.error("Lỗi báo vi phạm:", err));

        if (document.fullscreenElement) {
            document.exitFullscreen().catch(() => {});
        }

        setViolationReason(reason);
        setStage("VIOLATION");
    }

    /* ================= ANTI CHEAT ================= */
    useEffect(() => {
        if (stage !== "EXAM" && stage !== "ESSAY") return;

        const onBlur = () => violation("Thoát khỏi cửa sổ trình duyệt");
        const onVis = () => {
            if (document.hidden) violation("Chuyển tab hoặc ẩn cửa sổ");
        };
        const onFs = () => {
            if (!document.fullscreenElement && (stage === "EXAM" || stage === "ESSAY")) {
                violation("Thoát chế độ toàn màn hình");
            }
        };

        const onContextMenu = (e) => {
            e.preventDefault();
            violation("Click chuột phải");
        };

        const onKeyDown = (e) => {
            // Chặn F12, Ctrl+Shift+I, Ctrl+U
            if (
                e.key === "F12" ||
                (e.ctrlKey && e.shiftKey && e.key === "I") ||
                (e.ctrlKey && e.key === "U") ||
                (e.ctrlKey && e.key === "S") ||
                (e.ctrlKey && e.key === "P")
            ) {
                e.preventDefault();
                violation("Cố gắng mở công cụ developer");
            }
        };

        window.addEventListener("blur", onBlur);
        document.addEventListener("visibilitychange", onVis);
        document.addEventListener("fullscreenchange", onFs);
        document.addEventListener("contextmenu", onContextMenu);
        document.addEventListener("keydown", onKeyDown);

        return () => {
            window.removeEventListener("blur", onBlur);
            document.removeEventListener("visibilitychange", onVis);
            document.removeEventListener("fullscreenchange", onFs);
            document.removeEventListener("contextmenu", onContextMenu);
            document.removeEventListener("keydown", onKeyDown);
        };
    }, [stage]);

    /* ================= TIMER TRẮC NGHIỆM ================= */
    useEffect(() => {
        if (stage !== "EXAM") return;
        
        if (time <= 0) {
            handleNext();
            return;
        }
        
        const t = setTimeout(() => setTime(prev => prev - 1), 1000);
        return () => clearTimeout(t);
    }, [time, stage, index]);

    /* ================= TIMER TỰ LUẬN ================= */
    useEffect(() => {
        if (stage !== "ESSAY") return;
        
        if (essayTime <= 0) {
            submitEssay();
            return;
        }
        
        const t = setTimeout(() => setEssayTime(prev => prev - 1), 1000);
        return () => clearTimeout(t);
    }, [essayTime, stage]);

    /* ================= JOIN EXAM ================= */
    async function join() {
        if (!name.trim()) {
            setError("Vui lòng nhập họ tên của bạn!");
            return;
        }

        setError("");

        try {
            await fetch("/api/join", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name: name.trim() })
            });

            setStage("WAIT");

            // Kiểm tra trạng thái kỳ thi
            const checkInterval = setInterval(async () => {
                try {
                    const s = await fetch("/api/exam/status").then(r => r.json());
                    if (s.started) {
                        clearInterval(checkInterval);
                        startExam();
                    }
                } catch (err) {
                    console.error("Lỗi kiểm tra trạng thái:", err);
                }
            }, 2000);

            // Cleanup nếu component unmount
            return () => clearInterval(checkInterval);
        } catch (err) {
            console.error("Lỗi join:", err);
            setError("Không thể kết nối đến server!");
        }
    }

    /* ================= START EXAM ================= */
    async function startExam() {
        try {
            const res = await fetch("/api/questions?name=" + encodeURIComponent(name.trim()));
            
            if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                throw new Error(errData.message || "Không thể tải đề thi");
            }

            const data = await res.json();

            if (!Array.isArray(data) || data.length === 0) {
                setStage("SUBMITTED");
                return;
            }

            setQuestions(data);
            setAnswers(new Array(data.length).fill(null));
            setIndex(0);
            setSelected(null);
            setTime(60);
            setStage("EXAM");

            // Yêu cầu fullscreen
            try {
                await document.documentElement.requestFullscreen();
            } catch (err) {
                console.warn("Không thể bật fullscreen:", err);
            }
        } catch (err) {
            console.error("Lỗi bắt đầu thi:", err);
            setError(err.message);
            setStage("LOGIN");
        }
    }

    /* ================= SUBMIT MC ================= */
    async function submitMC(finalAnswers) {
        try {
            await fetch("/api/submit", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ 
                    name: name.trim(), 
                    answers: finalAnswers 
                })
            });

            // Chọn câu tự luận ngẫu nhiên
            const q = essayQuestions[Math.floor(Math.random() * essayQuestions.length)];
            setEssayQuestion(q);
            setEssayTime(600);
            setStage("ESSAY");
        } catch (err) {
            console.error("Lỗi nộp trắc nghiệm:", err);
            alert("Có lỗi khi nộp bài. Vui lòng thử lại!");
        }
    }

    /* ================= SUBMIT ESSAY ================= */
    async function submitEssay() {
        try {
            await fetch("/api/submit-essay", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ 
                    name: name.trim(), 
                    essay,
                    question: essayQuestion 
                })
            });

            if (document.fullscreenElement) {
                await document.exitFullscreen().catch(() => {});
            }

            setStage("SUBMITTED");
        } catch (err) {
            console.error("Lỗi nộp tự luận:", err);
            alert("Có lỗi khi nộp bài tự luận. Vui lòng thử lại!");
        }
    }

    /* ================= HANDLE NEXT ================= */
    function handleNext() {
        const updatedAnswers = [...answers];
        updatedAnswers[index] = selected;
        setAnswers(updatedAnswers);
        
        if (index + 1 >= questions.length) {
            // Đã hết câu hỏi -> nộp bài
            submitMC(updatedAnswers);
        } else {
            setSelected(null);
            setIndex(index + 1);
            setTime(60);
        }
    }

    /* ================= CANVAS CLICK ================= */
    function handleCanvasClick(e) {
        if (stage !== "EXAM") return;

        const rect = canvasRef.current.getBoundingClientRect();
        const scaleX = canvasRef.current.width / rect.width;
        const scaleY = canvasRef.current.height / rect.height;
        
        const x = (e.clientX - rect.left) * scaleX;
        const y = (e.clientY - rect.top) * scaleY;

        // Kiểm tra click vào answer boxes
        for (const b of answerBoxes.current) {
            if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) {
                setSelected(b.index);
                return;
            }
        }

        // Kiểm tra click vào nút "CÂU TIẾP THEO"
        if (x >= 650 && x <= 850 && y >= 470 && y <= 520 && selected !== null) {
            handleNext();
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

        // Clear canvas
        ctx.clearRect(0, 0, 900, 540);

        // Background
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, 900, 540);

        // Header
        ctx.fillStyle = "#0f172a";
        ctx.fillRect(0, 0, 900, 60);

        // Title
        ctx.fillStyle = "#ffffff";
        ctx.font = "bold 22px 'Segoe UI', Arial, sans-serif";
        ctx.fillText(`Câu ${index + 1}/${questions.length}`, 30, 40);

        // Timer
        ctx.fillStyle = time <= 10 ? "#ef4444" : "#22c55e";
        ctx.font = "bold 20px 'Segoe UI', Arial, sans-serif";
        ctx.textAlign = "right";
        ctx.fillText(`⏱ ${time}s`, 870, 40);
        ctx.textAlign = "left";

        // Progress bar
        const progressWidth = 840;
        const progressHeight = 6;
        const progressY = 55;
        const progress = ((index + 1) / questions.length) * progressWidth;

        ctx.fillStyle = "#e2e8f0";
        ctx.fillRect(30, progressY, progressWidth, progressHeight);
        
        ctx.fillStyle = "#3b82f6";
        ctx.fillRect(30, progressY, progress, progressHeight);

        // Question
        ctx.fillStyle = "#0f172a";
        ctx.font = "18px 'Segoe UI', Arial, sans-serif";
        let yEnd = drawWrap(ctx, questions[index].q, 30, 100, 840, 30);
        let y = yEnd + 25;

        // Choices
        questions[index].choices.forEach((c, i) => {
            const h = 55;
            const boxY = y;
            
            // Box background
            if (selected === i) {
                ctx.fillStyle = "#eff6ff";
                ctx.fillRect(30, y, 840, h);
                ctx.strokeStyle = "#3b82f6";
                ctx.lineWidth = 2;
            } else {
                ctx.fillStyle = "#ffffff";
                ctx.fillRect(30, y, 840, h);
                ctx.strokeStyle = "#cbd5e1";
                ctx.lineWidth = 1;
            }
            
            ctx.strokeRect(30, y, 840, h);

            // Letter circle
            const circleX = 55;
            const circleY = y + h / 2;
            const circleRadius = 14;

            ctx.beginPath();
            ctx.arc(circleX, circleY, circleRadius, 0, 2 * Math.PI);
            
            if (selected === i) {
                ctx.fillStyle = "#3b82f6";
                ctx.fill();
                ctx.fillStyle = "#ffffff";
            } else {
                ctx.fillStyle = "#e2e8f0";
                ctx.fill();
                ctx.fillStyle = "#0f172a";
            }
            
            ctx.font = "bold 14px 'Segoe UI', Arial, sans-serif";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(String.fromCharCode(65 + i), circleX, circleY);
            ctx.textAlign = "left";
            ctx.textBaseline = "alphabetic";

            // Choice text
            ctx.fillStyle = "#0f172a";
            ctx.font = "16px 'Segoe UI', Arial, sans-serif";
            drawWrap(ctx, c, 85, y + 18, 770, 24);

            answerBoxes.current.push({ x: 30, y: boxY, w: 840, h, index: i });
            y += 75;
        });

        // Next button
        const btnX = 650;
        const btnY = 470;
        const btnW = 220;
        const btnH = 50;

        if (selected !== null) {
            ctx.fillStyle = "#3b82f6";
            ctx.shadowColor = "rgba(59, 130, 246, 0.3)";
            ctx.shadowBlur = 10;
        } else {
            ctx.fillStyle = "#94a3b8";
            ctx.shadowColor = "transparent";
            ctx.shadowBlur = 0;
        }
        
        // Rounded rectangle button
        const radius = 8;
        ctx.beginPath();
        ctx.moveTo(btnX + radius, btnY);
        ctx.lineTo(btnX + btnW - radius, btnY);
        ctx.quadraticCurveTo(btnX + btnW, btnY, btnX + btnW, btnY + radius);
        ctx.lineTo(btnX + btnW, btnY + btnH - radius);
        ctx.quadraticCurveTo(btnX + btnW, btnY + btnH, btnX + btnW - radius, btnY + btnH);
        ctx.lineTo(btnX + radius, btnY + btnH);
        ctx.quadraticCurveTo(btnX, btnY + btnH, btnX, btnY + btnH - radius);
        ctx.lineTo(btnX, btnY + radius);
        ctx.quadraticCurveTo(btnX, btnY, btnX + radius, btnY);
        ctx.closePath();
        ctx.fill();
        ctx.shadowBlur = 0;

        // Button text
        ctx.fillStyle = "#ffffff";
        ctx.font = "bold 18px 'Segoe UI', Arial, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        
        if (index + 1 >= questions.length) {
            ctx.fillText("NỘP BÀI", btnX + btnW / 2, btnY + btnH / 2);
        } else {
            ctx.fillText("CÂU TIẾP THEO →", btnX + btnW / 2, btnY + btnH / 2);
        }
        
        ctx.textAlign = "left";
        ctx.textBaseline = "alphabetic";

        // Hướng dẫn
        if (selected === null) {
            ctx.fillStyle = "#94a3b8";
            ctx.font = "14px 'Segoe UI', Arial, sans-serif";
            ctx.textAlign = "right";
            ctx.fillText("👆 Chọn đáp án để tiếp tục", 640, 460);
            ctx.textAlign = "left";
        }

    }, [stage, index, selected, time, questions]);

    /* ================= RENDER UI ================= */
    if (stage === "LOGIN") {
        return (
            <div style={{
                minHeight: "100vh",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "20px"
            }}>
                <div style={{
                    background: "#1e293b",
                    borderRadius: "20px",
                    padding: "3rem",
                    maxWidth: "450px",
                    width: "100%",
                    textAlign: "center",
                    border: "1px solid rgba(255,255,255,0.1)",
                    boxShadow: "0 20px 60px rgba(0,0,0,0.3)"
                }}>
                    <div style={{ fontSize: "4rem", marginBottom: "1rem" }}>🎓</div>
                    <h1 style={{
                        fontSize: "2rem",
                        fontWeight: 800,
                        marginBottom: "0.5rem",
                        background: "linear-gradient(135deg, #60a5fa, #a78bfa)",
                        WebkitBackgroundClip: "text",
                        WebkitTextFillColor: "transparent"
                    }}>
                        THI ONLINE
                    </h1>
                    <p style={{ color: "#94a3b8", marginBottom: "2rem" }}>
                        Nhập họ tên để bắt đầu bài thi
                    </p>

                    {error && (
                        <div style={{
                            background: "rgba(239,68,68,0.1)",
                            color: "#ef4444",
                            padding: "12px",
                            borderRadius: "8px",
                            marginBottom: "1rem",
                            border: "1px solid rgba(239,68,68,0.2)"
                        }}>
                            ⚠️ {error}
                        </div>
                    )}

                    <input 
                        value={name} 
                        onChange={e => {
                            setName(e.target.value);
                            setError("");
                        }}
                        onKeyPress={e => e.key === "Enter" && join()}
                        placeholder="Nhập họ tên của bạn..."
                        autoFocus
                        style={{
                            width: "100%",
                            padding: "14px 18px",
                            fontSize: "16px",
                            borderRadius: "10px",
                            border: "2px solid rgba(255,255,255,0.1)",
                            background: "#020617",
                            color: "#e2e8f0",
                            outline: "none",
                            marginBottom: "1rem",
                            boxSizing: "border-box"
                        }}
                    />

                    <button 
                        onClick={join}
                        style={{
                            width: "100%",
                            padding: "14px",
                            fontSize: "16px",
                            fontWeight: 600,
                            borderRadius: "10px",
                            border: "none",
                            background: "linear-gradient(135deg, #3b82f6, #2563eb)",
                            color: "white",
                            cursor: "pointer",
                            boxShadow: "0 4px 15px rgba(59,130,246,0.3)"
                        }}
                    >
                        🚀 VÀO PHÒNG THI
                    </button>
                </div>
            </div>
        );
    }

    if (stage === "WAIT") {
        return (
            <div style={{
                minHeight: "100vh",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                padding: "20px"
            }}>
                <div style={{ fontSize: "4rem", marginBottom: "1rem" }}>⏳</div>
                <h2 style={{ color: "#e2e8f0", marginBottom: "0.5rem" }}>
                    Đang chờ giám khảo mở đề...
                </h2>
                <p style={{ color: "#94a3b8" }}>
                    Kỳ thi sẽ tự động bắt đầu khi FTO kích hoạt
                </p>
            </div>
        );
    }

    if (stage === "ESSAY") {
        return (
            <div style={{
                minHeight: "100vh",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "40px 20px"
            }}>
                <div style={{
                    width: "100%",
                    maxWidth: "950px",
                    background: "#1e293b",
                    borderRadius: "20px",
                    padding: "40px",
                    border: "1px solid rgba(255,255,255,0.1)",
                    boxShadow: "0 20px 60px rgba(0,0,0,0.3)"
                }}>
                    <h2 style={{
                        fontSize: "1.8rem",
                        fontWeight: 800,
                        marginBottom: "1.5rem",
                        background: "linear-gradient(135deg, #60a5fa, #a78bfa)",
                        WebkitBackgroundClip: "text",
                        WebkitTextFillColor: "transparent"
                    }}>
                        📝 CÂU HỎI TỰ LUẬN
                    </h2>

                    <div style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        marginBottom: "15px"
                    }}>
                        <span style={{ color: "#94a3b8" }}>Thời gian còn lại:</span>
                        <span style={{
                            color: essayTime <= 60 ? "#ef4444" : "#22c55e",
                            fontWeight: 700,
                            fontSize: "1.2rem"
                        }}>
                            ⏱ {Math.floor(essayTime / 60)}:{(essayTime % 60).toString().padStart(2, '0')}
                        </span>
                    </div>

                    <div style={{
                        background: "#0f172a",
                        borderRadius: "12px",
                        padding: "24px",
                        lineHeight: 1.8,
                        marginBottom: "25px",
                        color: "#e2e8f0",
                        borderLeft: "4px solid #3b82f6",
                        fontSize: "1.05rem"
                    }}>
                        {essayQuestion}
                    </div>

                    <textarea
                        value={essay}
                        onChange={e => setEssay(e.target.value)}
                        placeholder="Nhập câu trả lời của bạn tại đây..."
                        style={{
                            width: "100%",
                            height: "250px",
                            borderRadius: "12px",
                            border: "2px solid rgba(255,255,255,0.1)",
                            padding: "18px",
                            fontSize: "16px",
                            resize: "vertical",
                            outline: "none",
                            background: "#0f172a",
                            color: "#e2e8f0",
                            fontFamily: "'Segoe UI', Arial, sans-serif",
                            lineHeight: 1.6,
                            boxSizing: "border-box"
                        }}
                    />

                    <div style={{
                        display: "flex",
                        justifyContent: "flex-end",
                        marginTop: "25px"
                    }}>
                        <button
                            onClick={submitEssay}
                            style={{
                                padding: "16px 36px",
                                fontSize: "18px",
                                fontWeight: 600,
                                borderRadius: "10px",
                                border: "none",
                                background: "linear-gradient(135deg, #22c55e, #16a34a)",
                                color: "white",
                                cursor: "pointer",
                                boxShadow: "0 4px 15px rgba(34,197,94,0.3)"
                            }}
                        >
                            ✅ NỘP BÀI TỰ LUẬN
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    if (stage === "SUBMITTED") {
        return (
            <div style={{
                minHeight: "100vh",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                padding: "20px"
            }}>
                <div style={{ fontSize: "5rem", marginBottom: "1rem" }}>✅</div>
                <h2 style={{
                    fontSize: "2rem",
                    fontWeight: 800,
                    color: "#22c55e",
                    marginBottom: "0.5rem"
                }}>
                    Bài thi đã nộp!
                </h2>
                <p style={{ color: "#94a3b8", fontSize: "1.1rem" }}>
                    Vui lòng chờ kết quả từ giám khảo
                </p>
            </div>
        );
    }

    if (stage === "VIOLATION") {
        return (
            <div style={{
                minHeight: "100vh",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                padding: "20px"
            }}>
                <div style={{ fontSize: "5rem", marginBottom: "1rem" }}>❌</div>
                <h2 style={{
                    fontSize: "2rem",
                    fontWeight: 800,
                    color: "#ef4444",
                    marginBottom: "0.5rem"
                }}>
                    Bài thi bị khóa
                </h2>
                <p style={{ color: "#94a3b8", fontSize: "1.1rem" }}>
                    Lý do: {violationReason}
                </p>
            </div>
        );
    }

    // EXAM stage - Canvas
    return (
        <div style={{
            minHeight: "100vh",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            padding: "20px",
            background: "#020617"
        }}>
            <canvas 
                ref={canvasRef} 
                width={900} 
                height={540} 
                onClick={handleCanvasClick}
                style={{
                    borderRadius: "12px",
                    boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
                    maxWidth: "100%",
                    height: "auto",
                    cursor: "pointer"
                }}
            />
        </div>
    );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
