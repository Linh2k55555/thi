const { useState, useEffect, useRef } = React;

function App(){
    const canvasRef = useRef(null);

    const [name,setName] = useState("");
    const [stage,setStage] = useState("LOGIN"); 
    // LOGIN | WAIT | EXAM | LOCKED | DONE

    const [questions,setQuestions] = useState([]);
    const [index,setIndex] = useState(0);
    const [answers,setAnswers] = useState([]);
    const [selected,setSelected] = useState(null);
    const [time,setTime] = useState(60);

    /* ================= ANTI CHEAT ================= */
    function cheat(reason){
        if(stage !== "EXAM") return;
        setStage("LOCKED");

        fetch("/api/violation",{
            method:"POST",
            headers:{'Content-Type':'application/json'},
            body:JSON.stringify({name,reason})
        });
    }

    useEffect(()=>{
        const onBlur = () => cheat("Mất focus trình duyệt");
        const onVis = () => document.hidden && cheat("Chuyển tab");
        const onFs = () => !document.fullscreenElement && cheat("Thoát fullscreen");

        window.addEventListener("blur",onBlur);
        document.addEventListener("visibilitychange",onVis);
        document.addEventListener("fullscreenchange",onFs);

        return ()=>{
            window.removeEventListener("blur",onBlur);
            document.removeEventListener("visibilitychange",onVis);
            document.removeEventListener("fullscreenchange",onFs);
        }
    },[stage]);

    /* ================= TIMER ================= */
    useEffect(()=>{
        if(stage !== "EXAM") return;
        if(time <= 0){
            next();
            return;
        }
        const t = setTimeout(()=>setTime(time-1),1000);
        return ()=>clearTimeout(t);
    },[time,stage]);

    /* ================= JOIN ================= */
    async function join(){
        if(!name) return alert("Nhập tên");
        await fetch("/api/join",{method:"POST",headers:{'Content-Type':'application/json'},body:JSON.stringify({name})});
        setStage("WAIT");

        const wait = setInterval(async()=>{
            const s = await fetch("/api/exam/status").then(r=>r.json());
            if(s.started){
                clearInterval(wait);
                startExam();
            }
        },2000);
    }

    async function startExam(){
        const q = await fetch("/api/questions?name="+encodeURIComponent(name)).then(r=>r.json());
        setQuestions(q);
        setStage("EXAM");
        document.documentElement.requestFullscreen();
    }

    /* ================= CANVAS RENDER ================= */
    useEffect(()=>{
        if(stage !== "EXAM") return;
        const ctx = canvasRef.current.getContext("2d");

        ctx.fillStyle="#fff";
        ctx.fillRect(0,0,900,520);
        ctx.fillStyle="#000";
        ctx.font="20px Arial";

        ctx.fillText(`Câu ${index+1}/10 - ${time}s`,30,40);
        ctx.fillText(questions[index].q,30,90);

        questions[index].choices.forEach((c,i)=>{
            ctx.strokeRect(40,200+i*45,20,20);
            if(selected===i) ctx.fillRect(44,204+i*45,12,12);
            ctx.fillText(String.fromCharCode(65+i)+". "+c,80,217+i*45);
        });

        ctx.fillStyle="#2563eb";
        ctx.fillRect(650,420,200,50);
        ctx.fillStyle="#fff";
        ctx.fillText("CÂU TIẾP THEO",680,452);

    },[stage,index,selected,time]);

    /* ================= CLICK ================= */
    function click(e){
        if(stage !== "EXAM") return;
        const x=e.nativeEvent.offsetX;
        const y=e.nativeEvent.offsetY;

        const i = Math.floor((y-200)/45);
        if(x>=40 && x<=500 && i>=0 && i<4){
            setSelected(i);
            return;
        }

        if(x>=650 && x<=850 && y>=420 && y<=470 && selected!==null){
            next();
        }
    }

    function next(){
        const a=[...answers];
        a[index]=selected;
        setAnswers(a);
        setSelected(null);
        setIndex(index+1);
        setTime(60);

        if(index+1 >= questions.length){
            submit(a);
        }
    }

    async function submit(ans){
        await fetch("/api/submit",{
            method:"POST",
            headers:{'Content-Type':'application/json'},
            body:JSON.stringify({name,answers:ans})
        });
        setStage("DONE");
    }

    /* ================= UI ================= */
    if(stage==="LOGIN")
        return <div style={{padding:40}}>
            <h1>THI ONLINE</h1>
            <input value={name} onChange={e=>setName(e.target.value)} placeholder="Nhập họ tên"/>
            <br/><br/>
            <button onClick={join}>XÁC NHẬN</button>
        </div>

    if(stage==="WAIT")
        return <h2 style={{padding:40}}>⏳ Đang chờ giám khảo mở đề...</h2>

    if(stage==="LOCKED")
        return <h2 style={{padding:40,color:"red"}}>
            ⚠️ BÀI THI ĐÃ BỊ KHÓA DO GIAN LẬN
        </h2>

    if(stage==="DONE")
        return <h2 style={{padding:40}}>
            ✅ Nộp bài thành công – vui lòng chờ công bố kết quả
        </h2>

    return <canvas ref={canvasRef} width={900} height={520} onClick={click}/>
}

ReactDOM.createRoot(document.getElementById("root")).render(<App/>);
